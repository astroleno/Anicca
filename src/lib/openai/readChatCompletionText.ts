function readContentPartText(part: unknown): string {
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

export function readChatCompletionText(response: { choices?: unknown }): string {
  if (!Array.isArray(response?.choices)) {
    return "";
  }

  const firstChoice = response.choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return "";
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content.map(readContentPartText).filter(Boolean).join("\n").trim();
}
