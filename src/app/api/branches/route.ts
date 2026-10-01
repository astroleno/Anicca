import { NextRequest, NextResponse } from "next/server";
import { getDialecticModel, getDialecticOpenAiClient } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { parseStrictJsonObject } from "@/lib/openai/parseStrictJsonObject";
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

const BRANCH_TEXT_MIN = 120;
const BRANCH_TEXT_MAX = 220;

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

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function parseBranch(value: unknown, stance: DialecticBranch["stance"]): DialecticBranch | null {
  if (!hasExactKeys(value, ["text", "summary", "label", "stance"])) {
    return null;
  }

  const candidate = value;
  if (
    typeof candidate.text !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.label !== "string" ||
    candidate.stance !== stance
  ) {
    return null;
  }

  const text = candidate.text.trim();
  const summary = normalizeDialecticSummary(candidate.summary);
  const textLength = Array.from(text).length;
  if (!text || textLength < BRANCH_TEXT_MIN || textLength > BRANCH_TEXT_MAX || !summary) {
    return null;
  }

  return {
    text,
    summary,
    label: normalizeDialecticLabel(candidate.label, stance === "正" ? "正向" : "反向", stance),
    stance
  };
}

function analyzeBranchesOutput(outputText: string) {
  const parsed = outputText ? parseStrictJsonObject(outputText) : null;
  const errors: string[] = [];
  if (!hasExactKeys(parsed, ["thesis", "antithesis"])) {
    return {
      thesis: null,
      antithesis: null,
      errors: ["expected exact thesis/antithesis JSON object"]
    };
  }

  const thesis = parseBranch(parsed.thesis, "正");
  const antithesis = parseBranch(parsed.antithesis, "反");
  if (!thesis) {
    errors.push(`thesis must match schema and contain ${BRANCH_TEXT_MIN}-${BRANCH_TEXT_MAX} characters`);
  }
  if (!antithesis) {
    errors.push(`antithesis must match schema and contain ${BRANCH_TEXT_MIN}-${BRANCH_TEXT_MAX} characters`);
  }

  return { thesis, antithesis, errors };
}

function buildBranchesPrompt(userText: string, contextMessages: unknown): string {
  const serializedContext = serializeContextMessages(contextMessages);
  const sections = [
    "你负责为同一个问题生成一对结构化的正反分支。",
    "只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。",
    "schema={\"thesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"正\"},\"antithesis\":{\"text\":\"\",\"summary\":\"\",\"label\":\"\",\"stance\":\"反\"}}",
    "thesis.text 与 antithesis.text 必须分别是 120–220 个中文字符。summary 必须是单行摘要，label 必须是 8 个字符以内的中文短标签；不要在 label 中写解释、冒号、下划线或长短语。",
    "正与反必须围绕同一个核心张力：两边都要有充分理由、都能被认真选择，但在相同的关键前提下彼此不可同时成立。",
    "每个 text 都必须用自然连贯的文字包含四项内容：明确选择、支撑该选择的最强因果理由、愿意承担的代价，以及一个可观察的失效条件。失效条件必须是反证条件：明确写出观察到什么现象时，当前选择被证伪并必须放弃本分支；不要用成功指标替代失效条件。不要使用固定小标题机械拼接。",
    "不要提前折中、调和或给出合流方案。反方必须是独立成立的替代选择，不能只是给正方补充风险、条件或注意事项。",
    serializedContext ? `历史上下文:\n${serializedContext}` : "",
    `当前用户输入:\n${userText}`
  ];

  return sections.filter(Boolean).join("\n\n");
}

function buildBranchesRepairPrompt(
  userText: string,
  contextMessages: unknown,
  outputText: string,
  errors: string[]
): string {
  return [
    "上一版正反语义路线不变，只修复输出契约；不要添加第三条路线、解释或 JSON 外文字。",
    "只返回一个严格 JSON object，根对象只能有 thesis 和 antithesis。每个分支只能有 text、summary、label、stance。",
    "thesis.text 与 antithesis.text 必须分别是 120–220 个中文字符；正反仍要围绕同一核心张力，分别保留明确选择、最强因果理由、代价和可观察的反证失效条件。",
    "summary 必须单行；label 必须是 1–8 个字符的中文短标签；stance 分别严格为‘正’与‘反’。",
    `必须修复：${errors.join("；")}`,
    buildBranchesPrompt(userText, contextMessages),
    `待修复原始输出：${outputText}`
  ].join("\n\n");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await req.json();
    body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? (parsedBody as Record<string, unknown>)
      : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let requestId = "";

  try {
    requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const userText = typeof body?.userText === "string" ? body.userText.trim() : "";

    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    if (!userText) {
      return NextResponse.json({ requestId, error: "userText required" }, { status: 400 });
    }

    const model = getDialecticModel(typeof body?.model === "string" ? body.model : undefined);
    const client = getDialecticOpenAiClient();

    const { text: outputText } = await generateText({
      model,
      client,
      input: buildBranchesPrompt(userText, body?.contextMessages),
      maxOutputTokens: 2000
    });

    let analysis = analyzeBranchesOutput(outputText);
    let selectedOutputText = outputText;
    if (!analysis.thesis || !analysis.antithesis) {
      const repair = await generateText({
        model,
        client,
        input: buildBranchesRepairPrompt(userText, body?.contextMessages, outputText, analysis.errors),
        maxOutputTokens: 2000
      });
      selectedOutputText = repair.text;
      analysis = analyzeBranchesOutput(selectedOutputText);
    }

    const { thesis, antithesis } = analysis;
    if (!thesis || !antithesis) {
      console.warn("/api/branches malformed payload after repair", {
        requestId,
        errors: analysis.errors,
        outputText: selectedOutputText.slice(0, 500)
      });
      return invalidModelOutput(requestId, "branch output failed contract after one repair");
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
