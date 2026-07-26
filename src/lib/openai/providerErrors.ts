export type ProviderFailureDetails =
  | "openai_api_key_missing"
  | "provider_auth_failed"
  | "provider_rate_limited"
  | "provider_overloaded"
  | "provider_unreachable"
  | "provider_runtime_error";

export type ProviderFailure = {
  details: ProviderFailureDetails;
  status: number;
};

const STATUS_KEYS = ["status", "statusCode"] as const;
const TEXT_KEYS = ["message", "name", "type", "code", "status", "statusCode"] as const;
const NESTED_KEYS = ["cause", "error", "response", "data", "body"] as const;

function readNumericStatus(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  for (const key of STATUS_KEYS) {
    const status = candidate[key];
    if (typeof status === "number") {
      return status;
    }
    if (typeof status === "string" && /^\d+$/.test(status)) {
      return Number(status);
    }
  }

  return null;
}

function collectErrorParts(value: unknown, parts: string[], seen: Set<object>, depth = 0) {
  if (depth > 3 || value == null) {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    parts.push(String(value));
    return;
  }

  if (typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  const candidate = value as Record<string, unknown>;

  for (const key of TEXT_KEYS) {
    const field = candidate[key];
    if (typeof field === "string" || typeof field === "number") {
      parts.push(String(field));
    }
  }

  for (const key of NESTED_KEYS) {
    collectErrorParts(candidate[key], parts, seen, depth + 1);
  }
}

function getProviderStatus(error: unknown): number | null {
  const directStatus = readNumericStatus(error);
  if (directStatus) {
    return directStatus;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as Record<string, unknown>;
  for (const key of NESTED_KEYS) {
    const nestedStatus = readNumericStatus(candidate[key]);
    if (nestedStatus) {
      return nestedStatus;
    }
  }

  return null;
}

function getProviderErrorText(error: unknown): string {
  const parts: string[] = [];
  collectErrorParts(error, parts, new Set());
  return parts.join(" ");
}

export function describeProviderFailure(error: unknown): ProviderFailure {
  const status = getProviderStatus(error);
  const text = getProviderErrorText(error);

  if (!process.env.OPENAI_API_KEY) {
    return { details: "openai_api_key_missing", status: 500 };
  }

  if (status === 401 || /401|unauthorized|incorrect api key|invalid api key/i.test(text)) {
    return { details: "provider_auth_failed", status: 500 };
  }

  if (/overload|overloaded|capacity|saturated|server is busy|service unavailable|负载已饱和|服务繁忙|稍后再试/i.test(text)) {
    return { details: "provider_overloaded", status: 503 };
  }

  if (status === 429 || /rate.?limit|too many requests|quota|限流|速率限制/i.test(text)) {
    return { details: "provider_rate_limited", status: 429 };
  }

  if (/fetch failed|network|timeout|econnrefused|enotfound|connection/i.test(text)) {
    return { details: "provider_unreachable", status: 503 };
  }

  return { details: "provider_runtime_error", status: 500 };
}
