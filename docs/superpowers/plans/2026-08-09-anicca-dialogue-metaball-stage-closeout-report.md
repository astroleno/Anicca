# Anicca Dialogue Metaball Stage Closeout Report

- Date: 2026-08-09
- Branch: `codex/anicca-dialogue-metaball-stage`
- Base: `14acf48990590ea16ca96c63bb594e03c181eef7`
- Initial closeout source: `020ed9c1491db90c2c17c2846022d03d0379eea7`
- Corrective validation source (review round 1): `7ddb42810e3af59efb4c462b37df805b25565b03`
- Current corrective validated source: `f4e5523411d09ed2024d48b16ce1f0b6b890810f`
- Merged-main validated source: `89ac29089c6de61e0a4775383b7d54d05f80eb49`
- Visual CI corrective source: `31f218996df57336d99e69b8d06f38a28022d4c0`
- Visual teardown corrective source: `514d66e99b7e082b8e71f2743580e2c70cec5ec6`
- Bounded evidence capture source: `c421b4dd89bdb2d0307c7d41bdfaed2e5bee1500`

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
| `2123e05` | Deterministic OpenAI-compatible mock and explicit live/mock evaluation reporting |
| `dffe545` | Preserve drawer and focus intent when Roundtable deepen completes asynchronously |
| `7ddb428` | Include failed attempts and retry backoff in end-to-end evaluation latency |
| `f4e5523` | Refresh visible Roundtable data without coupling content updates to drawer focus |
| `89ac290` | Exclude ignored generated artifacts from Vitest discovery after local merge |
| `f604b01` | Correct the closeout report's post-merge repository state before remote validation |
| `31f2189` | Preserve SHA-bound visual failure evidence and make drawer-open focus commit-safe |
| `514d66e` | Own and terminate the Next server process, with an in-process timeout before the CI ceiling |
| `c421b4d` | Capture the finite Roundtable handoff surface after CI exposed a Chromium full-page failure |

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
| Roundtable route + DialogueShell | 2 files / 53 tests passed |
| `npm run check` | exit 0; 35 files / 275 tests passed; production and test TypeScript 0 errors |
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

The newly generated closeout evidence remains ignored by Git; screenshots, local absolute paths, reference archives and `.superpowers/` are not part of the source commits. The tracked `artifacts/visual-smoke/dialogue/summary.json` is a legacy 2026-07-27 snapshot and is not claimed as current evidence. After the branch is pushed, the current-HEAD GitHub Actions `visual-dialogue` artifact is the merge gate.

The Roundtable regression matrix additionally covers a deepen response completing after the user closes the drawer, brings the question back to the main line, selects another node or focuses the composer on the source node. Closed/promoted drawers stay closed. A drawer that remains visible is refreshed to the persisted state without stealing focus, and a consecutive deepen request is verified to use that refreshed state.

Residual visual boundaries are explicit: the automated fusion gate verifies projected geometry and `data-fused-pairs`, while liquid-bridge pixel continuity remains human-reviewed rather than pixel-diff asserted. GPU frame time, dropped frames and power use have not been measured on physical mobile hardware.

## CI

`.github/workflows/quality.yml` defines two independent jobs for pull requests, `main` pushes and manual runs:

- `quality`: `npm ci`, lint, both TypeScript gates, all Vitest tests and production build.
- `visual-dialogue`: clean install, Chromium runtime, production build, production visual smoke and 14-day artifact upload.

