import { normalizeDialecticLabel, normalizeDialecticSummary } from "@/features/dialectic/outputContract";
import { parseStrictJsonObject } from "@/lib/openai/parseStrictJsonObject";
import {
  DialecticPolicyCard,
  formatDialecticPolicyCards,
  getDialecticRuleChecks
} from "@/features/dialectic/server/policyCards";

export type SynthesisSource = {
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反" | "合" | "想法";
};

export type SynthesisResult = {
  text: string;
  summary: string;
  label: string;
  stance: "合";
};

export type SynthesisAudit = {
  route: "choose_thesis" | "choose_antithesis" | "third_mechanism";
  checks: Array<{
    id: string;
    status: "covered" | "missing" | "violated";
    evidence: string;
  }>;
  unsupportedClaims: string[];
  missingClauses: string[];
  verdict: "pass" | "repair";
};

type SynthesisPromptContext = {
  sourceMode?: "seeds";
  rootInput: string;
  thesis: SynthesisSource;
  antithesis: SynthesisSource;
  contextMessages: string;
  cards: DialecticPolicyCard[];
};

export const SYNTHESIS_TEXT_MIN = 180;
export const SYNTHESIS_TEXT_MAX = 320;

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function hasAuditCheckKeys(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const allowed = new Set(["id", "status", "evidence", "kind", "rule"]);
  return ["id", "status", "evidence"].every((key) => keys.includes(key)) &&
    keys.every((key) => allowed.has(key));
}

function charLength(value: unknown): number {
  return typeof value === "string" ? Array.from(value.trim()).length : 0;
}

function extractGuardedQuantities(value: string): string[] {
  const matches = value.match(
    /(?:\d+(?:\.\d+)?(?:%|％|天|日|周|月|年|小时|分钟|次|人|份|个|篇|条|笔|家|轮|阶段)?|百分之[零一二三四五六七八九十百千万两]+|[两二三四五六七八九十百千万]+(?:天|日|周|月|年|小时|分钟|次|人|份|个|篇|条|笔|家|轮|阶段))/gu
  );
  return [...new Set(matches || [])];
}

export function findUnsupportedSynthesisQuantities(rootInput: string, text: string): string[] {
  const allowed = new Set(extractGuardedQuantities(rootInput));
  return extractGuardedQuantities(text).filter((quantity) => !allowed.has(quantity));
}

export function analyzeSynthesisOutput(
  outputText: string,
  rootInput: string,
  options: { requireContract?: boolean } = {}
) {
  const parsed = outputText ? parseStrictJsonObject(outputText) : null;
  const errors: string[] = [];

  if (!hasExactKeys(parsed, ["synthesis"])) {
    return { parsed: null, synthesis: null, errors: ["expected exact synthesis JSON object"] };
  }

  const candidate = parsed.synthesis;
  if (!hasExactKeys(candidate, ["text", "summary", "label", "stance"])) {
    return { parsed, synthesis: null, errors: ["synthesis keys must match schema exactly"] };
  }

  if (
    typeof candidate.text !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.label !== "string" ||
    candidate.stance !== "合"
  ) {
    return { parsed, synthesis: null, errors: ["synthesis fields must match schema types and stance"] };
  }

  const text = candidate.text.trim();
  const summary = normalizeDialecticSummary(candidate.summary);
  const label = normalizeDialecticLabel(candidate.label, "合流", "合");
  const textLength = charLength(text);
  const requireContract = options.requireContract !== false;
  if (!text) {
    errors.push("synthesis.text must be non-empty");
  } else if (requireContract && (textLength < SYNTHESIS_TEXT_MIN || textLength > SYNTHESIS_TEXT_MAX)) {
    errors.push(`synthesis.text must contain ${SYNTHESIS_TEXT_MIN}-${SYNTHESIS_TEXT_MAX} characters`);
  }
  if (!summary) {
    errors.push("synthesis.summary must be non-empty");
  }
  if (!label || charLength(label) > 8) {
    errors.push("synthesis.label must contain 1-8 characters");
  }

  if (requireContract) {
    const unsupportedQuantities = findUnsupportedSynthesisQuantities(rootInput, text);
    if (unsupportedQuantities.length) {
      errors.push(`unsupported quantities: ${unsupportedQuantities.join(", ")}`);
    }
  }

  return {
    parsed,
    synthesis: errors.length
      ? null
      : ({ text, summary, label, stance: "合" } satisfies SynthesisResult),
    errors
  };
}

