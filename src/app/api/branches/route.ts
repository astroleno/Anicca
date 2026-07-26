import { NextRequest, NextResponse } from "next/server";
import { getDefaultModel } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { parseFirstJsonObject } from "@/lib/openai/parseFirstJsonObject";
import { describeProviderFailure } from "@/lib/openai/providerErrors";
import { normalizeDialecticLabel, normalizeDialecticSummary } from "@/features/dialectic/outputContract";

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

function getErrorInfo(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
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
    summary: normalizeDialecticSummary(candidate.summary),
    label: normalizeDialecticLabel(candidate.label, stance === "正" ? "正向" : "反向", stance),
    stance
  };
}

function buildBranchesPrompt(userText: string, contextMessages: unknown): string {
  const serializedContext = serializeContextMessages(contextMessages);
  const sections = [
    "你负责为同一个问题生成一对结构化的正反分支。",
    "只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。",
    "schema={\"thesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"正\"},\"antithesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"反\"}}",
    "summary 必须是单行摘要，label 必须是 8 个字符以内的中文短标签；不要在 label 中写解释、冒号、下划线或长短语。",
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
  } catch (error: unknown) {
    console.error("/api/branches error", { requestId, ...getErrorInfo(error) });
    const failure = describeProviderFailure(error);
    return NextResponse.json(
      {
        requestId,
        error: "branches_failed",
        details: failure.details
      },
      { status: failure.status }
    );
  }
}
