import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // 构造简化的对话输入：用户与助手轮次
    const prompt = messages.map((m: any) => `${m.role || "user"}: ${m.content || ""}`).join("\n");

    const model = process.env.ANICCA_DEFAULT_MODEL || "gpt-4o-mini";
    const temperature = 0.7;

    const res = await openai.responses.create({
      model,
      input: prompt,
      temperature,
      max_output_tokens: 512
    });

    // 尝试多版本兼容解析
    const text = res.output_parsed
      ? String(res.output_parsed)
      : res.output?.[0]?.content?.[0]?.text || "";

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("/api/chat error", { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: "chat_failed" }, { status: 500 });
  }
}


