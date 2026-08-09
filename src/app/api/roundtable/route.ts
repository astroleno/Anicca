import { NextRequest, NextResponse } from "next/server";
import { buildRoundtablePrompt } from "@/features/roundtable/prompt";
import {
  RoundtableAction,
  RoundtableCommand,
  RoundtableParticipant,
  RoundtablePayload,
  RoundtableRound,
  RoundtableState
} from "@/features/roundtable/types";
import { getDefaultModel } from "@/lib/openai/client";
import { generateText } from "@/lib/openai/generateText";
import { parseFirstJsonObject } from "@/lib/openai/parseFirstJsonObject";
import { describeProviderFailure } from "@/lib/openai/providerErrors";

const ACTIONS = new Set<RoundtableAction>(["陈述", "质疑", "补充", "反驳", "修正", "综合"]);
const COMMANDS = new Set<RoundtableCommand>(["start", "continue", "deepen", "addParticipant", "conclude"]);

function invalidModelOutput(requestId: string, details: string) {
  return NextResponse.json({ requestId, error: "invalid_model_output", details }, { status: 502 });
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseParticipant(value: unknown): RoundtableParticipant | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const participant = {
    name: asText(candidate.name),
    mbti: asText(candidate.mbti),
    stance: asText(candidate.stance),
    reason: asText(candidate.reason)
  };

  return participant.name && participant.mbti && participant.stance && participant.reason ? participant : null;
}

function parseParticipants(value: unknown): RoundtableParticipant[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const participants = value.map(parseParticipant);
  return participants.every(Boolean) ? (participants as RoundtableParticipant[]) : null;
}

function parseRound(value: unknown): RoundtableRound | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.utterances)) {
    return null;
  }

  const utterances = candidate.utterances.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const utterance = entry as Record<string, unknown>;
    const action = asText(utterance.action) as RoundtableAction;
    const parsed = {
      speaker: asText(utterance.speaker),
      action,
      text: asText(utterance.text),
      summary: asText(utterance.summary)
    };

    return parsed.speaker && ACTIONS.has(action) && parsed.text && parsed.summary ? parsed : null;
  });

  const round = {
    guidingQuestion: asText(candidate.guidingQuestion),
    utterances,
    coreTension: asText(candidate.coreTension),
    framework: asText(candidate.framework),
    nextQuestion: asText(candidate.nextQuestion)
  };

  if (
    !round.guidingQuestion ||
    !round.coreTension ||
    !round.framework ||
    !round.nextQuestion ||
    round.utterances.length === 0 ||
    !round.utterances.every(Boolean)
  ) {
    return null;
  }

  return {
    ...round,
    utterances: round.utterances as RoundtableRound["utterances"]
  };
}

function parseOpenQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(asText).filter(Boolean);
}

function mergeParticipants(
  previous: RoundtableParticipant[],
  incoming: RoundtableParticipant[]
): RoundtableParticipant[] {
  const byName = new Map<string, RoundtableParticipant>();
  for (const participant of previous) {
    byName.set(participant.name, participant);
  }
  for (const participant of incoming) {
    byName.set(participant.name, participant);
  }
  return [...byName.values()];
}

function buildActiveState(
  topic: string,
  previousState: RoundtableState | undefined,
  parsed: Record<string, unknown>
): { state: RoundtableState; round: RoundtableRound } | null {
  const incomingParticipants = parseParticipants(parsed.participants);
  const round = parseRound(parsed.round);
  if (!incomingParticipants || !round) {
    return null;
  }

  const participants = previousState
    ? mergeParticipants(previousState.participants, incomingParticipants)
    : incomingParticipants;
  const rounds = previousState ? [...previousState.rounds, round] : [round];

  return {
    round,
    state: {
      topic,
      participants,
      rounds,
      currentQuestion: round.nextQuestion,
      nextQuestion: round.nextQuestion,
      lastCoreTension: round.coreTension,
      status: "active"
    }
  };
}

function buildConcludedState(
  previousState: RoundtableState,
  parsed: Record<string, unknown>
): RoundtableState | null {
  const incomingParticipants = parseParticipants(parsed.participants);
  const conclusion = asText(parsed.conclusion);
  const knowledgeNetwork = asText(parsed.knowledgeNetwork);
  const openQuestions = parseOpenQuestions(parsed.openQuestions);

  if (!incomingParticipants || !conclusion || !knowledgeNetwork) {
    return null;
  }

  return {
    ...previousState,
    participants: mergeParticipants(previousState.participants, incomingParticipants),
    status: "concluded",
    conclusion,
    knowledgeNetwork,
    openQuestions
  };
}

function parsePayload(body: unknown): RoundtablePayload | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const requestId = asText(candidate.requestId);
  const command = asText(candidate.command) as RoundtableCommand;
  if (!requestId || !COMMANDS.has(command)) {
    return null;
  }

  return {
    requestId,
    command,
    topic: asText(candidate.topic),
    state: candidate.state as RoundtableState | undefined,
    participantName: asText(candidate.participantName),
    model: asText(candidate.model)
  };
}

export async function POST(req: NextRequest) {
  let requestId = "";

  try {
    const payload = parsePayload(await req.json());
    requestId = payload?.requestId || "";

    if (!payload) {
      return NextResponse.json({ error: "requestId and valid command required" }, { status: 400 });
    }

    const topic = payload.command === "start" ? payload.topic : payload.state?.topic;
    if (!topic) {
      return NextResponse.json({ requestId, error: "topic required" }, { status: 400 });
    }

    if (payload.command !== "start" && !payload.state) {
      return NextResponse.json({ requestId, error: "state required" }, { status: 400 });
    }

    if (payload.command === "addParticipant" && !payload.participantName) {
      return NextResponse.json({ requestId, error: "participantName required" }, { status: 400 });
    }

    const model = getDefaultModel(payload.model);
    const { text: outputText } = await generateText({
      model,
      input: buildRoundtablePrompt({
        command: payload.command,
        topic,
        state: payload.state,
        participantName: payload.participantName
      }),
      maxOutputTokens: payload.command === "conclude" ? 2200 : 3000
    });

    const parsed = outputText ? parseFirstJsonObject(outputText) : null;
    if (!parsed || typeof parsed !== "object") {
      console.warn("/api/roundtable invalid model output", { requestId, outputText: outputText.slice(0, 500) });
      return invalidModelOutput(requestId, "expected roundtable JSON object");
    }

    if (payload.command === "conclude") {
      const state = buildConcludedState(payload.state as RoundtableState, parsed as Record<string, unknown>);
      if (!state) {
        console.warn("/api/roundtable malformed conclusion", { requestId, parsed });
        return invalidModelOutput(requestId, "payload missing conclusion, knowledgeNetwork, or participants");
      }

      return NextResponse.json({ requestId, state });
    }

    const active = buildActiveState(topic, payload.state, parsed as Record<string, unknown>);
    if (!active) {
      console.warn("/api/roundtable malformed round", { requestId, parsed });
      return invalidModelOutput(requestId, "payload missing participants or round");
    }

    return NextResponse.json({ requestId, state: active.state, round: active.round });
  } catch (error: unknown) {
    const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const message = typeof errorRecord.message === "string" ? errorRecord.message : "";
    const stack = typeof errorRecord.stack === "string" ? errorRecord.stack : undefined;
    const failure = describeProviderFailure(error);
    console.error("/api/roundtable error", { requestId, message, stack });
    return NextResponse.json(
      {
        requestId,
        error: "roundtable_failed",
        details: failure.details
      },
      { status: failure.status }
    );
  }
}
