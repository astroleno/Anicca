# Anicca Dialectic V2 Frontend Implement Plan

> **For agentic workers:** Execute this as the frontend slice of the Dialectic V2 mainline. Keep all UI behavior rooted in `branchGraph -> view-model -> UI`. Do not move truth into layout or animation code.

**Goal:** Land a local-first `/dialogue` shell that correctly supports continuation from any focus, explicit synthesis, dual-source `合` semantics, responsive layout, accessibility, and workspace restoration.

**Origin spec:** `docs/superpowers/specs/2026-04-23-anicca-dialectic-v2-mainline-design.md`

**Origin master plan:** `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`

---

## Scope

This plan owns:

- graph/type changes required by local-first dialogue flow
- synthesis-aware context traversal
- dialogue view-model and UI state
- request matching and stale-response discard
- dialogue shell components
- responsive and accessibility contract
- local persistence of graph plus workspace state

This plan does **not** own:

- server route internals beyond consuming their published contract
- root route migration and legacy banner rollout

---

## Post-Review Update: Frontend Quality Bar

Review source: multi-agent frontend review on 2026-04-24 against current `/dialogue`, `ref/anicca`, `ref/newframe`, shader / GSAP / bubbles references, and archived visual experiments.

The current implementation has a stronger product data model than `ref/anicca`, but the visual/interaction layer has drifted toward a generic dark glass workbench. Future frontend work must preserve the graph/view-model truth source while restoring Anicca's product-specific interaction DNA: a concept field where a mother topic splits, holds tension, and synthesizes.

### Review Findings To Address Before Further Visual Expansion

- [ ] Fix root/body overflow so `/dialogue` can scroll on mobile when layout becomes vertical.
- [ ] Replace `100vh` / `100vw` in main and experiment shells with `100dvh`, `100%`, or `inset: 0` as appropriate.
- [ ] Add stage safe-area layout rules so bubbles cannot be hidden by sidebar, panel, or composer.
- [ ] Add mobile bubble layout rules that avoid overlap between root / 正 / 反 / 合 nodes.
- [ ] Make branch and synthesis pending states mutually exclusive in UI controls.
- [ ] Add synthesis loading / disabled / `aria-busy` feedback to `ConversationPanel`.
- [ ] Remove `role="tree"` / `treeitem` from sidebar unless a real tree keyboard model is implemented.
- [ ] Remove render-time `console.log`, mock labels, English prototype copy, and debug-only UI from any component promoted into the mainline.
- [ ] Add `prefers-reduced-motion` and low-performance fallbacks for infinite CSS animation and shader loops.

### Revised Visual Direction

- Mainline should be **low-saturation dark field + living blob stage + restrained operational chrome**.
- The center stage is the first visual protagonist. Sidebar, panel, and composer must support it rather than compete with it.
- Keep the current Graph / source tracking / local persistence / request matching work; these are productized improvements over `ref/anicca`.
- Reintroduce `ref/anicca` DNA selectively:
  - BlobVisual / BlobContent separation.
  - visible focus ring and hover/detail affordance.
  - the feeling that 正 and 反 can be brought into tension before 合 appears.
- Use `ref/newframe` and shader experiments as a future visual engine direction:
  - WebGPU 2D metaball / mochi texture is preferred over full 3D raymarching for the mainline.
  - `src/components/MetaballCanvas.tsx` cannot be promoted until labels, graph data, accessibility, reduced motion, and debug cleanup are handled.
- Do not copy wholesale:
  - client-side Gemini flow from `ref/anicca`
  - arbitrary-node synthesis from `ref/anicca`
  - neon raymarching, bubbles background, or full GSAP demos as the primary product shell

### Design Score Baseline

The reviewed implementation baseline is:

- Philosophy consistency: 7/10
- Visual hierarchy: 5/10
- Detail execution: 5/10
- Functionality: 8/10
- Innovation: 6/10

The next frontend pass should raise visual hierarchy and detail execution first, without weakening functionality.

---

