# Anicca A2A Growth Agent Implement Plan

> **For agentic workers:** Execute this as an additive semantic layer on top of the current `/dialogue` mainline. Keep the existing `正 / 反 / 合` flow stable. Do not replace `BranchGraphStore` or move truth into UI state.

**Goal:** Upgrade Anicca from “user input selects tagged content” to “user input becomes a stateful user-agent event, artwork profiles respond as standardized sub-agents, and tags become traceable growth operators.”

**Design seed:** 用户输入可被视为携带人格状态、情绪、记忆线索的 agent；画作是标准化封装的子 agent；思维拓展、反方 aha moment、合并提拔从静态标签升级为生长形式。

---

## Plan Review Notes

Reviewed against the current `/dialogue` mainline on 2026-06-11.

Findings to resolve before implementation:

1. **UI integration risk:** The original plan names `DialogueShell.tsx`, but does not pin the write path to the existing `handleSubmit` / composer target model. Growth must be a separate command path from `生成正 / 反`, and must keep the existing pending/stale protection for branch and synthesis requests unchanged.
2. **Graph write risk:** `BranchGraphStore` currently only has canonical branch helpers plus independent assistant creation. Growth needs one narrow helper for assistant nodes with arbitrary growth metadata and explicit growth edge reasons; direct UI mutation of graph internals would bypass store invariants.
3. **Retrieval risk:** Adding growth edge reasons without extending retrieval relation typing would make explicit growth edges look like unsupported reserved reasons or unknown reasons. Retrieval must know growth relations before UI writes them.
4. **Scope risk:** A first slice does not need `/api/growth`; local deterministic orchestration is enough to validate contracts, graph projection, privacy boundaries, and UI semantics. The route remains deferred until model generation is necessary.
5. **Persistence risk:** Because workspace bundles already serialize graph objects structurally, namespaced `meta.growth` can be additive. The first slice should add compatibility tests only where retrieval or bundle validation would reject the new shape.

---

## First Slice Decisions

- Growth mode enters `/dialogue` through a local composer command labeled as artwork perspectives, not through the canonical `生成正 / 反` submit.
- The first slice is synchronous and deterministic: `runGrowthSession()` builds responses locally and does not call `/api/growth`.
- Growth assistant nodes use `kind: "assistant"` with no `branchType`, and provenance lives under `node.meta.growth`.
- Growth response nodes are children of the new user event node. A growth synthesis node is also attached to the user event and records source response node ids for inspectability.
- Edge reasons are explicit `growth:*` strings, and retrieval maps them to first-class growth relations.
- Artwork profiles live in code first; curator-authored JSON import is deferred.
- `counter_aha` is displayed as a separate artwork perspective, not as `反`.
- `merge_promote` creates a growth assistant node with `operator: "merge_promote"`, not a canonical `合` node.

---

## Core Decision

Implement an internal A2A contract first, not a broad agent framework.

- `UserAgentEvent`: one user turn as a temporary agent event with text, intent, affect, memory refs, tensions, and growth needs.
- `ArtworkAgentProfile`: one artwork as a standardized sub-agent with voice, themes, sensory hooks, memory affinities, and response capabilities.
- `GrowthOperator`: the semantic action that converts an interaction into graphable growth, such as `expand`, `counter_aha`, and `merge_promote`.
- `GrowthSession`: one routed exchange among the user event, candidate artwork agents, and the growth orchestrator.

The first implementation should keep all contracts local-first and serializable. Server routes may generate structured text, but graph mutation remains client-side.

---

## Scope

This plan owns:

- typed A2A growth contracts
- initial artwork-agent profile schema
- user input enrichment into `UserAgentEvent`
- growth operator routing and result synthesis
- graph metadata extensions for growth provenance
- minimal `/dialogue` integration point
- unit tests for contracts, routing, and graph projection
- one visual/manual smoke path for the growth mode

This plan does **not** own:

- a persistent user identity system
- cloud memory sync
- recommender ranking based on private cross-project data
- replacing `/api/branches` or `/api/synthesis`
- new 3D or raymarching visual work
- external A2A protocol compliance beyond an internal message envelope

---

## Privacy And Memory Boundary

- Treat affect and personality as turn-scoped inference by default.
- Long-term memory writes require an explicit `memoryWritePolicy`.
- Every memory ref must include `source`, `scope`, `confidence`, and `expiresAt` or `decay`.
- Do not infer diagnosis, protected traits, or permanent personality labels.
- User-visible memory entries must be editable or deletable before later reuse.
- Growth output should say “this response resonates with the current event,” not “this is who the user is.”

---

## Domain Contracts

### `UserAgentEvent`

