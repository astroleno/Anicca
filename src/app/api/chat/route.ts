import { NextRequest, NextResponse } from "next/server";
import { readOutputText } from "@/lib/openai/readOutputText";
import { getDefaultModel, openai } from "@/lib/openai/client";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
import { normalizeSummary } from "@/chat/summary";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model: modelFromBody, temperature: tempFromBody } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // 构造简化的对话输入：用户与助手轮次
    const prompt = messages.map((m: any) => `${m.role || "user"}: ${m.content || ""}`).join("\n");

    const model = getDefaultModel(modelFromBody);
    const temperature = typeof tempFromBody === 'number' ? tempFromBody : 0.7;

    const res = await openai.responses.create({
      model,
      input: prompt,
      temperature,
      max_output_tokens: 1024
    });

    const text = readOutputText(res);
    if (!text) {
      return NextResponse.json(
        { error: "invalid_model_output", details: "chat text missing from provider response" },
        { status: 502 }
      );
    }

    const summary = normalizeSummary(text.slice(0, 30));

    return NextResponse.json({ text, summary });
  } catch (error: any) {
    console.error("/api/chat error", { message: error?.message, stack: error?.stack });
    const failure = describeProviderFailure(error);
    return NextResponse.json({ error: "chat_failed", details: failure.details }, { status: failure.status });
  }
}
