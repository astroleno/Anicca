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

function getErrorInfo(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
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

function parseSynthesis(value: unknown, rootValue: unknown): SynthesisBranch | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const root = rootValue && typeof rootValue === "object" ? (rootValue as Record<string, unknown>) : null;
  const candidateStance = candidate.stance;
  const rootStance = root?.stance;
  if (
    typeof candidate.text !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.label !== "string" ||
    (candidateStance !== undefined && candidateStance !== "合") ||
    (candidateStance === undefined && rootStance !== undefined && rootStance !== "合")
  ) {
    return null;
  }

  return {
    text: candidate.text.trim(),
    summary: normalizeDialecticSummary(candidate.summary),
    label: normalizeDialecticLabel(candidate.label, "合流", "合"),
    stance: "合"
  };
}

function buildSynthesisPrompt(thesis: Required<SynthesisInput>, antithesis: Required<SynthesisInput>, contextMessages: unknown): string {
  const serializedContext = serializeContextMessages(contextMessages);
  const sections = [
    "你负责把同一母题下的正与反整理成一个更高阶的合。",
    "只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。",
    "schema={\"synthesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"合\"}}",
    "summary 必须是单行摘要，label 必须是 8 个字符以内的中文短标签；不要在 label 中写解释、冒号、下划线或长短语。",
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

    const synthesis = parseSynthesis(parsed.synthesis, parsed);
    if (!synthesis) {
      console.warn("/api/synthesis malformed payload", { requestId, parsed });
      return invalidModelOutput(requestId, "payload missing synthesis with matching stance");
    }

    return NextResponse.json({ requestId, synthesis });
  } catch (error: unknown) {
    console.error("/api/synthesis error", { requestId, ...getErrorInfo(error) });
    const failure = describeProviderFailure(error);
    return NextResponse.json(
      {
        requestId,
        error: "synthesis_failed",
        details: failure.details
      },
      { status: failure.status }
    );
  }
}
