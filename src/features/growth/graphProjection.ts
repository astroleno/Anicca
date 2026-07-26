import { BranchGraphStore } from "@/store/branchGraph";
import { AniccaNodeMeta } from "@/types/anicca";
import { GrowthSession } from "./types";

export type GrowthProjectionResult = {
  userNodeId: string;
  responseNodeIds: string[];
  synthesisNodeId: string | null;
};

type GrowthProjectionOptions = {
  targetAssistantId?: string | null;
};

function averageConfidence(session: GrowthSession) {
  if (!session.responses.length) {
    return undefined;
  }
  const total = session.responses.reduce((sum, response) => sum + response.confidence, 0);
  return Number((total / session.responses.length).toFixed(2));
}

function eventMeta(session: GrowthSession): Pick<AniccaNodeMeta, "growth"> {
  return {
    growth: {
      eventId: session.userEvent.id,
      memoryRefIds: session.userEvent.memoryRefs.map((ref) => ref.id)
    }
  };
}

export function projectGrowthSessionToGraph(
  store: BranchGraphStore,
  session: GrowthSession,
  options: GrowthProjectionOptions = {}
): GrowthProjectionResult {
  const userNodeId = options.targetAssistantId
    ? store.createChildUserNode(options.targetAssistantId, session.userEvent.text)
    : store.createUserNode(session.userEvent.text);

  store.patchNodeMeta(userNodeId, eventMeta(session));

  const profileByArtworkId = new Map(session.candidates.map((profile) => [profile.artworkId, profile]));
  const responseNodeIds = session.responses.map((response) => {
    const profile = profileByArtworkId.get(response.artworkId);
    return store.createGrowthAssistant([userNodeId], {
      text: response.text,
      summary: response.summary,
      label: profile?.title || response.artworkId,
      growth: {
        eventId: session.userEvent.id,
        operator: response.operator,
        artworkId: response.artworkId,
        memoryRefIds: session.userEvent.memoryRefs.map((ref) => ref.id),
        confidence: response.confidence
      },
      edgeReason: `growth:${response.operator}`
    });
  });

  const synthesisNodeId = session.synthesis
    ? store.createGrowthAssistant([userNodeId, ...responseNodeIds], {
        text: session.synthesis.text,
        summary: session.synthesis.summary,
        label: "画作合并",
        sourceNodeIds: responseNodeIds,
        growth: {
          eventId: session.userEvent.id,
          operator: "merge_promote",
          sourceArtworkIds: session.synthesis.sourceArtworkIds,
          memoryRefIds: session.userEvent.memoryRefs.map((ref) => ref.id),
          confidence: averageConfidence(session)
        },
        edgeReason: "growth:merge_promote"
      })
    : null;

  return {
    userNodeId,
    responseNodeIds,
    synthesisNodeId
  };
}
