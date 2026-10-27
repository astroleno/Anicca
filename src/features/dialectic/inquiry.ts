import type { Graph } from "@/types/anicca";

export type InquiryIntent = "premise" | "counterexample";
export type InquiryTarget = { sourceNodeId: string; quote: string; quoteStart?: number; intent: InquiryIntent };
export type InquiryOrigin = InquiryTarget & { question: string };
export const inquiryLabel = (intent: InquiryIntent) => intent === "counterexample" ? "寻找反例" : "追问前提";
export const inquiryQuestion = (intent: InquiryIntent) => intent === "counterexample"
  ? "什么具体情形会让这句话不成立？" : "这句话依赖什么尚未说明的前提？";

/** UTF-16 offsets match both String.slice and DOM text ranges. Older records have no offset. */
export function inquiryQuoteStart(text: string, target: Pick<InquiryTarget, "quote" | "quoteStart">): number {
  if (target.quoteStart === undefined) return text.indexOf(target.quote);
  const start = target.quoteStart;
  return Number.isSafeInteger(start) && start >= 0 && text.slice(start, start + target.quote.length) === target.quote ? start : -1;
}

export function readInquiryTarget(value: unknown, graph?: Graph): InquiryTarget | undefined {
  if (!value || typeof value !== "object") return;
  const raw = value as Partial<InquiryTarget>;
  if (typeof raw.sourceNodeId !== "string" || !raw.sourceNodeId || raw.sourceNodeId.length > 200 ||
    typeof raw.quote !== "string" || raw.quote.trim().length < 2 || raw.quote.length > 600 ||
    (raw.intent !== "premise" && raw.intent !== "counterexample")) return;
  const quote = raw.quote.trim();
  if (raw.quoteStart !== undefined && (!Number.isSafeInteger(raw.quoteStart) || raw.quoteStart < 0)) return;
  const target = { sourceNodeId: raw.sourceNodeId, quote, intent: raw.intent,
    ...(raw.quoteStart !== undefined ? { quoteStart: raw.quoteStart } : {}) };
  if (graph && inquiryQuoteStart(graph.nodes[raw.sourceNodeId]?.text || "", target) < 0) return;
  return target;
}

export function readInquiryOrigin(value: unknown, graph?: Graph): InquiryOrigin | undefined {
  const target = readInquiryTarget(value, graph);
  const question = value && typeof value === "object" && "question" in value ? value.question : null;
  return target && typeof question === "string" && question.trim() && question.length <= 2000
    ? { ...target, question: question.trim() } : undefined;
}

/** Exact original substrings; accessible selection never rephrases the quote. */
export function inquirySentences(text: string): string[] {
  return inquirySentenceRanges(text).map(sentence => sentence.quote);
}

export function inquirySentenceRanges(text: string): { quote: string; quoteStart: number }[] {
  return Array.from(text.matchAll(/[^。！？!?\n]+[。！？!?]?/gu)).flatMap(match => {
    const quote = match[0].trim();
    return quote ? [{ quote, quoteStart: match.index + match[0].length - match[0].trimStart().length }] : [];
  });
}
