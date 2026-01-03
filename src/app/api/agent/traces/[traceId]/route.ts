import { NextResponse } from "next/server";
import { getTrace } from "@/lib/agent-traces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ traceId: string }> | { traceId: string } },
) {
  const { traceId } = await params;
  const trace = getTrace(traceId);

  if (!trace) {
    return NextResponse.json({ error: "Trace not found." }, { status: 404 });
  }

  return NextResponse.json(trace);
}
