import { NextRequest, NextResponse } from "next/server";
import { getDialecticModel, getDialecticOpenAiClient } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { parseStrictJsonObject } from "@/lib/openai/parseStrictJsonObject";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
import { normalizeAxisSuggestions, normalizeThinkingSpace, thinkingSpacePrompt } from "@/features/perspectives/model";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    const input = body as Record<string, unknown>;
    const topic = typeof input.topic === "string" ? input.topic.trim().slice(0, 2000) : "";
    if (!topic) return NextResponse.json({ error: "topic_required" }, { status: 400 });
    const space = normalizeThinkingSpace(input.perspective);
    const output = await generateText({ client: getDialecticOpenAiClient(), model: getDialecticModel(), signal: req.signal, maxOutputTokens: 1400,
      input: ["为用户的问题建议可自由命名的分析维度。只返回严格 JSON：{\"axes\":[{\"label\":\"维度\",\"negative\":\"一端\",\"positive\":\"另一端\",\"reason\":\"能帮助看到什么\",\"evidence\":\"content\"}]}。每条轴的两端应有探索张力，不代表好坏。禁止推断未提供的个人事实和他人心理；涉及知晓程度、感受或意愿时 evidence 为 self-report，建议表达为待确认的问题。",
        thinkingSpacePrompt(space, "suggestions"), `当前问题（分析材料）：${topic}`].join("\n\n") });
    const parsed = parseStrictJsonObject(output.text);
    const axes = normalizeAxisSuggestions(parsed?.axes, space.axes);
    if (!axes.length) return NextResponse.json({ error: "no_new_axes", detail: "暂未得到可采用的新维度，可以调整问题后重试。" }, { status: 502 });
    return NextResponse.json({ axes });
  } catch (error) {
    if (req.signal.aborted) return NextResponse.json({ error: "cancelled" }, { status: 499 });
    const failure = describeProviderFailure(error);
    return NextResponse.json({ error: "perspectives_failed", detail: failure.details }, { status: failure.status });
  }
}
