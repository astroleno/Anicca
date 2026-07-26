const LABEL_MAX_CHARS = 8;
const PROTECTED_SYNTHESIS_SUFFIXES = ["结合", "整合", "融合", "综合", "配合", "适合", "合流"];

function stripRedundantStanceSuffix(label: string, redundantSuffix?: "正" | "反" | "合") {
  if (!redundantSuffix || label === redundantSuffix || !label.endsWith(redundantSuffix)) {
    return label;
  }

  if (redundantSuffix === "合" && PROTECTED_SYNTHESIS_SUFFIXES.some((suffix) => label.endsWith(suffix))) {
    return label;
  }

  const stripped = label.slice(0, -redundantSuffix.length).trim();
  return stripped || label;
}

export function normalizeDialecticLabel(label: string, fallback: string, redundantSuffix?: "正" | "反" | "合") {
  const compact = label.replace(/\s+/g, " ").trim();
  const firstSegment = compact.split(/[：:，,、\-—|/]/u).find((part) => part.trim());
  const candidate = stripRedundantStanceSuffix((firstSegment || compact).trim(), redundantSuffix);

  if (!/[\u3400-\u9fff]/u.test(candidate)) {
    return fallback;
  }

  return Array.from(candidate).slice(0, LABEL_MAX_CHARS).join("");
}

export function normalizeDialecticSummary(summary: string) {
  return summary.replace(/\s+/g, " ").trim();
}
