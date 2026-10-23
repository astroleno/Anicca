import {
  generateBranches,
  generatePolarity,
  generateSynthesis,
  type BranchesResponse,
  type GenerateBranchesInput,
  type GeneratePolarityInput,
  type PolarityResponse,
  type GenerateSynthesisInput,
  type SynthesisResponse
} from "@/features/dialectic/api";
import type { PendingRequest, PendingSlot } from "@/features/dialectic/store";
import type { BranchGraphStore } from "@/store/branchGraph";
import type { SeedPerspective, ThinkingSpace } from "@/features/perspectives/model";

type ControllerRequestOptions = {
  fetchImpl?: typeof fetch;
};

export type BranchCommitInput = {
  targetAssistantId: string | null;
  userText: string;
  response: BranchesResponse;
  perspective?: SeedPerspective;
};

export type BranchCommitResult = {
  userNodeId: string;
  thesisId: string;
  antithesisId: string;
};

export type SynthesisCommitInput = {
  thesisId: string;
  antithesisId: string;
  sourceInstanceIds?: [string, string];
  response: SynthesisResponse;
};

export function ownsPendingResponse(
  pending: PendingRequest | null,
  responseRequestId: string,
  activeWorkspaceSessionId: string
): pending is PendingRequest {
  return Boolean(
    pending &&
      pending.requestId === responseRequestId &&
      pending.workspaceSessionId === activeWorkspaceSessionId
  );
}

export function commitBranchesResult(
  graphStore: BranchGraphStore,
  input: BranchCommitInput
): BranchCommitResult {
  const userNodeId = input.targetAssistantId
    ? graphStore.createChildUserNode(input.targetAssistantId, input.userText, input.perspective)
    : graphStore.createUserNode(input.userText, input.perspective);
  const { thesisId, antithesisId } = graphStore.createAssistantPair(userNodeId, {
    thesis: input.response.thesis,
    antithesis: input.response.antithesis
  });

  return { userNodeId, thesisId, antithesisId };
}

export function commitSynthesisResult(
  graphStore: BranchGraphStore,
  input: SynthesisCommitInput
): string {
  return graphStore.createSynthesisAssistant([input.thesisId, input.antithesisId], {
    text: input.response.synthesis.text,
    summary: input.response.synthesis.summary,
    label: input.response.synthesis.label,
    sourceInstanceIds: input.sourceInstanceIds,
    perspective: input.response.synthesis.perspective
  });
}

/** Direct fission keeps the seed itself as the parent, without a synthetic user turn. */
export function commitSeedSplitResult(
  graphStore: BranchGraphStore,
  seedId: string,
  response: BranchesResponse,
  frame?: ThinkingSpace
) {
  return graphStore.createAssistantPair(seedId, { ...response, frame });
}

export function commitPolarityResult(graphStore: BranchGraphStore, sourceId: string, frame: ThinkingSpace, response: PolarityResponse) {
  return graphStore.createPolarityPair(sourceId, { groupId: response.requestId, axisId: response.axis.id, frame,
    negative: response.negative, positive: response.positive });
}

/**
 * Owns network cancellation only. Graph mutation and request ownership remain
 * explicit use-case steps so a cancelled or late response can never write by
 * merely finishing an animation.
 */
export class DialogueController {
  private requests = new Map<PendingSlot, AbortController>();

  async generateBranches(
    input: GenerateBranchesInput,
    options: ControllerRequestOptions = {}
  ): Promise<BranchesResponse> {
    const controller = this.replace("branches");
    try {
      return await generateBranches(input, {
        signal: controller.signal,
        fetchImpl: options.fetchImpl
      });
    } finally {
      this.release("branches", controller);
    }
  }

  async generateSynthesis(
    input: GenerateSynthesisInput,
    options: ControllerRequestOptions = {}
  ): Promise<SynthesisResponse> {
    const controller = this.replace("synthesis");
    try {
      return await generateSynthesis(input, {
        signal: controller.signal,
        fetchImpl: options.fetchImpl
      });
    } finally {
      this.release("synthesis", controller);
    }
  }

  async generatePolarity(input: GeneratePolarityInput, options: ControllerRequestOptions = {}): Promise<PolarityResponse> {
    const controller = this.replace("branches");
    try {
      return await generatePolarity(input, { signal: controller.signal, fetchImpl: options.fetchImpl });
    } finally {
      this.release("branches", controller);
    }
  }

  cancel(slot: PendingSlot): void {
    this.requests.get(slot)?.abort();
    this.requests.delete(slot);
  }

  cancelAll(): void {
    for (const request of this.requests.values()) {
      request.abort();
    }
    this.requests.clear();
  }

  private replace(slot: PendingSlot): AbortController {
    this.cancel(slot);
    const controller = new AbortController();
    this.requests.set(slot, controller);
    return controller;
  }

  private release(slot: PendingSlot, controller: AbortController): void {
    if (this.requests.get(slot) === controller) {
      this.requests.delete(slot);
    }
  }
}
