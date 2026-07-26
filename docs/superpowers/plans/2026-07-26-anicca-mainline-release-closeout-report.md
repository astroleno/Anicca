# Anicca Mainline Release Closeout Report

Date: 2026-07-26

Validated source revision: `6ff80d89e495cc5c1dac54a367f71ae8fe281c1d`

Release branch: `codex/anicca-mainline-release-closeout`

## Scope and decisions

- Release baseline is Next.js `15.5.4`.
- Mainline includes the hardened dialectic API contract and the local artwork-growth graph/UI slice.
- Retrieval context remains disabled by default.
- Roundtable stays a deferred, independent slice; no new Roundtable UI or API hunk was applied to this closeout branch.
- Renderer and legacy visual experiments remain outside this release slice.
- The live 50-case provider evaluation was not run: it sends prompts to a paid external provider and needs separate cost/data authorization.

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
| `npm run typecheck:test` | exit 0, test TypeScript has 0 errors |
| `npx vitest run src/features/dialectic/outputContract.test.ts src/lib/openai/providerErrors.test.ts src/app/api/__tests__/dialectic-routes.test.ts` | exit 0, 32 tests |
| Mainline targeted Vitest regression | exit 0, 13 files / 127 tests |
| Growth/Retrieval targeted Vitest regression | exit 0, 9 files / 60 tests |
| `npm run check` | exit 0, 28 files / 224 tests; lint has 0 errors |
| `npm run build` | exit 0, production build completed |
| `DIALOGUE_SMOKE_SERVER_MODE=start npm run test:visual-dialogue` | exit 0, production visual smoke completed |

## Lint warning disposition

`npm run lint` reports 34 warnings and 0 errors. The closeout-owned API and dialogue files report 0 warnings. Remaining pre-existing warnings are categorized as follows:

- Deferred Roundtable and legacy API/shell: `src/app/api/roundtable/route.ts`, `src/app/api/prompts/route.ts`, `src/app/layout.tsx`.
- Legacy chat/runtime contracts: `src/chat/core.ts`, `src/chat/stream/sse.ts`, `src/events/bus.ts`, `src/llm/runner.ts`, `src/types/chat.ts`.
- Isolated renderer and visual experiments: `src/components/ChatOverlayMock.tsx`, `src/components/GSAPChatInput.tsx`, `src/components/InteractiveNebulaShader.tsx`, `src/components/MetaballCanvas.tsx`, `src/components/RaymarchingCanvas.tsx`.
- Test-only OpenAI mock typing: `src/lib/openai/generateText.test.ts`.

## Visual evidence

The production smoke summary and current screenshots are under `artifacts/visual-smoke/dialogue/`:

- `summary.json` records desktop, tablet, touch, 390/360/320 mobile, pending, choice dock, retrieval debug, and Growth perspective scenarios.
- Growth perspective screenshots cover `desktop-growth-perspectives.png`, `mobile-390-growth-perspectives.png`, and `mobile-320-growth-perspectives.png`.
- The summary uses repository-relative artifact paths and contains no local absolute paths or provider credentials.

Manual review found no visible horizontal overflow, covered controls, lost focus path, or inaccessible Growth control in the generated desktop, tablet, touch, and mobile evidence.

## Repository safety

- This branch was created from a fresh verified recovery clone. `git fsck --full --no-reflogs` exits 0; its only output is the expected dangling pre-amend local commit `a192a7a`.
- The prior dirty original worktree remains backed up and quarantined from release work.
- No closeout-branch push or pull request has been created.