## Canonical UI Rules

- Desktop shell is fixed: `sidebar | stage | panel` with `composer` docked at the bottom, but stage coordinates must reserve safe areas for side panels and bottom composer.
- Tablet shell is fixed: top horizontal `sidebar chips`, then `stage | panel`, then bottom `composer`.
- Mobile shell is vertical and scrollable: compact brand/status, stage, horizontal `sidebar chips`, panel, sticky `composer`.
- First version does **not** use tabbed sheets, floating drawers, or alternate mobile navigation metaphors.
- When focus is a `合` node:
  - breadcrumb follows `lineageParentId`
  - sidebar renders `合` under its shared parent `user`
  - composer target is the `合` node itself
  - stage shows `合` centered, sources left-up and right-up

## Concurrency And Session Contract

- Every branch/synthesis request gets a client-generated `requestId`.
- The UI store tracks `workspaceSessionId`, `activeRequestId`, `focusSnapshotId`, and `composerTargetId` for each pending request slot.
- A response may mutate graph state only if:
  - its `requestId` matches the active request
  - the pending slot is still open
  - the originating `workspaceSessionId` still owns the request
- Stale responses from retries, focus changes, or other tabs are dropped and logged.

## Legacy Boundary

- `src/engine/rerun.ts` and `src/llm/runner.ts` remain legacy-only and are not the mainline continuation path.
- If these legacy helpers encounter a `合` node, they must explicitly skip or return unsupported rather than pretending to rerun it.
- `/dialogue` does not call into legacy rerun helpers for mainline continuation.

---

## Files

| File | Responsibility | Action |
|---|---|---|
| `src/types/anicca.ts` | Graph and node metadata types | Modify |
| `src/store/branchGraph.ts` | Graph helpers for child-user, pair, synthesis | Modify |
| `src/store/branchGraph.test.ts` | Graph behavior coverage | Create |
| `src/chat/context.ts` | Synthesis-aware context building | Modify |
| `src/chat/context.test.ts` | Context traversal tests | Create |
| `src/features/dialectic/viewModel.ts` | Dialogue projection layer | Create |
| `src/features/dialectic/viewModel.test.ts` | Projection tests | Create |
| `src/features/dialectic/store.ts` | Focus / pending / error UI state | Create |
| `src/engine/rerun.ts` | Skip or reject unsupported `合` reruns explicitly | Modify |
| `src/llm/runner.ts` | Legacy rerun boundary for `合` nodes | Modify |
| `src/lib/persist/local.ts` | Graph + workspace snapshot persistence | Modify |
| `src/lib/persist/local.test.ts` | Persistence tests | Create |
| `src/components/dialogue/DialogueShell.tsx` | Dialogue shell coordinator | Create |
| `src/components/dialogue/BranchSidebar.tsx` | Sidebar tree + focused path | Create |
| `src/components/dialogue/DialogueComposer.tsx` | Persistent composer | Create |
| `src/components/dialogue/ConversationPanel.tsx` | Current node details | Create |
| `src/components/dialogue/BubbleStage.tsx` | Stable bubble stage | Create |
| `src/components/dialogue/DialogueShell.module.css` | Responsive layout and visual system | Create |
| `src/components/dialogue/DialogueShell.test.tsx` | UI behavior tests | Create |
| `src/app/dialogue/page.tsx` | Dialogue entry page | Create |
| `scripts/visual-smoke/dialogue.mjs` | Seeded Playwright smoke for `/dialogue` | Create |
| `package.json` | Visual smoke command | Modify |
| `.gitignore` | Ignore screenshot artifacts | Modify |

---

## Implementation Units

### Unit 1: Extend graph semantics for multi-turn and synthesis

- [ ] Add `BranchType = "正" | "反" | "合"`
- [ ] Add `label`, `summary`, and `sourceNodeIds` to node metadata
- [ ] Add `lineageParentId` for `合`
- [ ] Add `createChildUserNode`
- [ ] Add `createAssistantPair`
- [ ] Add `createSynthesisAssistant`
- [ ] Keep synthesis as assistant + dual-source metadata

