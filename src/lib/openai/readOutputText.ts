function readPartText(part: unknown): string {
  if (!part || typeof part !== "object") {
    return "";
  }

  const text = (part as { text?: unknown }).text;
  if (typeof text === "string") {
    return text;
  }

  if (text && typeof text === "object" && typeof (text as { value?: unknown }).value === "string") {
    return (text as { value: string }).value;
  }

  return "";
}

export function readOutputText(response: { output_text?: unknown; output?: unknown }): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return "";
  }

  const parts = response.output.flatMap((item) => {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) {
      return [];
    }

    return (item as { content: unknown[] }).content.map(readPartText).filter(Boolean);
  });

  return parts.join("\n").trim();
}
