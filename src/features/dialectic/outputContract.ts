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

  if (!/[\u3400-\u9fff]/u.test(candidate) || Array.from(candidate).length > LABEL_MAX_CHARS || (/[的与及或]$/u.test(candidate) && !/(?:目的|标的)$/u.test(candidate))) {
    return fallback;
  }

  return candidate;
}

/** An excerpt is not a generated title: mark the omission and preserve Unicode characters. */
export function quoteExcerpt(text: string, maxChars = 12) {
  const chars = Array.from(text.replace(/\s+/gu, " ").trim());
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : chars.join("");
}

export function normalizeDialecticSummary(summary: string) {
  return summary.replace(/\s+/g, " ").trim();
}
