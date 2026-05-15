import type { BranchType } from "@/types/anicca";
import type { RetrievalNode, RetrievalSubgraph } from "./types";

type SanitizeOptions = {
  maxChars?: number;
  singleLine?: boolean;
};

type RenderOptions = {
  charBudget?: number;
  maxCharBudget?: number;
  includeEdges?: boolean;
  includeFullTextForSeedNodes?: boolean;
};

const HARD_MAX_CHAR_BUDGET = 2400;
const DEFAULT_CHAR_BUDGET = 1800;
const DEFAULT_MAX_CHAR_BUDGET = 2400;
const HEADER = "相关谱系片段:";
const ID_MAX_CHARS = 80;
const LABEL_MAX_CHARS = 40;
const SUMMARY_MAX_CHARS = 120;
const REASON_MAX_CHARS = 80;
const SEED_TEXT_MAX_CHARS = 360;

const BRANCH_DISPLAY: Record<BranchType, string> = {
  正: "thesis",
  反: "antithesis",
  合: "synthesis"
};

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return max;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function sanitizeRetrievalField(value: unknown, options: SanitizeOptions = {}): string {
  const maxChars = clampInteger(options.maxChars ?? 240, 0, Number.MAX_SAFE_INTEGER);
  const singleLine = options.singleLine ?? true;
  const raw = value === null || value === undefined ? "" : String(value);
  const withoutControls = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const normalized = singleLine
    ? withoutControls.replace(/\s+/g, " ").trim()
    : withoutControls.replace(/[^\S\r\n]+/g, " ").replace(/\r\n?/g, "\n").trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= 0) {
    return "";
  }

  if (maxChars <= 3) {
    return normalized.slice(0, maxChars);
  }

  return `${normalized.slice(0, maxChars - 3)}...`;
}

function clampCharBudget(options: RenderOptions) {
  const maxCharBudget = clampInteger(options.maxCharBudget ?? DEFAULT_MAX_CHAR_BUDGET, 0, HARD_MAX_CHAR_BUDGET);
  return clampInteger(options.charBudget ?? DEFAULT_CHAR_BUDGET, 0, maxCharBudget);
}

function renderNodeLine(node: RetrievalNode, seedNodeIds: Set<string>, includeFullTextForSeedNodes: boolean) {
  const parts = [
    `NODE [${sanitizeRetrievalField(node.id, { maxChars: ID_MAX_CHARS })}]`,
    `kind=${sanitizeRetrievalField(node.kind, { maxChars: 20 })}`
  ];
  if (node.branchType) {
    parts.push(`branch=${sanitizeRetrievalField(BRANCH_DISPLAY[node.branchType], { maxChars: 20 })}`);
  }

  const label = sanitizeRetrievalField(node.label, { maxChars: LABEL_MAX_CHARS });
  if (label) {
    parts.push(`label=${label}`);
  }

  const summary = sanitizeRetrievalField(node.summary, { maxChars: SUMMARY_MAX_CHARS });
  if (summary) {
    parts.push(`summary=${summary}`);
  }

  if (includeFullTextForSeedNodes && seedNodeIds.has(node.id)) {
    const text = sanitizeRetrievalField(node.text, { maxChars: SEED_TEXT_MAX_CHARS });
    if (text) {
      parts.push(`text=${text}`);
    }
  }

  return parts.join(" ");
}

function renderEdgeLine(edge: RetrievalSubgraph["edges"][number]) {
  const parts = [
    `EDGE [${sanitizeRetrievalField(edge.from, { maxChars: ID_MAX_CHARS })}] --${sanitizeRetrievalField(edge.relation, {
      maxChars: 20
    })}--> [${sanitizeRetrievalField(edge.to, { maxChars: ID_MAX_CHARS })}]`,
    `confidence=${sanitizeRetrievalField(edge.confidence, { maxChars: 20 })}`
  ];
  const reason = sanitizeRetrievalField(edge.reason, { maxChars: REASON_MAX_CHARS });
  if (reason) {
    parts.push(`reason=${reason}`);
  }
  return parts.join(" ");
}

function orderNodesForRender(nodes: RetrievalNode[], seedNodeIds: string[]) {
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const seedOrder = new Map(seedNodeIds.map((nodeId, index) => [nodeId, index]));

  return [...nodes].sort((left, right) => {
    const leftSeedOrder = seedOrder.get(left.id);
    const rightSeedOrder = seedOrder.get(right.id);
    const leftIsSeed = leftSeedOrder !== undefined;
    const rightIsSeed = rightSeedOrder !== undefined;
    if (leftIsSeed !== rightIsSeed) {
      return leftIsSeed ? -1 : 1;
    }
    if (leftIsSeed && rightIsSeed && leftSeedOrder !== rightSeedOrder) {
      return leftSeedOrder - rightSeedOrder;
    }
    return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
  });
}

function tryAppendLine(lines: string[], line: string, charBudget: number) {
  const nextLength = lines.length === 0 ? line.length : lines.join("\n").length + 1 + line.length;
  if (nextLength > charBudget) {
    return false;
  }
  lines.push(line);
  return true;
}

export function renderRetrievalContext(subgraph: RetrievalSubgraph, options: RenderOptions = {}): string {
  const charBudget = clampCharBudget(options);
  const includeEdges = options.includeEdges ?? true;
  const includeFullTextForSeedNodes = options.includeFullTextForSeedNodes ?? false;
  const lines: string[] = [];

  if (!tryAppendLine(lines, HEADER, charBudget)) {
    return "";
  }

  const seedNodeIds = new Set(subgraph.seedNodeIds);
  for (const node of orderNodesForRender(subgraph.nodes, subgraph.seedNodeIds)) {
    tryAppendLine(lines, renderNodeLine(node, seedNodeIds, includeFullTextForSeedNodes), charBudget);
  }

  if (includeEdges) {
    for (const edge of subgraph.edges) {
      tryAppendLine(lines, renderEdgeLine(edge), charBudget);
    }
  }

  return lines.join("\n");
}
