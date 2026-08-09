# Anicca Dialogue Metaball Stage Closeout Report

- Date: 2026-08-09
- Branch: `codex/anicca-dialogue-metaball-stage`
- Base: `14acf48990590ea16ca96c63bb594e03c181eef7`
Implementation head before this report: `020ed9c1491db90c2c17c2846022d03d0379eea7`

## Outcome

`/dialogue` now renders the stage as a Three.js raymarched pearl Metaball surface. Nearby nodes form a continuous liquid bridge and separate again when moved apart. The renderer consumes projected DOM geometry only: graph, workspace, focus, click, drag, keyboard and accessible names remain owned by the existing domain and DOM layers.

The previously deferred Roundtable slice is also included as an opt-in sidecar. It persists per-node artifacts, supports deepen, rejects stale completions after workspace changes, recovers from provider errors, returns focus on close, and keeps Roundtable output outside canonical `正 / 反 / 合` unless the user explicitly brings a question back to the main line.

Repository closeout work additionally adds GitHub Actions CI, publishes the historical `0.1.0` release tag, removes the merged remote closeout branch, and replaces the damaged local Git object database with a verified healthy clone.

## Implementation record

| Commit | Purpose |
| --- | --- |
| `28f7481` | Metaball projection, semantic colors, stable priority and fixed uniform packing |
| `98308bd` | 8-sphere SDF/smooth-min shader and Three renderer lifecycle |
| `b3dec09` | React/DOM adapter, DPR budget, reduced-motion and fallback lifecycle |
| `d7407e7` | BubbleStage integration and removal of stage/pending/convergence SVG lines |
| `2357738` | Pearl material layering, focus ring and CSS fallback |
| `4463342` | Fusion/separation, graph-invariance, DPR, responsive and WebGL visual gates |
| `6f59cf1` | Roundtable API hardening, sidecar theater, deepen/stale/error behavior and visual gates |
| `e02a093` | GitHub Actions quality/build/production visual jobs and deterministic Vitest concurrency |
| `020ed9c` | Live-provider evaluation P50/P95/max latency reporting |

## Architecture and data boundary

- Truth chain remains `branchGraph -> deriveDialogueView -> BubbleStage`.
- Renderer maximum is 8 surfaces, 52 raymarch steps and 3 FBM octaves.
- Desktop DPR cap is 1.25; stage widths at or below 640px use 0.9.
- Canvas is `aria-hidden` and `pointer-events: none`; every interactive node remains a real DOM button.
- Metaball contact never creates graph nodes, edges or synthesis.
- Reduced motion fixes shader time at zero while continuing geometry refresh.
- Renderer construction failure and `webglcontextlost` select the CSS fallback without retry loops.
- No diff exists against the base in `src/store/branchGraph.ts`, `src/features/dialectic/viewModel.ts`, `src/features/dialectic/store.ts` or `src/types/anicca.ts`.
- The original renderer plan's API boundary was amended by the user's explicit instruction to finish the deferred Roundtable slice. API changes are limited to `src/app/api/roundtable/route.ts` and its test.

## Validation record

Environment:

- Node `v25.6.1`
- npm `11.9.0`
- Next.js `15.5.4`
- Three.js `0.181.0`

| Gate | Evidence |
| --- | --- |
| `git diff --check` | exit 0 |
| Roundtable route + DialogueShell | 2 files / 49 tests passed |
| `npm run check` | exit 0; 31 files / 264 tests passed; production and test TypeScript 0 errors |
| Lint | 0 errors; 33 pre-existing warnings; renderer, Roundtable and CI-owned files 0 warnings |
| `npm run build` | exit 0; 15 application routes generated, including `/dialogue` and `/roundtable` |
| `DIALOGUE_SMOKE_SERVER_MODE=start npm run test:visual-dialogue` | exit 0; 7 viewports and 15 interaction scenarios, no failed scenario |
| `git fsck --full --no-reflogs` in repaired primary repository | exit 0 with no missing or corrupt object |

