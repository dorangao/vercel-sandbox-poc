"use client";

import { type CSSProperties, useState } from "react";

const samplePrompts = [
  {
    title: "Hacker News Top Story",
    prompt: "Get the top Hacker News story title and URL.",
  },
  {
    title: "Math Check",
    prompt: "What is 44 x 44? Show the result.",
  },
  {
    title: "Weather Snapshot",
    prompt:
      "Fetch the current weather for Tokyo using a public API and summarize it in one sentence.",
  },
  {
    title: "CSV Quick Parse",
    prompt:
      "Given this CSV: name,score\\nAva,91\\nMilo,86\\nZoe,99\\nReturn the highest scorer.",
  },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [isTraceLoading, setIsTraceLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();

    if (!trimmed) {
      setError("Add a prompt to run in the sandbox.");
      setResponse(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);
    setTraceId(null);
    setTrace(null);
    setTraceError(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const nextTraceId = res.headers.get("x-trace-id");
      if (nextTraceId) {
        setTraceId(nextTraceId);
      }

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = (await res.json()) as { error?: string };
          setError(data.error || "Sandbox execution failed.");
        } else {
          const text = await res.text();
          setError(text || "Sandbox execution failed.");
        }
        return;
      }

      if (!res.body) {
        setError("Streaming response unavailable in this browser.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        streamedText += decoder.decode(value, { stream: true });
        setResponse(streamedText);
      }

      streamedText += decoder.decode();
      setResponse(streamedText || "No response returned.");
    } catch (err) {
      console.error(err);
      setError("Request failed. Check the server logs for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadTrace = async () => {
    if (!traceId) {
      return;
    }

    setIsTraceLoading(true);
    setTrace(null);
    setTraceError(null);

    try {
      const res = await fetch(`/api/agent/traces/${traceId}`);
      const data = (await res.json()) as Record<string, unknown> & {
        error?: string;
      };

      if (!res.ok) {
        setTraceError(data.error || "Trace not available.");
        return;
      }

      setTrace(data);
    } catch (err) {
      console.error(err);
      setTraceError("Failed to load trace.");
    } finally {
      setIsTraceLoading(false);
    }
  };

  return (
    <div className="page-background relative min-h-screen overflow-hidden">
      <div className="grid-overlay pointer-events-none absolute inset-0 opacity-40" />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-14 md:px-10">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div
            className="space-y-4 animate-rise"
            style={{ "--delay": "0.05s" } as CSSProperties}
          >
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_18px_rgba(233,115,46,0.7)] animate-float" />
              Vercel Sandbox POC
            </div>
            <h1 className="font-display text-4xl leading-tight text-slate-900 md:text-5xl">
              Run AI-generated code without risking your app.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 md:text-lg">
              An AI agent writes JavaScript, spins up a microVM, and executes the
              code in isolation. You get the answer, the sandbox gets wiped.
            </p>
          </div>
          <div
            className="panel animate-rise rounded-2xl px-5 py-4 text-sm text-slate-600"
            style={{ "--delay": "0.12s" } as CSSProperties}
          >
            <div className="font-display text-base text-slate-900">
              Runtime: node22
            </div>
            <div>Timeout: 30s per sandbox</div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section
            className="panel animate-rise rounded-3xl p-6 md:p-8"
            style={{ "--delay": "0.18s" } as CSSProperties}
          >
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <h2 className="font-display text-2xl text-slate-900">
                  Prompt the agent
                </h2>
                <p className="text-sm text-slate-600">
                  Describe the task. The agent can fetch data, calculate,
                  transform inputs, or run scripts inside the sandbox.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Request
                </label>
                <textarea
                  className="min-h-[170px] w-full resize-none rounded-2xl border border-slate-200/70 bg-white/70 p-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
                  placeholder="Example: Fetch the top story on Hacker News and return the title + URL."
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {samplePrompts.map((sample) => (
                  <button
                    key={sample.title}
                    type="button"
                    className="rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-medium text-slate-700 transition hover:border-[var(--accent)] hover:text-slate-900"
                    onClick={() => setPrompt(sample.prompt)}
                  >
                    {sample.title}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(233,115,46,0.35)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Running in sandbox..." : "Run in Sandbox"}
                </button>
                <div className="text-xs text-slate-500">
                  Sandbox filesystem resets after execution.
                </div>
              </div>
            </form>
          </section>

          <aside
            className="panel animate-rise rounded-3xl p-6 md:p-8"
            style={{ "--delay": "0.24s" } as CSSProperties}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl text-slate-900">
                Execution Output
              </h2>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                JSON
              </span>
            </div>
            <div
              className="min-h-[260px] rounded-2xl border border-slate-200/70 bg-white/70 p-4 font-mono text-sm text-slate-700"
              aria-live="polite"
            >
              {isLoading && (
                <p className="text-slate-500">Sandbox spinning up...</p>
              )}
              {!isLoading && !response && !error && (
                <p className="text-slate-500">
                  Output will appear here after execution.
                </p>
              )}
              {!isLoading && error && (
                <p className="text-rose-600">{error}</p>
              )}
              {!isLoading && response && (
                <pre className="whitespace-pre-wrap">{response}</pre>
              )}
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)]" />
                <p>
                  Each request creates an ephemeral microVM to contain the
                  execution.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)]" />
                <p>
                  Package installs and filesystem writes are scoped to the
                  sandbox.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)]" />
                <p>
                  The VM is disposed automatically after the response returns.
                </p>
              </div>
            </div>
            {traceId && (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200/70 bg-white/70 p-4 text-xs text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    Trace ID: <span className="font-mono">{traceId}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleLoadTrace}
                    disabled={isTraceLoading}
                    className="rounded-full border border-slate-200/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:border-[var(--accent)] hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTraceLoading ? "Loading..." : "Load Trace"}
                  </button>
                </div>
                {traceError && (
                  <p className="mt-3 text-rose-600">{traceError}</p>
                )}
                {trace && (
                  <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-700">
                    {JSON.stringify(trace, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
