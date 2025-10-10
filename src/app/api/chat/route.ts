import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model: modelFromBody, temperature: tempFromBody } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // 构造简化的对话输入：用户与助手轮次
    const prompt = messages.map((m: any) => `${m.role || "user"}: ${m.content || ""}`).join("\n");

    const model = modelFromBody || process.env.ANICCA_DEFAULT_MODEL || "gpt-4o-mini";
    const temperature = typeof tempFromBody === 'number' ? tempFromBody : 0.7;

    // 调用 OpenAI Responses API：统一在服务端持有密钥
    const res = await openai.responses.create({
      model,
      input: prompt,
      temperature,
      max_output_tokens: 1024
    });

    // 兼容解析不同 SDK 响应结构，提取文本
    const text = res.output_parsed
      ? String(res.output_parsed)
      : (res.output && Array.isArray(res.output)
          ? (res.output[0]?.content?.[0]?.text || "")
          : "");

    // 基于文本生成一个简易单行摘要（≤30 字），用于前端写回节点 meta
    // 说明：这里与客户端的 normalizeSummary 逻辑保持一致性（去除末尾符号），避免服务端引入路径别名带来的耦合
    const pickHead = (s: string, n: number) => (s ? s.slice(0, n) : "");
    const normalize = (s: string) => s.replace(/[。！!。\s]+$/g, "");
    const summary = normalize(pickHead(text, 30));

    // 返回结构化结果，后续可扩展 meta 字段
    return NextResponse.json({ text, summary });
  } catch (error: any) {
    console.error("/api/chat error", { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: "chat_failed" }, { status: 500 });
  }
}


