import { NextRequest, NextResponse } from "next/server";
import { getDefaultModel } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { parseFirstJsonObject } from "@/lib/openai/parseFirstJsonObject";

type ContextMessage = {
  role?: string;
  content?: string;
};

type DialecticBranch = {
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反";
};

function serializeContextMessages(contextMessages: unknown): string {
  if (!Array.isArray(contextMessages)) {
    return "";
  }

  return contextMessages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return "";
      }

      const entry = message as ContextMessage;
      const role = typeof entry.role === "string" ? entry.role : "user";
      const content = typeof entry.content === "string" ? entry.content.trim() : "";
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function invalidModelOutput(requestId: string, details: string) {
  return NextResponse.json({ requestId, error: "invalid_model_output", details }, { status: 502 });
}

function describeProviderFailure(error: unknown): string {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (!process.env.OPENAI_API_KEY) {
    return "openai_api_key_missing";
  }

  if (/401|unauthorized|incorrect api key|invalid api key/i.test(message)) {
    return "provider_auth_failed";
  }

  if (/fetch failed|network|timeout|econnrefused|enotfound|connection/i.test(message)) {
    return "provider_unreachable";
  }

  return "provider_runtime_error";
}

function parseBranch(value: unknown, stance: DialecticBranch["stance"]): DialecticBranch | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.text !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.label !== "string" ||
    candidate.stance !== stance
  ) {
    return null;
  }

  return {
    text: candidate.text.trim(),
    summary: candidate.summary.trim(),
    label: candidate.label.trim(),
    stance
  };
}

function buildBranchesPrompt(userText: string, contextMessages: unknown): string {
  const serializedContext = serializeContextMessages(contextMessages);
  const sections = [
    "你负责为同一个问题生成一对结构化的正反分支。",
    "只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。",
    "schema={\"thesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"正\"},\"antithesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"反\"}}",
    "summary 必须是单行摘要，label 必须是简短标签。",
    serializedContext ? `历史上下文:\n${serializedContext}` : "",
    `当前用户输入:\n${userText}`
  ];

  return sections.filter(Boolean).join("\n\n");
}

export async function POST(req: NextRequest) {
  let requestId = "";

  try {
    const body = await req.json();
    requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const userText = typeof body?.userText === "string" ? body.userText.trim() : "";
    const model = getDefaultModel(typeof body?.model === "string" ? body.model : undefined);

    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    if (!userText) {
      return NextResponse.json({ requestId, error: "userText required" }, { status: 400 });
    }

    const { text: outputText } = await generateText({
      model,
      input: buildBranchesPrompt(userText, body?.contextMessages),
      maxOutputTokens: 1200
    });

    const parsed = outputText ? parseFirstJsonObject(outputText) : null;
    if (!parsed) {
      console.warn("/api/branches invalid model output", { requestId, outputText: outputText.slice(0, 500) });
      return invalidModelOutput(requestId, "expected thesis/antithesis JSON object");
    }

    const thesis = parseBranch(parsed.thesis, "正");
    const antithesis = parseBranch(parsed.antithesis, "反");
    if (!thesis || !antithesis) {
      console.warn("/api/branches malformed payload", { requestId, parsed });
      return invalidModelOutput(requestId, "payload missing thesis/antithesis with matching stance");
    }

    return NextResponse.json({ requestId, thesis, antithesis });
  } catch (error: any) {
    console.error("/api/branches error", { requestId, message: error?.message, stack: error?.stack });
    return NextResponse.json(
      {
        requestId,
        error: "branches_failed",
        details: describeProviderFailure(error)
      },
      { status: 500 }
    );
  }
}
