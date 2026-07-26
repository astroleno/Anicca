export const GROWTH_OPERATORS = [
  "expand",
  "counter_aha",
  "merge_promote",
  "resonate",
  "reframe"
] as const;

export type GrowthOperator = (typeof GROWTH_OPERATORS)[number];

export type UserAgentIntent = "search" | "reflect" | "create" | "compare" | "confess" | "continue";

export type MemoryRef = {
  id: string;
  label: string;
  source: "explicit" | "session" | "workspace";
  confidence: number;
  scope: "turn" | "session" | "workspace";
  decay?: "fast" | "normal" | "slow";
  expiresAt?: string;
};

export type UserAgentEvent = {
  id: string;
  text: string;
  intent: UserAgentIntent;
  affect: {
    mood: string[];
    intensity: number;
    uncertainty: number;
  };
  memoryRefs: MemoryRef[];
  tensions: string[];
  growthNeeds: string[];
};

export type ArtworkAgentProfile = {
  artworkId: string;
  title: string;
  voice: string;
  themes: string[];
  sensoryHooks: string[];
  memoryAffinities: string[];
  capabilities: GrowthOperator[];
  constraints?: string[];
};

export type ArtworkAgentResponse = {
  artworkId: string;
  operator: GrowthOperator;
  stance: "resonates" | "opposes" | "extends" | "synthesizes";
  text: string;
  summary: string;
  memoryHooks: string[];
  tensionDelta: string;
  confidence: number;
};

export type GrowthSession = {
  requestId: string;
  userEvent: UserAgentEvent;
  candidates: ArtworkAgentProfile[];
  responses: ArtworkAgentResponse[];
  synthesis?: {
    operator: "merge_promote";
    text: string;
    summary: string;
    sourceArtworkIds: string[];
  };
};

export type GrowthNodeMeta = {
  eventId?: string;
  operator?: GrowthOperator;
  artworkId?: string;
  sourceArtworkIds?: string[];
  memoryRefIds?: string[];
  confidence?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`invalid_${label}`);
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string, error: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(error);
  }
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireStringArray(record: Record<string, unknown>, key: string, error: string) {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(error);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function requireConfidence(value: unknown, error: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(error);
  }
  return value;
}

export function isGrowthOperator(value: unknown): value is GrowthOperator {
  return typeof value === "string" && GROWTH_OPERATORS.includes(value as GrowthOperator);
}

export function parseGrowthOperator(value: unknown): GrowthOperator {
  if (!isGrowthOperator(value)) {
    throw new Error("invalid_growth_operator");
  }
  return value;
}

function parseIntent(value: unknown): UserAgentIntent {
  if (
    value === "search" ||
    value === "reflect" ||
    value === "create" ||
    value === "compare" ||
    value === "confess" ||
    value === "continue"
  ) {
    return value;
  }
  throw new Error("invalid_user_agent_event_intent");
}

function parseMemoryRef(value: unknown): MemoryRef {
  const record = requireRecord(value, "memory_ref");
  const source = record.source;
  const scope = record.scope;
  const decay = record.decay;
  if (source !== "explicit" && source !== "session" && source !== "workspace") {
    throw new Error("invalid_memory_ref_source");
  }
  if (scope !== "turn" && scope !== "session" && scope !== "workspace") {
    throw new Error("invalid_memory_ref_scope");
  }
  if (decay !== undefined && decay !== "fast" && decay !== "normal" && decay !== "slow") {
    throw new Error("invalid_memory_ref_decay");
  }

  const expiresAt = optionalString(record, "expiresAt");
  if (scope !== "turn" && !decay && !expiresAt) {
    throw new Error("invalid_memory_ref_lifecycle");
  }

  return {
    id: requireString(record, "id", "invalid_memory_ref_id"),
    label: requireString(record, "label", "invalid_memory_ref_label"),
    source,
    confidence: requireConfidence(record.confidence, "invalid_memory_ref_confidence"),
    scope,
    ...(decay ? { decay } : {}),
    ...(expiresAt ? { expiresAt } : {})
  };
}

export function parseUserAgentEvent(value: unknown): UserAgentEvent {
  const record = requireRecord(value, "user_agent_event");
  const affect = requireRecord(record.affect, "user_agent_event_affect");
  const memoryRefs = Array.isArray(record.memoryRefs)
    ? record.memoryRefs.map(parseMemoryRef)
    : [];

  return {
    id: requireString(record, "id", "invalid_user_agent_event_id"),
    text: requireString(record, "text", "invalid_user_agent_event_text"),
    intent: parseIntent(record.intent),
    affect: {
      mood: requireStringArray(affect, "mood", "invalid_user_agent_event_mood"),
      intensity: requireConfidence(affect.intensity, "invalid_user_agent_event_intensity"),
      uncertainty: requireConfidence(affect.uncertainty, "invalid_user_agent_event_uncertainty")
    },
    memoryRefs,
    tensions: requireStringArray(record, "tensions", "invalid_user_agent_event_tensions"),
    growthNeeds: requireStringArray(record, "growthNeeds", "invalid_user_agent_event_growth_needs")
  };
}

export function parseArtworkAgentProfile(value: unknown): ArtworkAgentProfile {
  const record = requireRecord(value, "artwork_agent_profile");
  const capabilities = requireStringArray(record, "capabilities", "invalid_artwork_agent_profile_capabilities")
    .map(parseGrowthOperator);
  if (!capabilities.length) {
    throw new Error("invalid_artwork_agent_profile_capabilities");
  }

  const constraints = Array.isArray(record.constraints)
    ? record.constraints.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;

  return {
    artworkId: requireString(record, "artworkId", "invalid_artwork_agent_profile_artwork_id"),
    title: requireString(record, "title", "invalid_artwork_agent_profile_title"),
    voice: requireString(record, "voice", "invalid_artwork_agent_profile_voice"),
    themes: requireStringArray(record, "themes", "invalid_artwork_agent_profile_themes"),
    sensoryHooks: requireStringArray(record, "sensoryHooks", "invalid_artwork_agent_profile_sensory_hooks"),
    memoryAffinities: requireStringArray(record, "memoryAffinities", "invalid_artwork_agent_profile_memory_affinities"),
    capabilities,
    ...(constraints?.length ? { constraints } : {})
  };
}

function parseStance(value: unknown): ArtworkAgentResponse["stance"] {
  if (value === "resonates" || value === "opposes" || value === "extends" || value === "synthesizes") {
    return value;
  }
  throw new Error("invalid_artwork_agent_response_stance");
}

export function parseArtworkAgentResponse(value: unknown): ArtworkAgentResponse {
  const record = requireRecord(value, "artwork_agent_response");
  return {
    artworkId: requireString(record, "artworkId", "invalid_artwork_agent_response_artwork_id"),
    operator: parseGrowthOperator(record.operator),
    stance: parseStance(record.stance),
    text: requireString(record, "text", "invalid_artwork_agent_response_text"),
    summary: requireString(record, "summary", "invalid_artwork_agent_response_summary"),
    memoryHooks: requireStringArray(record, "memoryHooks", "invalid_artwork_agent_response_memory_hooks"),
    tensionDelta: requireString(record, "tensionDelta", "invalid_artwork_agent_response_tension_delta"),
    confidence: requireConfidence(record.confidence, "invalid_artwork_agent_response_confidence")
  };
}
