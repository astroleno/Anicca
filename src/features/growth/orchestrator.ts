import { getArtworkAgentProfiles } from "./artworkAgents";
import { routeArtworkAgents } from "./router";
import {
  ArtworkAgentProfile,
  ArtworkAgentResponse,
  GrowthOperator,
  GrowthSession,
  MemoryRef,
  UserAgentEvent,
  parseArtworkAgentProfile,
  parseArtworkAgentResponse
} from "./types";
import { buildUserAgentEvent } from "./userEvent";

type RunGrowthSessionInput = {
  text: string;
  requestId?: string;
  memoryRefs?: MemoryRef[];
  artworkAgents?: ArtworkAgentProfile[];
  candidateLimit?: number;
};

const OPERATOR_SUMMARY: Record<GrowthOperator, string> = {
  expand: "拓宽当前事件的感知边界",
  counter_aha: "从反向细节里制造一个 aha moment",
  merge_promote: "把多个回应提拔成下一层问题",
  resonate: "贴近当前事件的情绪回声",
  reframe: "换一个框架重新安放张力"
};

const OPERATOR_STANCE: Record<GrowthOperator, ArtworkAgentResponse["stance"]> = {
  expand: "extends",
  counter_aha: "opposes",
  merge_promote: "synthesizes",
  resonate: "resonates",
  reframe: "extends"
};

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function responseText(profile: ArtworkAgentProfile, userEvent: UserAgentEvent, operator: GrowthOperator) {
  const hook = profile.sensoryHooks[0] || profile.themes[0] || "细节";
  const tension = userEvent.tensions[0] || "当前事件";
  const need = userEvent.growthNeeds[0] || operator;

  if (operator === "counter_aha") {
    return `「${profile.title}」先不急着赞同。它从${hook}里指出一个反向细节：你现在最想固定的判断，也许正是可以松动的地方。`;
  }
  if (operator === "reframe") {
    return `「${profile.title}」把这句话从结论改写成场景：先看见${tension}如何出现，再决定要不要推进。`;
  }
  if (operator === "expand") {
    return `「${profile.title}」沿着${hook}把问题展开：除了马上回答，还可以追踪它牵出的${need}。`;
  }
  if (operator === "merge_promote") {
    return `「${profile.title}」把分散的回应收拢成一个更高层的问题：哪一种下一步能同时保留张力和行动？`;
  }
  return `「${profile.title}」与这个回合产生共振：它回应的是当前事件里的${tension}，而不是给用户贴上固定标签。`;
}

function responseSummary(profile: ArtworkAgentProfile, operator: GrowthOperator) {
  return `${profile.title}：${OPERATOR_SUMMARY[operator]}`;
}

function responseMemoryHooks(profile: ArtworkAgentProfile, userEvent: UserAgentEvent) {
  const explicitRefs = userEvent.memoryRefs.map((ref) => ref.id);
  return [...explicitRefs, ...profile.memoryAffinities].slice(0, 3);
}

function parseArtworkAgentProfiles(profiles: ArtworkAgentProfile[]) {
  const seen = new Set<string>();
  return profiles.map((profile) => {
    const parsed = parseArtworkAgentProfile(profile);
    if (seen.has(parsed.artworkId)) {
      throw new Error(`duplicate_artwork_agent_profile:${parsed.artworkId}`);
    }
    seen.add(parsed.artworkId);
    return parsed;
  });
}

export function runGrowthSession(input: string | RunGrowthSessionInput): GrowthSession {
  const text = typeof input === "string" ? input : input.text;
  const requestId = typeof input === "string" ? undefined : input.requestId;
  const userEvent = buildUserAgentEvent({
    text,
    requestId,
    memoryRefs: typeof input === "string" ? undefined : input.memoryRefs
  });
  const profiles = parseArtworkAgentProfiles(
    typeof input === "string"
      ? getArtworkAgentProfiles()
      : input.artworkAgents || getArtworkAgentProfiles()
  );
  const routed = routeArtworkAgents(userEvent, profiles, typeof input === "string" ? 3 : input.candidateLimit ?? 3);
  const responses = routed.map((route, index) => parseArtworkAgentResponse({
    artworkId: route.profile.artworkId,
    operator: route.operator,
    stance: OPERATOR_STANCE[route.operator],
    text: responseText(route.profile, userEvent, route.operator),
    summary: responseSummary(route.profile, route.operator),
    memoryHooks: responseMemoryHooks(route.profile, userEvent),
    tensionDelta: route.operator === "counter_aha"
      ? "loosens_single_frame"
      : route.operator === "reframe"
        ? "moves_frame"
        : "adds_context",
    confidence: clampConfidence(0.58 + Math.min(route.score, 8) * 0.04 - userEvent.affect.uncertainty * 0.08 + index * 0.01)
  }));

  return {
    requestId: requestId || userEvent.id,
    userEvent,
    candidates: routed.map((route) => route.profile),
    responses,
    ...(responses.length >= 2
      ? {
          synthesis: {
            operator: "merge_promote" as const,
            text: "这些画作视角共同把输入提拔成一个可继续生长的问题：先保留未定之处，再选择一个最小动作去验证。",
            summary: "合并画作视角，提拔为下一问",
            sourceArtworkIds: responses.map((response) => response.artworkId)
          }
        }
      : {})
  };
}
