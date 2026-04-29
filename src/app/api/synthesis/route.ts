import { NextRequest, NextResponse } from "next/server";
import { getDefaultModel } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { parseFirstJsonObject } from "@/lib/openai/parseFirstJsonObject";

type ContextMessage = {
  role?: string;
  content?: string;
};

type SynthesisInput = {
  text?: unknown;
  summary?: unknown;
  label?: unknown;
  stance?: unknown;
};

type SynthesisBranch = {
  text: string;
  summary: string;
  label: string;
  stance: "合";
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

function hasRequiredBranch(value: unknown, stance: "正" | "反"): value is Required<SynthesisInput> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const branch = value as Record<string, unknown>;
  return (
    typeof branch.text === "string" &&
    typeof branch.summary === "string" &&
    typeof branch.label === "string" &&
    branch.stance === stance
  );
}

function parseSynthesis(value: unknown): SynthesisBranch | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.text !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.label !== "string" ||
    candidate.stance !== "合"
  ) {
    return null;
  }

  return {
    text: candidate.text.trim(),
    summary: candidate.summary.trim(),
    label: candidate.label.trim(),
    stance: "合"
  };
}

function buildSynthesisPrompt(thesis: Required<SynthesisInput>, antithesis: Required<SynthesisInput>, contextMessages: unknown): string {
  const serializedContext = serializeContextMessages(contextMessages);
  const sections = [
    "你负责把同一母题下的正与反整理成一个更高阶的合。",
    "只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。",
    "schema={\"synthesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"合\"}}",
    `正:\ntext=${thesis.text}\nsummary=${thesis.summary}\nlabel=${thesis.label}`,
    `反:\ntext=${antithesis.text}\nsummary=${antithesis.summary}\nlabel=${antithesis.label}`,
    serializedContext ? `历史上下文:\n${serializedContext}` : ""
  ];

  return sections.filter(Boolean).join("\n\n");
}

export async function POST(req: NextRequest) {
  let requestId = "";

  try {
    const body = await req.json();
    requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const thesis = body?.thesis;
    const antithesis = body?.antithesis;
    const model = getDefaultModel(typeof body?.model === "string" ? body.model : undefined);

    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    if (!hasRequiredBranch(thesis, "正") || !hasRequiredBranch(antithesis, "反")) {
      return NextResponse.json({ requestId, error: "thesis and antithesis required" }, { status: 400 });
    }

    const { text: outputText } = await generateText({
      model,
      input: buildSynthesisPrompt(thesis, antithesis, body?.contextMessages),
      maxOutputTokens: 1200
    });

    const parsed = outputText ? parseFirstJsonObject(outputText) : null;
    if (!parsed) {
      console.warn("/api/synthesis invalid model output", { requestId, outputText: outputText.slice(0, 500) });
      return invalidModelOutput(requestId, "expected synthesis JSON object");
    }

    const synthesis = parseSynthesis(parsed.synthesis);
    if (!synthesis) {
      console.warn("/api/synthesis malformed payload", { requestId, parsed });
      return invalidModelOutput(requestId, "payload missing synthesis with matching stance");
    }

    return NextResponse.json({ requestId, synthesis });
  } catch (error: any) {
    console.error("/api/synthesis error", { requestId, message: error?.message, stack: error?.stack });
    return NextResponse.json(
      {
        requestId,
        error: "synthesis_failed",
        details: describeProviderFailure(error)
      },
      { status: 500 }
    );
  }
}