```ts
type UserAgentEvent = {
  id: string;
  text: string;
  intent: "search" | "reflect" | "create" | "compare" | "confess" | "continue";
  affect: {
    mood: string[];
    intensity: number;
    uncertainty: number;
  };
  memoryRefs: Array<{
    id: string;
    label: string;
    source: "explicit" | "session" | "workspace";
    confidence: number;
    scope: "turn" | "session" | "workspace";
    decay?: "fast" | "normal" | "slow";
    expiresAt?: string;
  }>;
  tensions: string[];
  growthNeeds: string[];
};
```

### `ArtworkAgentProfile`

```ts
type ArtworkAgentProfile = {
  artworkId: string;
  title: string;
  voice: string;
  themes: string[];
  sensoryHooks: string[];
  memoryAffinities: string[];
  capabilities: GrowthOperator[];
  constraints?: string[];
};
```

### `GrowthOperator`

```ts
type GrowthOperator =
  | "expand"
  | "counter_aha"
  | "merge_promote"
  | "resonate"
  | "reframe";
```

### `ArtworkAgentResponse`

```ts
type ArtworkAgentResponse = {
  artworkId: string;
  operator: GrowthOperator;
  stance: "resonates" | "opposes" | "extends" | "synthesizes";
  text: string;
  summary: string;
  memoryHooks: string[];
  tensionDelta: string;
  confidence: number;
};
```

### `GrowthSession`

```ts
type GrowthSession = {
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
```

---

## Graph Model

Do not add a new node kind in the first slice. Reuse the current `user` and `assistant` nodes, and add optional metadata behind a namespaced growth field.

```ts
type GrowthNodeMeta = {
  growth?: {
    eventId?: string;
    operator?: GrowthOperator;
    artworkId?: string;
    sourceArtworkIds?: string[];
    memoryRefIds?: string[];
    confidence?: number;
  };
};
```

Recommended edge reasons:

- `growth:resonate`
- `growth:counter_aha`
- `growth:expand`
- `growth:merge_promote`
- `growth:memory_ref`

This keeps existing retrieval and export paths compatible while allowing later graph retrieval to distinguish dialectic edges from artwork-growth edges.

---

## Files

| File | Responsibility | Action |
|---|---|---|
| `src/features/growth/types.ts` | Shared A2A growth contracts | Create |
| `src/features/growth/userEvent.ts` | Build and validate `UserAgentEvent` from raw input | Create |
| `src/features/growth/artworkAgents.ts` | Artwork profile registry and validation | Create |
| `src/features/growth/router.ts` | Select candidate artwork agents and operators | Create |
| `src/features/growth/orchestrator.ts` | Compose routed responses into a `GrowthSession` | Create |
| `src/features/growth/graphProjection.ts` | Convert growth sessions into graph nodes/meta/edges | Create |
| `src/features/growth/*.test.ts` | Contract, routing, and projection coverage | Create |
| `src/app/api/growth/route.ts` | Optional stateless structured generation route | Deferred |
| `src/app/api/growth/growth-route.test.ts` | Route contract tests if route is added | Deferred |
| `src/types/anicca.ts` | Optional namespaced growth metadata type | Modify |
| `src/store/branchGraph.ts` | Minimal helper for growth assistant creation only if projection needs it | Modify |
| `src/features/retrieval/types.ts` | Add growth relations once graph projection exists | Modify |
| `src/features/retrieval/workspaceGraphQuery.ts` | Index growth metadata and edges | Modify |
| `src/components/dialogue/DialogueShell.tsx` | Add one growth-mode entry point without replacing dialectic mode | Modify |
| `src/components/dialogue/DialogueShell.test.tsx` | Cover growth-mode submit and graph write | Modify |
| `docs/superpowers/plans/2026-06-11-anicca-a2a-growth-agent-implement-plan.md` | This plan | Maintain |

---

## Implementation Units

### Unit 1: Freeze contracts

- [x] Create `src/features/growth/types.ts`.
- [x] Add runtime validators or narrow parsing helpers for all external/model-shaped data.
- [x] Keep `GrowthOperator` values stable and lowercase.
- [x] Add tests that reject missing `artworkId`, empty response text, invalid operator, and out-of-range confidence.

### Unit 2: Build `UserAgentEvent`

- [x] Create deterministic `buildUserAgentEvent(input)` for the first slice.
- [x] Infer only low-risk fields from text: intent, uncertainty, tension keywords, and growth needs.
- [x] Keep inferred affect turn-scoped by not writing it to long-term memory.
- [x] Add tests for empty input, reflective input, compare input, and high-uncertainty input.

### Unit 3: Standardize artwork sub-agents

- [x] Create an initial local artwork-agent registry with 3-5 sample profiles.
- [x] Ensure every artwork profile declares capabilities rather than free-form tags.
- [x] Add validation that a profile cannot route an operator it does not support.
- [x] Keep artwork content data separate from user memory data.

### Unit 4: Implement growth routing

