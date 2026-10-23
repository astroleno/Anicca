import type { Graph } from "@/types/anicca";

export type ComparisonSeed = { id: string; label: string; text: string };
export type NoveltyAssessment = { status: "new" | "revisit" | "unchecked"; sourceId?: string; reason?: string; sourceEvidence?: string; resultEvidence?: string };

export function readNovelty(value: unknown): NoveltyAssessment | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Partial<NoveltyAssessment>;
  if (v.status === "new" || v.status === "unchecked") return { status: v.status };
  if (v.status !== "revisit" || typeof v.sourceId !== "string" || !v.sourceId || v.sourceId.length > 200 ||
    typeof v.reason !== "string" || v.reason.trim().length < 6 || v.reason.length > 140 ||
    typeof v.sourceEvidence !== "string" || v.sourceEvidence.length < 6 || v.sourceEvidence.length > 220 ||
    typeof v.resultEvidence !== "string" || v.resultEvidence.length < 6 || v.resultEvidence.length > 220) return;
  return { status: v.status, sourceId: v.sourceId, reason: v.reason.trim(), sourceEvidence: v.sourceEvidence, resultEvidence: v.resultEvidence };
}

export function readComparisonSeeds(value: unknown): ComparisonSeed[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return null;
  const seen = new Set<string>();
  const seeds: ComparisonSeed[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id || raw.id.length > 200 ||
      typeof raw.label !== "string" || raw.label.length > 100 || typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 1200 || seen.has(raw.id)) return null;
    seen.add(raw.id); seeds.push({ id: raw.id, label: raw.label, text: raw.text });
  }
  return seeds;
}

export function buildComparisonSeeds(graph: Graph, sourceId: string): ComparisonSeed[] {
  const source = graph.nodes[sourceId];
  if (!source) return [];
  const queue = [sourceId, ...source.parents, ...source.children.slice(-2)], seen = new Set<string>(), seeds: ComparisonSeed[] = [];
  for (let i = 0; i < queue.length && seeds.length < 8; i++) {
    const node = graph.nodes[queue[i]];
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    // Include previously explored companion branches, not just the chosen side.
    for (const parentId of node.parents) {
      queue.push(parentId);
      for (const siblingId of graph.nodes[parentId]?.children || []) {
        if (siblingId !== node.id && graph.nodes[siblingId]?.createdAt <= graph.nodes[sourceId].createdAt) queue.push(siblingId);
      }
    }
    if (node.kind === "assistant" && node.text?.trim()) seeds.push({ id: node.id,
      label: (node.meta?.label || node.text.slice(0, 14)).slice(0, 100), text: node.text.slice(0, 1200) });
  }
  return seeds;
}

export function validateNovelty(value: unknown, text: string, sources: ComparisonSeed[]): NoveltyAssessment {
  const result = readNovelty(value);
  if (!result) return { status: "unchecked" };
  if (result.status !== "revisit") return result;
  const source = sources.find(item => item.id === result.sourceId);
  return source?.text.includes(result.sourceEvidence!) && text.includes(result.resultEvidence!) ? result : { status: "unchecked" };
}