### Unit 2: Make context traversal synthesis-aware

- [ ] Ensure continuation below a `合` node preserves both source summaries
- [ ] Ensure continuation below a `合` node traverses ancestors via `lineageParentId`, not by picking an arbitrary source assistant
- [ ] Stop assuming a pure single-parent tree at context-build time
- [ ] Keep context deterministic and local
- [ ] Preserve recent user text plus trimmed summaries

### Unit 3: Promote view-model to a first-class UI boundary

- [ ] Derive `breadcrumb`
- [ ] Derive `sidebarItems`
- [ ] Derive `currentNode` detail payload
- [ ] Derive `composerTarget`
- [ ] Derive explicit `availableSynthesisActions` with fixed `thesisId` / `antithesisId`
- [ ] Derive `focusSnapshotId` or equivalent stable request-origin fingerprint
- [ ] Do not collapse the sidebar into a breadcrumb-only representation

### Unit 4: Implement shell-side failure-safe mutations

- [ ] Create a `requestId` for every branch/synthesis request
- [ ] Track the currently active request per pending slot
- [ ] Apply graph writes only after request matching succeeds
- [ ] Drop late responses that no longer match the active slot
- [ ] Call routes first, then write graph on success
- [ ] Never create orphan `user` nodes on failed branch generation
- [ ] Never leave `pendingAction` uncleared on route failure
- [ ] Surface a recoverable `errorMessage` in UI
- [ ] Keep `Generate Synthesis` bound to a specific visible pair, not “first available”

### Unit 5: Implement the dialogue shell

- [ ] `BranchSidebar` shows both focused path and broader tree items
- [ ] `ConversationPanel` shows text, summary, and source nodes for focused synthesis
- [ ] `BubbleStage` renders deterministic focus/ancestor/child structure
- [ ] `DialogueComposer` shows the current target label
- [ ] `DialogueShell` coordinates focus, composer target, route calls, graph writes, and UI errors

### Unit 6: Responsive and accessibility pass

- [ ] Desktop: three-column shell
- [ ] Tablet: top horizontal sidebar chips + `stage | panel` + bottom composer
- [ ] Mobile: vertical scrollable shell with middle stage + horizontal sidebar chips + lower panel + sticky composer
- [ ] Body and shell overflow allow mobile vertical scrolling while preserving desktop fixed-stage behavior
- [ ] Stage node positions avoid sidebar, panel, and composer safe areas at desktop/tablet widths
- [ ] Mobile stage uses non-overlapping positions for root / 正 / 反 / 合
- [ ] Keyboard-reachable sidebar, stage actions, panel, and composer
- [ ] Visible focus states for current target and actionable controls
- [ ] Minimum 44px target sizing for touch interactions
- [ ] Sidebar uses accurate ARIA semantics: real tree behavior, or plain nav/list/buttons
- [ ] `prefers-reduced-motion` disables non-essential infinite blob motion

### Unit 7: Persist workspace state

- [ ] Introduce a workspace snapshot schema version for V2
- [ ] Save graph snapshot
- [ ] Save `focusedNodeId`
- [ ] Save `composerParentId`
- [ ] Do not restore `activeRequestId` or any in-flight pending slot across reload
- [ ] Reset `pendingAction` to `null` on restore
- [ ] Hydrate shell state from local snapshot on boot
- [ ] On incompatible snapshot version, invalidate cleanly instead of best-effort partial restore

### Unit 8: Freeze legacy rerun behavior

- [ ] Make `runNode` reject or skip `合` explicitly
- [ ] Make `rerunBranch` avoid silently traversing `合` as if it were rerunnable mainline work
- [ ] Document that rerun remains a legacy convenience, not a mainline contract

### Unit 9: Review remediation and visual consolidation