export function parseSynthesisAudit(outputText: string, cards: DialecticPolicyCard[]): SynthesisAudit | null {
  const parsed = outputText ? parseStrictJsonObject(outputText) : null;
  if (!hasExactKeys(parsed, ["audit"]) || !hasExactKeys(parsed.audit, [
    "route",
    "checks",
    "unsupportedClaims",
    "missingClauses",
    "verdict"
  ])) {
    return null;
  }

  const audit = parsed.audit;
  const expectedChecks = getDialecticRuleChecks(cards);
  const expectedIds = expectedChecks.map((check) => check.id);
  if (
    !["choose_thesis", "choose_antithesis", "third_mechanism"].includes(String(audit.route)) ||
    !["pass", "repair"].includes(String(audit.verdict)) ||
    !Array.isArray(audit.checks) ||
    !Array.isArray(audit.unsupportedClaims) ||
    !audit.unsupportedClaims.every((claim) => typeof claim === "string") ||
    !Array.isArray(audit.missingClauses) ||
    !audit.missingClauses.every((clause) => typeof clause === "string")
  ) {
    return null;
  }

  const actualIds = audit.checks.map((entry) =>
    entry && typeof entry === "object" && "id" in entry ? entry.id : null
  );
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    return null;
  }

  const checks = audit.checks.flatMap((entry, index) => {
    const expectedCheck = expectedChecks[index];
    if (
      !hasAuditCheckKeys(entry) ||
      typeof entry.id !== "string" ||
      !["covered", "missing", "violated"].includes(String(entry.status)) ||
      typeof entry.evidence !== "string" ||
      (entry.kind !== undefined && entry.kind !== expectedCheck.kind) ||
      (entry.rule !== undefined && typeof entry.rule !== "string")
    ) {
      return [];
    }
    return [{
      id: entry.id,
      status: entry.status as SynthesisAudit["checks"][number]["status"],
      evidence: entry.evidence
    }];
  });
  if (checks.length !== expectedIds.length) {
    return null;
  }

  return {
    route: audit.route as SynthesisAudit["route"],
    checks,
    unsupportedClaims: audit.unsupportedClaims as string[],
    missingClauses: audit.missingClauses as string[],
    verdict: audit.verdict as SynthesisAudit["verdict"]
  };
}

function commonOutputRules(): string[] {
  return [
    "只返回一个严格 JSON object，不要 markdown、代码围栏、分析过程或 JSON 外文字。",
    'schema={"synthesis":{"text":"","summary":"","label":"","stance":"合"}}',
    "synthesis.text 必须是 180–320 个中文字符；summary 必须单行；label 必须是 1–8 个字符的中文短标签；stance 严格为‘合’。",
    "输出必须自然连贯地写明主路线、机制如何运作、可观察的决策规则或触发条件、一个成本受控且可逆的下一步，以及失败后的安全状态与所承担的代价。",
    "避免‘不是二选一’、‘兼顾’、‘平衡’、‘更高阶’、‘视情况而定’、‘按场景选择’等空泛套话。"
  ];
}

function promptContext(context: SynthesisPromptContext): string[] {
  return [
    `原始输入：${context.rootInput}`,
    ...(context.sourceMode === "seeds" ? [
      "这里组合的是任意两个 seed，可能同角色、跨主题或已经是合。保留其原始立场，不把来源甲强行当作正、来源乙强行当作反。寻找关联、张力或互补，形成有新增意义的合；不只是拼接或取平均。审计中的 choose_thesis/choose_antithesis 分别指来源甲/乙。",
      `来源甲：${JSON.stringify(context.thesis)}`,
      `来源乙：${JSON.stringify(context.antithesis)}`
    ] : [`正：${JSON.stringify(context.thesis)}`, `反：${JSON.stringify(context.antithesis)}`]),
    context.contextMessages ? `历史上下文：\n${context.contextMessages}` : ""
  ].filter(Boolean);
}

export function buildSynthesisDraftPrompt(context: SynthesisPromptContext): string {
  return [
    context.sourceMode === "seeds"
      ? "你负责将两个来源 seed 发展为新的合。识别各自核心想法、相容点与张力，在不歪曲来源的前提下提出新的理解或机制。"
      : "你负责把同一母题下真正冲突的正与反转化成可执行的合。先识别不可违反的硬约束，再决定选正、选反或提出第三机制。",
    ...commonOutputRules(),
    "若同意、可访问性、数据可恢复性、安全、鉴权或生存窗口等硬约束已使一边失效，必须明确选择合规的一侧；期限、增长、成本、匿名化、事后删除或未来补救不能豁免硬约束。",
    "只有第三机制完整保留全部硬约束，并真实改变约束、顺序、信息条件、责任归属或资源结构时才允许使用；否则选边并说明舍弃另一边的代价。",
    "不得虚构题目未提供的比例、人数、期限、预算、授权、日志、基础设施或既有恢复能力。题设没有阈值时，使用真实基线、风险事件或验收结果作闸门。",
    "失败后的安全状态必须是未发布、未删除、未追踪、未迁移、停止投入或另一个明确安全状态；清单、承诺、上传、校验和与同盘副本都不是回滚资产。",
    formatDialecticPolicyCards(context.cards),
    ...promptContext(context)
  ].join("\n\n");
}