The production browser matrix covers 1440×980, 1024×900, 1024×768 touch, 390×844, 360×740, 320×740 and 390×844 touch. Growth candidate limits 1–4 are checked across desktop, tablet and mobile layouts.

The 15 production interaction scenarios cover:

1. Metaball fusion and separation for `asst_thesis_1::user_root_1`.
2. Persisted graph counts before and after drag (`6 nodes / 6 edges`).
3. Reduced-motion screenshot stability across 500 ms.
4. WebGL-disabled CSS fallback, focus and click behavior.
5. Synthesis pending focus and stale completion behavior.
6. Roundtable drawer focus return.
7. Roundtable deepen success and reduced-motion stability.
8. Roundtable deepen provider failure and retry recovery.
9. Roundtable theater exit plus 320px mobile fallback.
10. Empty-root pending state.
11. Next-step choice layout.
12. Retrieval debug preview.
13. Growth perspective flow.
14. Growth candidate-limit layout matrix.
15. Imported/dragged wide-layout compatibility at 320px.

Human-reviewed screenshots:

- `artifacts/visual-smoke/dialogue/desktop-metaball-fused.png`
- `artifacts/visual-smoke/dialogue/desktop-metaball-reduced-motion.png`
- `artifacts/visual-smoke/dialogue/desktop-metaball-fallback.png`
- `artifacts/visual-smoke/dialogue/desktop-roundtable-theater-deepened.png`
- `artifacts/visual-smoke/dialogue/desktop-roundtable-theater-error.png`
- `artifacts/visual-smoke/dialogue/desktop-reduced-motion-roundtable-handoff.png`
- `artifacts/visual-smoke/dialogue/mobile-320-roundtable-handoff.png`

The generated evidence remains ignored by Git; screenshots, local absolute paths, reference archives and `.superpowers/` are not part of the source commits.

## CI

`.github/workflows/quality.yml` defines two independent jobs for pull requests, `main` pushes and manual runs:

- `quality`: `npm ci`, lint, both TypeScript gates, all Vitest tests and production build.
- `visual-dialogue`: clean install, Chromium runtime, production build, production visual smoke and 14-day artifact upload.

Vitest is capped at two workers with 10-second test/hook timeouts. This removes the previously observed full-suite-only 5-second contention timeout while retaining file-level parallel execution.

## Release and repository recovery

- Annotated tag `0.1.0` is published at `14acf48990590ea16ca96c63bb594e03c181eef7`.
- Remote `codex/anicca-mainline-release-closeout` was verified as an ancestor of `origin/main` and deleted.
- The primary repository's damaged `.git` directory is preserved at `/Users/aitoshuu/Documents/GitHub/Anicca-git-object-backup-20260809` (40 MB).
- A verified healthy recovery clone remains at `/Users/aitoshuu/Documents/GitHub/Anicca-git-repair-20260809` (43 MB).
- The primary worktree remains detached at the release baseline and retains the user's untracked `.superpowers/` and implementation plan.
- This feature worktree remains attached to `codex/anicca-dialogue-metaball-stage` with a clean index.

## Live-provider gate

The 50-case harness is ready at `scripts/evals/dialectic-50-live.mjs`. It records contract pass rate, UI quality warnings, retries, slow requests, average/P50/P95/max latency and preserves partial records during a run.

Current status: **pending external credential**. Neither the process environment, the worktree, the primary repository nor GitHub Actions secrets contains `OPENAI_API_KEY`. No real provider request has been sent, and no live-provider result is claimed in this report. After a credential is configured, the required command is:

```bash
ANICCA_EVAL_BASE_URL=http://127.0.0.1:3060 \
ANICCA_EVAL_OUTPUT_DIR=artifacts/dialectic-50-live/2026-08-09 \
node scripts/evals/dialectic-50-live.mjs
```

This section must be replaced with the actual 50-case pass rate, warnings, retry count and P95/long-tail findings before the overall goal is marked complete.
