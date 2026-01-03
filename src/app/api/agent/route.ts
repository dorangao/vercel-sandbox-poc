import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Sandbox } from "@vercel/sandbox";
import {
  ToolLoopAgent,
  stepCountIs,
  tool,
  gateway,
  zodSchema,
  createTextStreamResponse,
} from "ai";
import { z } from "zod";
import {
  appendTraceEvent,
  finishTrace,
  startTrace,
} from "@/lib/agent-traces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
});

const toolInputSchema = z.object({
  code: z.string().min(1).max(6000),
  packages: z
    .array(z.string().regex(/^[a-zA-Z0-9@/._-]+$/))
    .max(5)
    .optional(),
});

const fetchJsonInputSchema = z.object({
  url: z.string().url(),
});

const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

function isPrivateHostname(hostname: string) {
  if (PRIVATE_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return true;
  }

  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    const [a, b] = octets;

    if (a === 10 || a === 127 || a === 0) {
      return true;
    }

    if (a === 192 && b === 168) {
      return true;
    }

    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }

    if (a === 169 && b === 254) {
      return true;
    }
  }

  if (hostname.includes(":")) {
    const lower = hostname.toLowerCase();
    if (
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd")
    ) {
      return true;
    }
  }

  return false;
}

async function fetchJson(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error("Private or local addresses are not allowed.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(parsed.toString(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const text = await response.text();
    if (text.length > 200_000) {
      throw new Error("Response too large to parse safely.");
    }

    try {
      const data = JSON.parse(text);
      return {
        url: parsed.toString(),
        status: response.status,
        data,
      };
    } catch {
      throw new Error("Response was not valid JSON.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Expected { prompt: string }." },
      { status: 400 },
    );
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: "Missing AI_GATEWAY_API_KEY. Set it in your env first." },
      { status: 500 },
    );
  }

  const traceId = randomUUID();
  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create({
      runtime: "node22",
      timeout: 30_000,
    });
    const activeSandbox = sandbox;
    if (!activeSandbox) {
      throw new Error("Sandbox unavailable.");
    }

    startTrace({
      id: traceId,
      prompt: parsed.data.prompt,
      model: "openai/gpt-5-nano",
      sandboxId: activeSandbox.sandboxId,
    });

    const agent = new ToolLoopAgent({
      model: gateway("openai/gpt-5-nano"),
      instructions: [
        "You are a coding assistant that can execute JavaScript in a locked sandbox.",
        "Use fetchJson for direct JSON API lookups when possible.",
        "Use runInSandbox for calculations, data transforms, or when you need npm packages.",
        "If you execute code, print the final answer with console.log and keep outputs concise.",
        "Avoid reading environment variables or the filesystem unless the task truly requires it.",
      ].join(" "),
      tools: {
        fetchJson: tool({
          description:
            "Fetch JSON from a public HTTP endpoint without running code in the sandbox.",
          inputSchema: zodSchema(fetchJsonInputSchema),
          execute: async ({ url }) => fetchJson(url),
        }),
        runInSandbox: tool({
          description:
            "Install optional npm packages and execute JavaScript in a sandboxed Node.js runtime.",
          inputSchema: zodSchema(toolInputSchema),
          execute: async ({ code, packages }) => {
            const cwd = "/vercel/sandbox";

            if (packages?.length) {
              await activeSandbox.runCommand("npm", ["init", "-y"], { cwd });
              const install = await activeSandbox.runCommand(
                "npm",
                ["install", "--no-fund", "--no-audit", "--silent", ...packages],
                { cwd },
              );
              const installStdErr = (await install.stderr()).trim();
              if (install.exitCode !== 0) {
                return `Package install failed: ${installStdErr || "unknown error"}`;
              }
            }

            const result = await activeSandbox.runCommand(
              "node",
              ["-e", code],
              { cwd },
            );
            const stdout = (await result.stdout()).trim();
            const stderr = (await result.stderr()).trim();

            if (result.exitCode !== 0) {
              return `Execution error: ${stderr || stdout || "unknown error"}`;
            }

            return stdout || stderr || "No output produced.";
          },
        }),
      },
      stopWhen: stepCountIs(6),
    });

    const result = await agent.stream({
      prompt: parsed.data.prompt,
    });

    const textStream = new ReadableStream<string>({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(part.text);
            }

            if (part.type === "tool-call") {
              appendTraceEvent(traceId, {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
                timestamp: Date.now(),
              });
            }

            if (part.type === "tool-result") {
              appendTraceEvent(traceId, {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: part.output,
                timestamp: Date.now(),
              });
            }

            if (part.type === "tool-error") {
              appendTraceEvent(traceId, {
                type: "tool-error",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                error:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
                timestamp: Date.now(),
              });
            }

            if (part.type === "tool-output-denied") {
              appendTraceEvent(traceId, {
                type: "tool-output-denied",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                timestamp: Date.now(),
              });
            }
          }
        } catch (error) {
          appendTraceEvent(traceId, {
            type: "tool-error",
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
        } finally {
          finishTrace(traceId);
          controller.close();
          try {
            await activeSandbox.stop();
          } catch (error) {
            console.error("Failed to stop sandbox:", error);
          }
        }
      },
      async cancel() {
        finishTrace(traceId);
        try {
          await activeSandbox.stop();
        } catch (error) {
          console.error("Failed to stop sandbox:", error);
        }
      },
    });

    return createTextStreamResponse({
      textStream,
      headers: {
        "X-Trace-Id": traceId,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Sandbox agent failed:", error);
    finishTrace(traceId);
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (stopError) {
        console.error("Failed to stop sandbox:", stopError);
      }
    }
    return NextResponse.json(
      { error: "Agent failed to run in sandbox." },
      { status: 500 },
    );
  }
}
