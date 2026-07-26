import { MemoryRef, UserAgentEvent, UserAgentIntent, parseUserAgentEvent } from "./types";

type BuildUserAgentEventInput = {
  text: string;
  requestId?: string;
  memoryRefs?: MemoryRef[];
};

const UNCERTAINTY_SIGNALS = [
  "maybe",
  "perhaps",
  "not sure",
  "unsure",
  "不知道",
  "不确定",
  "可能",
  "也许",
  "似乎",
  "吗",
  "？",
  "?"
];

const COMPARE_SIGNALS = ["compare", "versus", "vs", "对比", "比较", "还是", "或者", "权衡"];
const CREATE_SIGNALS = ["create", "write", "make", "design", "生成", "创作", "设计", "写"];
const SEARCH_SIGNALS = ["search", "find", "lookup", "recommend", "搜索", "查找", "推荐", "找"];
const CONFESS_SIGNALS = ["confess", "admit", "afraid", "坦白", "承认", "害怕", "担心", "焦虑"];
const CONTINUE_SIGNALS = ["continue", "next", "继续", "下一步", "接着", "推进"];
const TENSION_SIGNALS = ["but", "however", "although", "可是", "但是", "然而", "一边", "另一边", "既", "又"];
const OVERCONFIDENT_SIGNALS = ["always", "never", "must", "only", "肯定", "一定", "必须", "唯一", "绝对"];

function includesAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function compact(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function stableEventId(text: string, requestId?: string) {
  if (requestId?.trim()) {
    return `event_${requestId.trim().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `event_${hash.toString(36)}`;
}

function inferIntent(text: string): UserAgentIntent {
  if (includesAny(text, COMPARE_SIGNALS)) return "compare";
  if (includesAny(text, CREATE_SIGNALS)) return "create";
  if (includesAny(text, CONFESS_SIGNALS)) return "confess";
  if (includesAny(text, CONTINUE_SIGNALS)) return "continue";
  if (includesAny(text, SEARCH_SIGNALS)) return "search";
  return "reflect";
}

function inferMood(text: string, intent: UserAgentIntent) {
  const moods = new Set<string>();
  if (includesAny(text, ["焦虑", "担心", "害怕", "afraid", "anxious"])) moods.add("uneasy");
  if (includesAny(text, ["开心", "兴奋", "期待", "excited"])) moods.add("energized");
  if (includesAny(text, ["累", "疲惫", "卡住", "stuck", "tired"])) moods.add("blocked");
  if (includesAny(text, ["想", "感觉", "reflect", "为什么"])) moods.add("reflective");
  if (intent === "create") moods.add("generative");
  if (!moods.size) moods.add("neutral");
  return [...moods].sort();
}

function inferUncertainty(text: string) {
  let score = includesAny(text, UNCERTAINTY_SIGNALS) ? 0.68 : 0.28;
  const matches = UNCERTAINTY_SIGNALS.filter((signal) => text.includes(signal)).length;
  score += Math.min(matches * 0.05, 0.2);
  return Math.min(1, score);
}

function inferIntensity(text: string) {
  let score = 0.36;
  if (/[!！]/.test(text)) score += 0.18;
  if (includesAny(text, CONFESS_SIGNALS)) score += 0.16;
  if (includesAny(text, OVERCONFIDENT_SIGNALS)) score += 0.12;
  if (text.length > 80) score += 0.08;
  return Math.min(1, score);
}

function inferTensions(text: string, uncertainty: number) {
  const tensions = new Set<string>();
  if (includesAny(text, TENSION_SIGNALS)) tensions.add("mixed_frame");
  if (includesAny(text, COMPARE_SIGNALS)) tensions.add("choice_pressure");
  if (includesAny(text, OVERCONFIDENT_SIGNALS)) tensions.add("single_frame");
  if (uncertainty >= 0.6) tensions.add("ambiguity");
  return [...tensions].sort();
}

function inferGrowthNeeds(intent: UserAgentIntent, tensions: string[], uncertainty: number) {
  const needs = new Set<string>();
  if (uncertainty >= 0.6 || tensions.includes("ambiguity")) needs.add("expand");
  if (tensions.includes("single_frame")) needs.add("counter_aha");
  if (intent === "compare" || tensions.includes("choice_pressure")) needs.add("reframe");
  if (intent === "create") needs.add("expand");
  if (!needs.size) needs.add("resonate");
  return [...needs].sort();
}

export function buildUserAgentEvent(input: string | BuildUserAgentEventInput): UserAgentEvent {
  const text = compact(typeof input === "string" ? input : input.text);
  if (!text) {
    throw new Error("growth_event_empty_input");
  }

  const inferenceText = normalize(text);
  const requestId = typeof input === "string" ? undefined : input.requestId;
  const intent = inferIntent(inferenceText);
  const uncertainty = inferUncertainty(inferenceText);
  const tensions = inferTensions(inferenceText, uncertainty);
  const event = {
    id: stableEventId(text, requestId),
    text,
    intent,
    affect: {
      mood: inferMood(inferenceText, intent),
      intensity: inferIntensity(inferenceText),
      uncertainty
    },
    memoryRefs: typeof input === "string" ? [] : input.memoryRefs || [],
    tensions,
    growthNeeds: inferGrowthNeeds(intent, tensions, uncertainty)
  };

  return parseUserAgentEvent(event);
}
