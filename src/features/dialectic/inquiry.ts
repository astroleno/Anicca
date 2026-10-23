import type { Graph } from "@/types/anicca";

export type InquiryIntent = "premise" | "counterexample";
export type InquiryTarget = { sourceNodeId: string; quote: string; intent: InquiryIntent };
export type InquiryOrigin = InquiryTarget & { question: string };
export const inquiryLabel = (intent: InquiryIntent) => intent === "counterexample" ? "寻找反例" : "追问前提";
export const inquiryQuestion = (intent: InquiryIntent) => intent === "counterexample"
  ? "什么具体情形会让这句话不成立？" : "这句话依赖什么尚未说明的前提？";

export function readInquiryTarget(value: unknown, graph?: Graph): InquiryTarget | undefined {
  if (!value || typeof value !== "object") return;
  const raw = value as Partial<InquiryTarget>;
  if (typeof raw.sourceNodeId !== "string" || !raw.sourceNodeId || raw.sourceNodeId.length > 200 ||
    typeof raw.quote !== "string" || raw.quote.trim().length < 2 || raw.quote.length > 600 ||
    (raw.intent !== "premise" && raw.intent !== "counterexample")) return;
  const quote = raw.quote.trim();
  if (graph && !graph.nodes[raw.sourceNodeId]?.text?.includes(quote)) return;
  return { sourceNodeId: raw.sourceNodeId, quote, intent: raw.intent };
}

export function readInquiryOrigin(value: unknown, graph?: Graph): InquiryOrigin | undefined {
  const target = readInquiryTarget(value, graph);
  const question = value && typeof value === "object" && "question" in value ? value.question : null;
  return target && typeof question === "string" && question.trim() && question.length <= 2000
    ? { ...target, question: question.trim() } : undefined;
}

/** Exact original substrings; accessible selection never rephrases the quote. */
export function inquirySentences(text: string): string[] {
  return text.match(/[^。！？!?\n]+[。！？!?]?/gu)?.map(value => value.trim()).filter(Boolean) || [];
}