- [x] Create `rankArtworkAgents(userEvent, artworkAgents)`.
- [x] Score by overlap among `themes`, `sensoryHooks`, `memoryAffinities`, and `growthNeeds`.
- [x] Select operators by user tension; `merge_promote` is emitted by orchestration when multiple responses exist.
- [x] Return deterministic scores for tests; do not call the model in routing tests.

### Unit 5: Add growth orchestration

- [x] Create `runGrowthSession(input)` that returns a complete `GrowthSession`.
- [x] In MVP, generate templated responses locally or behind a mocked generator.
- [x] Defer `/api/growth` until model generation is required. If later added, follow existing route semantics: `400` for caller errors, `502 invalid_model_output` for malformed model output, provider failure status from `describeProviderFailure`.
- [x] Include `requestId` in every request and response.

### Unit 6: Project growth into the graph

- [x] Create graph projection helpers that write one user node and multiple assistant nodes.
- [x] Store artwork/operator provenance under `node.meta.growth`.
- [x] Use explicit edge reasons for growth relations.
- [x] Preserve current `正 / 反 / 合` behavior; growth projection must not mutate branch ordering.
- [x] Confirm additive `meta.growth` remains compatible with structural workspace bundle validation.

### Unit 7: Retrieval integration

- [x] Extend retrieval relation types with growth relations.
- [x] Index `meta.growth.operator`, `artworkId`, and growth summaries.
- [x] Add tests that query by operator and artwork id.
- [x] Ensure synthesis `sourceNodeIds` backfill remains unchanged.

### Unit 8: Minimal `/dialogue` integration

- [x] Add a small command path for growth mode in the composer.
- [x] Submit flow should create a `UserAgentEvent`, run a growth session, and project responses into the current workspace graph.
- [x] UI copy should present responses as artwork perspectives, not personality judgments.
- [x] Keep the existing composer and focus model intact.
- [x] Add tests that growth mode writes graph metadata and does not call `/api/branches`.

### Unit 9: Verification and release gate

- [x] Run targeted growth tests.
- [x] Run existing dialectic tests to confirm no regression.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [ ] Run `npm run test:visual-dialogue` if `/dialogue` UI changes.
- [x] Document any deferred product decisions in this plan before closing.

### Verification Notes

- `npx vitest run src/features/growth/*.test.ts src/features/retrieval/workspaceGraphQuery.test.ts src/store/branchGraph.test.ts` passed: 9 files, 60 tests.
- Mainline targeted regression passed: 13 files, 127 tests.
- `npm test` passed: 28 files, 221 tests.
- `npm run lint` passed with 36 existing warnings and no errors.
- Growth visual smoke is scheduled after the production build gate in the mainline release closeout; the checkbox remains open until its artifacts are reviewed.

---

## Test Matrix

| File | Scenario |
|---|---|
| `src/features/growth/types.test.ts` | operator validation, confidence bounds, required fields |
| `src/features/growth/userEvent.test.ts` | intent inference, turn-scoped affect, memory boundary |
| `src/features/growth/artworkAgents.test.ts` | profile validation and capability constraints |
| `src/features/growth/router.test.ts` | deterministic ranking and operator selection |
| `src/features/growth/orchestrator.test.ts` | session shape, request id echo, response provenance |
| `src/features/growth/graphProjection.test.ts` | graph nodes, meta growth fields, edge reasons |
| `src/features/retrieval/workspaceGraphQuery.test.ts` | growth relation indexing and query |
| `src/components/dialogue/DialogueShell.test.tsx` | growth mode submit writes graph without breaking dialectic mode |
| `src/app/api/growth/growth-route.test.ts` | Deferred until `/api/growth` is added |

---

## Sequencing

1. Land pure TypeScript contracts and validators.
2. Land deterministic user-event builder and artwork registry.
3. Land router and orchestrator without UI.
4. Land graph projection and retrieval coverage.
5. Wire one `/dialogue` entry point.
6. Run full verification and document release decision.

---

## Exit Criteria

- Growth contracts are typed and tested.
- A raw user input can become a `UserAgentEvent` without model calls.
- At least three artwork sub-agents can respond through `expand`, `counter_aha`, or `merge_promote`.
- Growth output is stored with traceable artwork/operator provenance.
- Existing `正 / 反 / 合` tests still pass.
- Retrieval can distinguish growth edges from dialectic lineage edges.
- `/dialogue` can enter growth mode without breaking the current composer/focus flow.
- No long-term memory is written without an explicit policy and provenance.

---

## Open Questions

- Resolved for slice 1: artwork profiles live in code first.
- Resolved for slice 1: `counter_aha` is shown as a separate artwork perspective, not as `反`.
- Resolved for slice 1: `merge_promote` creates a growth assistant node with `operator: "merge_promote"`, not a canonical `合`.
- Deferred: What is the first real artwork corpus this should target?
- Deferred: Which memory controls need to be visible before any long-term memory reuse?
