function stripCodeFence(input: string): string {
  return input.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
}

export function parseFirstJsonObject(input: string): Record<string, unknown> | null {
  const text = stripCodeFence(input);
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        const candidate = text.slice(start, index + 1);
        try {
          return JSON.parse(candidate) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