- [ ] Fix `/dialogue` mobile scroll and verify on a 390px viewport.
- [ ] Fix composer/panel/stage safe-area collisions and verify on desktop and tablet widths.
- [ ] Make branch and synthesis pending states mutually exclusive.
- [ ] Add synthesis button loading and `aria-busy`.
- [ ] Remove debug output and prototype labels from promoted frontend components.
- [ ] Reduce generic glass-card weight so the center stage remains visually dominant.
- [ ] Add relationship/tension hints between 正 / 反 / 合 without falling back to a traditional connector diagram.
- [ ] Document which experiment pages remain legacy, experimental, or eligible for mainline reuse.
- [ ] Add an executable Playwright smoke at `scripts/visual-smoke/dialogue.mjs`.
- [ ] Seed `anicca_workspace_v2` in that smoke so screenshots cover a non-empty focused synthesis workspace.
- [ ] Capture desktop, tablet, and 390px mobile screenshots to `artifacts/visual-smoke/dialogue/`.
- [ ] Expose the smoke through `npm run test:visual-dialogue`.

### Unit 10: Future metaball reintegration gate

Do not wire WebGPU/metaball into `/dialogue` until these conditions are met:

- [ ] Metaball renderer consumes graph/view-model node data instead of `metaballStore`-only demo data.
- [ ] Visual labels use real node labels / branch types / summaries, not numeric debug markers.
- [ ] Merge/fusion visuals respect the mainline synthesis contract: same-lineage 正 + 反 only.
- [ ] Renderer has DOM or SVG fallback for unsupported WebGPU / reduced-motion environments.
- [ ] Performance is verified on desktop and mobile viewport screenshots.
- [ ] Accessibility remains available through real buttons/list/panel semantics even if shader rendering fails.

---

## Sequencing

1. Graph/type changes.
2. Context traversal.
3. View-model + UI store.
4. Dialogue shell components.
5. Persistence hydration.
6. Responsive / a11y remediation from review.
7. Pending-state and control-state remediation from review.
8. Legacy rerun boundary.
9. Visual consolidation and stage-dominance pass.
10. Optional metaball reintegration only after the future gate passes.

Backend route contracts from `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-backend-implement-plan.md` should be available before Unit 4 is wired to real fetches.

---

## Test Matrix

| File | Scenario |
|---|---|
| `src/store/branchGraph.test.ts` | child-user continuation, synthesis dual-source metadata |
| `src/chat/context.test.ts` | continuation below synthesis preserves both sources and lineage |
| `src/features/dialectic/viewModel.test.ts` | breadcrumb, composer target, synthesis action binding, source node projection, canonical synthesis lineage |
| `src/lib/persist/local.test.ts` | graph + workspace state restore, incompatible snapshot invalidates cleanly |
| `src/components/dialogue/DialogueShell.test.tsx` | visible composer, synthesis visibility, failure leaves no orphan nodes, stale response is discarded |
| `scripts/visual-smoke/dialogue.mjs` via `npm run test:visual-dialogue` | seed `anicca_workspace_v2`, run desktop/tablet/390px mobile screenshots, assert no horizontal overflow, and write artifacts under `artifacts/visual-smoke/dialogue/` |

---

## Exit Criteria

- A non-root `user` focus continues from its parent assistant instead of creating a new root
- A `合` continuation retains both source summaries in context and panel state
- A `合` focus uses the same lineage rule in breadcrumb, sidebar, composer target, and context traversal
- Sidebar is not reduced to breadcrumb-only navigation
- Conversation panel can show text, summary, and synthesis sources
- Route failures leave no half-written graph state
- Late responses cannot write into the wrong graph state after retry/focus changes
- `/dialogue` restores graph plus focused workspace state after reload
- layout remains usable on desktop, tablet, and mobile widths
- mobile content is vertically reachable and not trapped by `overflow: hidden`
- stage nodes are not hidden by side panels or bottom composer
- synthesis generation has visible pending / disabled / busy feedback
- sidebar ARIA semantics match its actual keyboard behavior
- promoted mainline components contain no render-time debug output or mock/prototype copy
