type TraceEvent =
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
      timestamp: number;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: unknown;
      timestamp: number;
    }
  | {
      type: "tool-error";
      toolCallId?: string;
      toolName?: string;
      error: string;
      timestamp: number;
    }
  | {
      type: "tool-output-denied";
      toolCallId: string;
      toolName: string;
      timestamp: number;
    };

export type AgentTrace = {
  id: string;
  prompt: string;
  model: string;
  sandboxId: string;
  startedAt: number;
  finishedAt?: number;
  events: TraceEvent[];
};

type TraceStore = {
  traces: Map<string, AgentTrace>;
  order: string[];
};

const MAX_TRACES = 25;
const MAX_SERIALIZED_LENGTH = 4000;

const globalForTraces = globalThis as typeof globalThis & {
  __agentTraceStore?: TraceStore;
};

const traceStore: TraceStore =
  globalForTraces.__agentTraceStore ?? {
    traces: new Map<string, AgentTrace>(),
    order: [],
  };

globalForTraces.__agentTraceStore = traceStore;

function trimIfNeeded(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_SERIALIZED_LENGTH) {
      return value;
    }
    return `${serialized.slice(0, MAX_SERIALIZED_LENGTH)}... [truncated]`;
  } catch {
    return String(value);
  }
}

function enforceLimit() {
  while (traceStore.order.length > MAX_TRACES) {
    const oldest = traceStore.order.shift();
    if (oldest) {
      traceStore.traces.delete(oldest);
    }
  }
}

export function startTrace(params: {
  id: string;
  prompt: string;
  model: string;
  sandboxId: string;
}) {
  const trace: AgentTrace = {
    id: params.id,
    prompt: params.prompt,
    model: params.model,
    sandboxId: params.sandboxId,
    startedAt: Date.now(),
    events: [],
  };

  traceStore.traces.set(params.id, trace);
  traceStore.order.push(params.id);
  enforceLimit();

  return trace;
}

export function appendTraceEvent(traceId: string, event: TraceEvent) {
  const trace = traceStore.traces.get(traceId);
  if (!trace) {
    return;
  }

  if (event.type === "tool-call") {
    trace.events.push({ ...event, input: trimIfNeeded(event.input) });
    return;
  }

  if (event.type === "tool-result") {
    trace.events.push({ ...event, output: trimIfNeeded(event.output) });
    return;
  }

  trace.events.push(event);
}

export function finishTrace(traceId: string) {
  const trace = traceStore.traces.get(traceId);
  if (!trace) {
    return;
  }

  trace.finishedAt = Date.now();
}

export function getTrace(traceId: string) {
  return traceStore.traces.get(traceId) ?? null;
}
