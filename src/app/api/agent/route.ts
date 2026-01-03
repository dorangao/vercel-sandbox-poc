import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { ToolLoopAgent, stepCountIs, tool, gateway, zodSchema } from "ai";
import { z } from "zod";

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

    const agent = new ToolLoopAgent({
      model: gateway("openai/gpt-5-nano"),
      instructions: [
        "You are a coding assistant that can execute JavaScript in a locked sandbox.",
        "Use the runInSandbox tool to execute code when calculation or data fetching is needed.",
        "Always print the final answer with console.log and keep outputs concise.",
        "Avoid reading environment variables or the filesystem unless the task truly requires it.",
      ].join(" "),
      tools: {
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

    const result = await agent.generate({
      prompt: parsed.data.prompt,
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error("Sandbox agent failed:", error);
    return NextResponse.json(
      { error: "Agent failed to run in sandbox." },
      { status: 500 },
    );
  } finally {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (error) {
        console.error("Failed to stop sandbox:", error);
      }
    }
  }
}
