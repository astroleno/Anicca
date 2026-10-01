import {
  generateBranches,
  generateSynthesis,
  type BranchesResponse,
  type GenerateBranchesInput,
  type GenerateSynthesisInput,
  type SynthesisResponse
} from "@/features/dialectic/api";
import type { PendingRequest, PendingSlot } from "@/features/dialectic/store";
import type { BranchGraphStore } from "@/store/branchGraph";

type ControllerRequestOptions = {
  fetchImpl?: typeof fetch;
};

export type BranchCommitInput = {
  targetAssistantId: string | null;
  userText: string;
  response: BranchesResponse;
};

export type BranchCommitResult = {
  userNodeId: string;
  thesisId: string;
  antithesisId: string;
};

export type SynthesisCommitInput = {
  thesisId: string;
  antithesisId: string;
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
    ? graphStore.createChildUserNode(input.targetAssistantId, input.userText)
    : graphStore.createUserNode(input.userText);
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
    label: input.response.synthesis.label
  });
}

/** Direct fission keeps the seed itself as the parent, without a synthetic user turn. */
export function commitSeedSplitResult(
  graphStore: BranchGraphStore,
  seedId: string,
  response: BranchesResponse
) {
  return graphStore.createAssistantPair(seedId, response);
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
