import { NextRequest, NextResponse } from "next/server";
import { getDialecticModel, getDialecticOpenAiClient } from "@/lib/openai/client";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
import { createGenerationTrace, type GenerationTrace } from "@/features/dialectic/server/generationTrace";
import { readThinkingSpaceRequest } from "@/features/perspectives/model";
import { polarityPerspective } from "@/features/perspectives/polarity";
import { analyzePolarityOutput, buildPolarityPrompt } from "@/features/perspectives/polarityGeneration";
import { DIALECTIC_INPUT_MAX_LENGTH } from "@/features/dialectic/api";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const userText = typeof body.userText === "string" ? body.userText.trim() : "";
  const space = readThinkingSpaceRequest(body.perspective);
  const axis = space?.axes.find(item => item.id === body.axisId);
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
  if (!userText || Array.from(userText).length > DIALECTIC_INPUT_MAX_LENGTH) {
    return NextResponse.json({ requestId, error: "invalid_input", details: "userText must contain 1–2000 characters" }, { status: 400 });
  }
  if (!space || !axis) return NextResponse.json({ requestId, error: "polarity_axis_missing", details: "请选择当前思考空间中的一条维度。" }, { status: 400 });
  let trace: GenerationTrace | undefined;
  try {
    trace = createGenerationTrace("polarities", getDialecticModel(), req.signal);
    const client = getDialecticOpenAiClient();
    const input = { userText, contextMessages: body.contextMessages, space, axis, meaning: body.meaningVersion === 1 };
    const output = await trace.generate("polarities", { client, input: buildPolarityPrompt(input), maxOutputTokens: 2200 });
    let result = analyzePolarityOutput(output.text, axis, input.meaning);
    trace.check("polarities", Boolean(result.negative && result.positive));
    if (!result.negative || !result.positive) {
      const repair = await trace.generate("polarities", { client,
        input: buildPolarityPrompt({ ...input, repair: { output: output.text, errors: result.errors } }), maxOutputTokens: 2200 }, true);
      result = analyzePolarityOutput(repair.text, axis, input.meaning);
      trace.check("polarities", Boolean(result.negative && result.positive), true);
    }
    if (!result.negative || !result.positive) {
      trace.finish("invalid_output");
      return NextResponse.json({ requestId, error: "invalid_model_output", details: "polarity output failed contract after one repair" }, { status: 502 });
    }
    req.signal.throwIfAborted();
    trace.finish("success");
    return NextResponse.json({ requestId, axis,
      negative: { ...result.negative, perspective: polarityPerspective(space, axis.id, -1, result.spatial.negative) },
      positive: { ...result.positive, perspective: polarityPerspective(space, axis.id, 1, result.spatial.positive) } });
  } catch (error) {
    if (req.signal.aborted) return NextResponse.json({ requestId, error: "cancelled" }, { status: 499 });
    const failure = describeProviderFailure(error);
    return NextResponse.json({ requestId, error: "polarities_failed", details: failure.details }, { status: failure.status });
  } finally {
    trace?.finish("failed");
  }
}