export function buildSynthesisCriticPrompt(
  context: SynthesisPromptContext,
  draft: SynthesisResult
): string {
  return [
    "你是正反合最终校正器。依据原始输入与适用规则卡重写草稿，只返回最终 synthesis JSON；不要输出检查过程，也不要维护草稿的错误决定。",
    ...commonOutputRules(),
    "synthesis.text 严格写五句，总长目标 220–260 个中文字符：第一句给出主路线与决定性约束；第二句写机制；第三句写事件型决策闸门；第四句写一个范围受控的下一步；第五句写失败后的安全状态与代价。不要增加第六句。",
    "逐条落实适用规则卡的 invariant，并删除所有 forbidden move。禁止动作不能通过匿名化、聚合化、缩短期限、事后删除或更名继续保留。",
    "删除题设没有的具体比例、人数、期限、次数、样本量、预算、授权、日志、基础设施或能力。需要阈值时先测真实基线，并使用风险事件或验收结果作为闸门。",
    "硬门槛失效的一侧不得在失败、回滚或结尾重新启用。若第三机制不能完整满足全部规则，就明确选择合规侧，并写清舍弃代价。",
    formatDialecticPolicyCards(context.cards),
    ...promptContext(context),
    `待校正草稿：${JSON.stringify(draft)}`
  ].join("\n\n");
}

export function buildSynthesisAuditPrompt(
  context: SynthesisPromptContext,
  candidate: SynthesisResult
): string {
  const checks = getDialecticRuleChecks(context.cards);
  return [
    "你是独立语义审计器，只审计候选 synthesis，不改写答案。逐条检查规则，不得因为语气合理而推断未明确写出的保障。",
    "只返回严格 JSON object，不要 markdown、代码围栏或 JSON 外文字。",
    'schema={"audit":{"route":"choose_thesis|choose_antithesis|third_mechanism","checks":[{"id":"","status":"covered|missing|violated","evidence":""}],"unsupportedClaims":[""],"missingClauses":[""],"verdict":"pass|repair"}}',
    `checks 必须按给定顺序返回，id 完全一致，共 ${checks.length} 条。invariant 只有候选存在明确可执行语义才是 covered；forbidden 只有候选完全没有该动作及其匿名化、聚合化、短期化或改名变体才是 covered，否则为 violated。`,
    "unsupportedClaims 列出题设和规则均未提供的数字、人员、预算、工具、日志、授权、基础设施或既有能力。任一 invariant missing、任一 forbidden violated 或存在 unsupportedClaims 时，verdict 必须为 repair。",
    `待检查规则：${JSON.stringify(checks)}`,
    ...promptContext(context),
    `候选 synthesis：${JSON.stringify(candidate)}`
  ].join("\n\n");
}

export function buildSynthesisFinalPrompt(
  context: SynthesisPromptContext,
  candidate: SynthesisResult,
  audit: SynthesisAudit
): string {
  return [
    "你是正反合终审改写器。根据独立审计重新写最终 synthesis；不要辩护原稿，也不要输出审计过程。",
    ...commonOutputRules(),
    "synthesis.text 严格写五句，总长目标 220–260 个中文字符：主路线与决定性约束；机制；事件型闸门；一个范围受控的下一步；失败后的安全状态与代价。不要增加第六句。",
    "每条 invariant 必须有明确可执行落点，不能依靠读者推断。禁止动作不能通过匿名化、聚合化、缩短期限、事后删除或改名继续保留。",
    "合法证据不存在时必须如实披露缺失，并改用不依赖该证据的安全路线。硬约束排除的一侧不能在失败或回滚时重新开启。",
    "只复述原始输入已有的定量表达；其余比例、人数、时长、次数、样本量、预算、完成率和日期全部删除，改用真实基线、风险事件或验收结果。",
    `必须覆盖的逐条规则：${JSON.stringify(getDialecticRuleChecks(context.cards))}`,
    `独立审计结果：${JSON.stringify(audit)}`,
    formatDialecticPolicyCards(context.cards),
    ...promptContext(context),
    `待终审 synthesis：${JSON.stringify(candidate)}`
  ].join("\n\n");
}

export function buildSynthesisContractRepairPrompt(
  context: SynthesisPromptContext,
  candidateText: string,
  errors: string[]
): string {
  return [
    "上一版语义路线不变，只修复输出契约；不要增加新事实、数字、机制、条件或解释。",
    ...commonOutputRules(),
    "把 synthesis.text 压缩或补足到 220–260 个中文字符并严格写五句，依次保留主路线与约束、机制、事件型闸门、一个下一步、安全回退与代价。不要增加第六句。",
    `必须修复：${errors.join("；")}`,
    formatDialecticPolicyCards(context.cards),
    ...promptContext(context),
    `待修复原始输出：${candidateText}`
  ].join("\n\n");
}