Remote run [31314592849](https://github.com/astroleno/Anicca/actions/runs/31314592849) validated `main@f604b01`. The `quality` job passed, while `visual-dialogue` failed in both attempt 1 and attempt 2 with an unlabelled 30-second `page.waitForFunction` timeout. Both failed attempts uploaded the same 8,625,223-byte legacy directory whose tracked `summary.json` was generated on 2026-07-27, so neither artifact is accepted as evidence for `f604b01`; the visual release gate remains failed at that source.

Corrective work now makes success and failure artifacts mutually exclusive. A failed visual run publishes `artifacts/visual-smoke/dialogue-failure` with the head SHA, run ID and attempt, current and last successful step, full error stack, step history, incremental screenshots, failure screenshot, DOM snapshot, renderer/page state and server output. It never falls back to the tracked `artifacts/visual-smoke/dialogue` directory. Each viewport, interaction scenario and Playwright condition wait emits a structured marker. A current-HEAD successful remote run and its SHA-bound `dialogue-visual-smoke` artifact are still required before final closeout.

Remote run [31579162076](https://github.com/astroleno/Anicca/actions/runs/31579162076) then validated the diagnostic correction at `main@667ae46`. `quality` passed. The visual log proves that all 7 viewports and all 15 interaction scenarios completed successfully by `2026-08-12T08:53:56Z`, including summary publication; however, the `npm run start` parent process retained the Next child, so the step did not exit and GitHub canceled the job at its 35-minute limit. GitHub skips later upload steps after a job-level timeout, so this run also produced no accepted artifact. The follow-up correction starts the Next CLI as the directly owned child, waits for graceful exit with a `SIGKILL` fallback, and gives the smoke process a 30-minute total timeout so failure evidence can be finalized and uploaded before the 35-minute job ceiling.

Remote run [31591487209](https://github.com/astroleno/Anicca/actions/runs/31591487209) validated solution 1 at `main@d2eb9dd`: `quality` passed, the success upload was correctly skipped, and artifact `dialogue-visual-failure-31591487209-1` contains the matching head SHA, full stack and incremental evidence. It localized the failure to `interaction:roundtable-theater-exit`, where GitHub Chromium rejected a full-page `Page.captureScreenshot`; the page DOM, viewport metrics and preceding Roundtable checks were healthy. The corrective capture now targets the finite handoff element instead of the full page.

Vitest is capped at two workers with 10-second test/hook timeouts. This removes the previously observed full-suite-only 5-second contention timeout while retaining file-level parallel execution.

Vitest also excludes `artifacts/**` explicitly. Generated or ignored review packages can remain on disk without being mistaken for repository test sources; `tests/vitestConfig.test.ts` keeps this discovery boundary under version control.

## Release and repository recovery

- Annotated tag `0.1.0` is published at `14acf48990590ea16ca96c63bb594e03c181eef7`.
- Remote `codex/anicca-mainline-release-closeout` was verified as an ancestor of `origin/main` and deleted.
- The primary repository's damaged `.git` directory is preserved at `/Users/aitoshuu/Documents/GitHub/Anicca-git-object-backup-20260809` (40 MB).
- A verified healthy recovery clone remains at `/Users/aitoshuu/Documents/GitHub/Anicca-git-repair-20260809` (43 MB).
- The primary worktree is attached to `main`; `main` and `origin/main` both pointed to `f604b012a1ccbe9950944ab878aae011a36930df` when the remote CI correction began, and the user's untracked `.superpowers/` and implementation plan remain preserved.
- The feature branch `codex/anicca-dialogue-metaball-stage` and its worktree were deleted after the local fast-forward merge; `84f37cc` is verified as an ancestor of `main`.
- `main@f604b01` was pushed. Remote run `31314592849` passed `quality` but failed `visual-dialogue` twice, and its artifacts were invalidated by the legacy-output contamination described above. Mock evaluation and ignored local visual evidence are not retained by Git pushes; the corrective current-HEAD remote run must supply the canonical visual artifact.

## Provider evaluation gates

The 50-case harness at `scripts/evals/dialectic-50-live.mjs` records contract pass rate, UI quality warnings, retries, slow requests, average/P50/P95/max latency and preserves partial records during a run. `ANICCA_EVAL_MODE=mock` keeps deterministic integration evidence explicitly separate from real-provider evidence.

### Mock integration gate: complete

The full `/api/branches` -> `/api/synthesis` HTTP path was exercised against `scripts/evals/mock-openai-server.mjs`:

- 50/50 cases passed; 0 contract failures and 0 UI quality warnings.
- 103 provider requests were observed: 100 successful completions plus 3 injected `429` responses that exhaust the SDK retry budget once.
- Evaluation case 6 recovered on its second application-level attempt, proving the HTTP retry and reporting path.
- Every response records per-attempt `elapsedMs` for diagnosis and `totalElapsedMs` across failed attempts, retry backoff and the final attempt for reporting.
- Branch end-to-end latency: average 188 ms, P50 6 ms, P95 38 ms, max 8,763 ms.
- Synthesis end-to-end latency: average 8 ms, P50 5 ms, P95 25 ms, max 32 ms.
- No request exceeded 60 seconds.
- Evidence: `artifacts/dialectic-50-mock/2026-08-09/{summary.md,summary.json,records.json,records.jsonl}`. These generated records remain ignored by Git.
- The records contain no API key or authorization header.

This result verifies the local OpenAI-compatible transport, both Next API routes, strict structured-output parsing, retry recovery, 50-case validation and report generation. It does **not** represent real-provider content quality, failure rate or latency.

### Real-provider quality gate: pending external credential

Neither the process environment, the worktree, the primary repository nor GitHub Actions secrets contains `OPENAI_API_KEY`. No real provider request has been sent, and no live-provider result is claimed in this report. After a credential is configured, the required command is:

```bash
ANICCA_EVAL_BASE_URL=http://127.0.0.1:3060 \
ANICCA_EVAL_OUTPUT_DIR=artifacts/dialectic-50-live/2026-08-09 \
node scripts/evals/dialectic-50-live.mjs
```

The mock gate removes uncertainty from the application integration and reporting chain. Real-provider output quality and external reliability remain the only provider-evaluation risk and require a credentialed 50-case run before that original live gate can be claimed complete.
