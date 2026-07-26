import { assertArtworkSupportsOperator, getArtworkAgentProfiles } from "./artworkAgents";
import { ArtworkAgentProfile, GrowthOperator, UserAgentEvent } from "./types";

export type RankedArtworkAgent = {
  profile: ArtworkAgentProfile;
  score: number;
  matchedSignals: string[];
};

export type RoutedArtworkAgent = RankedArtworkAgent & {
  operator: GrowthOperator;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function signalMatches(text: string, signal: string) {
  const normalizedSignal = normalize(signal);
  if (!normalizedSignal) {
    return false;
  }
  return text.includes(normalizedSignal) || normalizedSignal.includes(text);
}

function collectProfileSignals(profile: ArtworkAgentProfile) {
  return [
    ...profile.themes,
    ...profile.sensoryHooks,
    ...profile.memoryAffinities
  ];
}

function collectEventSignals(event: UserAgentEvent) {
  return [
    event.intent,
    ...event.affect.mood,
    ...event.tensions,
    ...event.growthNeeds,
    ...event.memoryRefs.map((ref) => ref.label)
  ];
}

function scoreProfile(event: UserAgentEvent, profile: ArtworkAgentProfile) {
  const eventText = normalize(event.text);
  const eventSignals = collectEventSignals(event).map(normalize);
  const matchedSignals = new Set<string>();
  let score = 0;

  for (const signal of collectProfileSignals(profile)) {
    const normalizedSignal = normalize(signal);
    if (!normalizedSignal) {
      continue;
    }

    if (eventText.includes(normalizedSignal)) {
      score += 3;
      matchedSignals.add(signal);
      continue;
    }

    if (eventSignals.some((eventSignal) => signalMatches(eventSignal, normalizedSignal))) {
      score += 2;
      matchedSignals.add(signal);
    }
  }

  for (const capability of profile.capabilities) {
    if (capability === "resonate" && event.growthNeeds.length === 1) {
      continue;
    }
    if (event.growthNeeds.includes(capability)) {
      score += 1;
      matchedSignals.add(capability);
    }
  }

  return {
    score,
    matchedSignals: [...matchedSignals].sort()
  };
}

export function rankArtworkAgents(
  userEvent: UserAgentEvent,
  artworkAgents: ArtworkAgentProfile[] = getArtworkAgentProfiles()
): RankedArtworkAgent[] {
  return artworkAgents
    .map((profile, index) => {
      const scored = scoreProfile(userEvent, profile);
      return {
        profile,
        score: scored.score || Math.max(0, 1 - index * 0.1),
        matchedSignals: scored.matchedSignals
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.profile.artworkId.localeCompare(right.profile.artworkId);
    });
}

function preferredOperatorsForEvent(userEvent: UserAgentEvent): GrowthOperator[] {
  const preferred: GrowthOperator[] = [];
  if (userEvent.tensions.includes("single_frame")) preferred.push("counter_aha");
  if (userEvent.growthNeeds.includes("expand")) preferred.push("expand");
  if (userEvent.intent === "compare" || userEvent.growthNeeds.includes("reframe")) preferred.push("reframe");
  if (userEvent.intent === "confess") preferred.push("resonate");
  preferred.push("resonate", "expand", "reframe", "counter_aha");

  return preferred.filter((operator, index) => preferred.indexOf(operator) === index);
}

export function selectGrowthOperator(
  userEvent: UserAgentEvent,
  profile: ArtworkAgentProfile,
  responseIndex = 0
): GrowthOperator {
  const preferred = preferredOperatorsForEvent(userEvent);
  const rotated = [
    ...preferred.slice(responseIndex),
    ...preferred.slice(0, responseIndex)
  ];
  const operator = rotated.find((candidate) => profile.capabilities.includes(candidate));
  if (!operator) {
    return profile.capabilities[0];
  }
  assertArtworkSupportsOperator(profile, operator);
  return operator;
}

export function routeArtworkAgents(
  userEvent: UserAgentEvent,
  artworkAgents: ArtworkAgentProfile[] = getArtworkAgentProfiles(),
  limit = 3
): RoutedArtworkAgent[] {
  return rankArtworkAgents(userEvent, artworkAgents)
    .slice(0, Math.max(1, limit))
    .map((ranked, index) => ({
      ...ranked,
      operator: selectGrowthOperator(userEvent, ranked.profile, index)
    }));
}
