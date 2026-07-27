# Anicca Mainline Release Closeout Report

Date: 2026-07-26

Validated source commit: `eeb94b1e75d007ce6e158ac7310d5c66fc1c9816`

Release branch: `codex/anicca-mainline-release-closeout`

Remote validated-source commit: `eeb94b1e75d007ce6e158ac7310d5c66fc1c9816` (verified with `git ls-remote` after push)

Push status: validated source is pushed to the release branch. This report is a separate evidence-only commit on that same branch.

Pull request status: not created.

## Scope and decisions

- Release baseline is Next.js `15.5.4`.
- Mainline includes the hardened dialectic API contract and the local artwork-growth graph/UI slice.
- Retrieval context remains disabled by default.
- Roundtable stays a deferred, independent slice; no new Roundtable UI or API hunk was applied to this closeout branch.
- Renderer and legacy visual experiments remain outside this release slice.
- The live 50-case provider evaluation was not run: it sends prompts to a paid external provider and needs separate cost/data authorization.
- Corrective closeout follows the established mainline contract: prose or code-fenced model output is rejected as `502 invalid_model_output` rather than tolerated.

## Environment

| Tool | Version |
|---|---|
| Node.js | `v25.6.1` |
| npm | `11.9.0` |
| Next.js | `15.5.4` |
| Playwright Chromium | `1217` |

## Validation record

| Command | Result |
|---|---|
| `git diff --check` | exit 0 |
| `npm run typecheck` | exit 0, production TypeScript has 0 errors |
| `npm run typecheck:test` | exit 0, includes all 28 `src` test files and has 0 errors |
| `npm exec vitest run src/features/dialectic/outputContract.test.ts src/lib/openai/providerErrors.test.ts src/app/api/__tests__/dialectic-routes.test.ts src/components/dialogue/BubbleStage.test.tsx src/features/dialectic/viewModel.test.ts` | exit 0, 5 files / 76 tests |
| `npm run check` | exit 0, 28 files / 244 tests; lint has 0 errors |
| `npm run build` | exit 0, production build completed |
| Production visual smoke (Next `start`, isolated loopback port) | exit 0, all desktop/tablet/touch/mobile scenarios completed |

## Lint warning disposition

`npm run lint` reports 34 warnings and 0 errors. The closeout-owned API and dialogue files report 0 warnings. Remaining pre-existing warnings are categorized as follows:

- Deferred Roundtable and legacy API/shell: `src/app/api/roundtable/route.ts`, `src/app/api/prompts/route.ts`, `src/app/layout.tsx`.
- Legacy chat/runtime contracts: `src/chat/core.ts`, `src/chat/stream/sse.ts`, `src/events/bus.ts`, `src/llm/runner.ts`, `src/types/chat.ts`.
- Isolated renderer and visual experiments: `src/components/ChatOverlayMock.tsx`, `src/components/GSAPChatInput.tsx`, `src/components/InteractiveNebulaShader.tsx`, `src/components/MetaballCanvas.tsx`, `src/components/RaymarchingCanvas.tsx`.
- Test-only OpenAI mock typing: `src/lib/openai/generateText.test.ts`.

## Visual evidence

The production smoke summary and current screenshots are under `artifacts/visual-smoke/dialogue/`:

- `summary.json` records desktop, tablet, touch, 390/360/320 mobile, pending, choice dock, retrieval debug, and Growth perspective scenarios.
- Growth perspective screenshots cover `desktop-growth-perspectives.png`, `mobile-390-growth-perspectives.png`, and `mobile-320-growth-perspectives.png`; the two mobile images are stage-only captures. Separate `mobile-390-growth-composer.png` and `mobile-320-growth-composer.png` captures preserve the composer evidence.
- `growth-perspective-flow.stageNodeChecks` records five Growth stage nodes in desktop, 390px mobile, and 320px mobile viewports; their bounding boxes are pairwise non-overlapping. Each node also receives programmatic focus and a click before the scenario capture.
- `growth-layout-matrix.stageNodeChecks` validates actual, unclipped, pairwise non-overlapping stage boxes for `candidateLimit` 1–4 across desktop, 1024px tablet, and 390px/360px/320px mobile viewports. Clipping is measured against the actual `dialogue-stage-viewport` overflow boundary.
- `growth-wide-layout-compatibility.stageNodeChecks` validates the six-node `candidateLimit=4` stage at 320px after importing a legacy wide-layout workspace and after a real desktop node drag followed by a 320px viewport change. Both cases must match a fresh compact baseline node-for-node within `0.01px`; the current evidence records `0px` deltas.
- The summary uses repository-relative artifact paths and contains no local absolute paths or provider credentials.

Manual review of the refreshed Growth desktop evidence found all three artwork responses plus the merge node separately rendered and visible. The automated smoke also found no horizontal overflow or inaccessible Growth control.

## Corrective findings resolved

- Growth children without `branchType` now use dedicated wide and compact layouts. Five-child sessions (four artwork responses plus merge) use a multi-row grid; narrow stages reserve dynamic height for additional rows, and 1024px dense stages reduce card dimensions to preserve gaps. Legacy top-level persisted coordinates remain wide-only; compact Growth drags and pans persist independently, so imports and desktop edits cannot override responsive compact seeds.
- Node-drag preview transforms are transient: their CSS offsets reset on pointer completion or cancellation, gesture-effect cleanup, and layout-key changes, so no desktop drag delta can survive into a compact Growth layout.
- Test TypeScript explicitly overrides production test exclusions, includes ambient shader declarations, uses the ES2022 test library, and loads the WebGPU types already supplied by `@types/three`.
- Branch and synthesis parsers reject blank normalized text/summary; blank, emoji-only, and punctuation-only labels fall back to their Chinese contract label.
- Provider status `408` and every numeric `500`–`599` status, including recursive `cause` / `response` wrappers, map to the retryable `provider_unreachable` response (`503`) unless a more specific classification applies.
- The transient Growth completion status remains in the accessible workspace context rather than floating over mobile stage nodes.
- `branches` and `synthesis` now parse only a strict top-level JSON object. The permissive shared parser remains available for legacy endpoints that explicitly use it.

## Repository safety

- This branch was created from a fresh verified recovery clone. `git fsck --full --no-reflogs` exits 0; its two dangling pre-amend local commits are `a192a7a` and `c74f597`.
- The prior dirty original worktree remains backed up and quarantined from release work.
- The immutable validated source SHA above is pushed; no pull request has been created.
