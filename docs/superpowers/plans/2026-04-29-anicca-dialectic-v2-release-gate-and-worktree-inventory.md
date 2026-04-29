# Anicca Dialectic V2 Release Gate and Worktree Inventory

Date: 2026-04-29
Branch: `codex/dialectic-v2-mainline`

## Fresh Verification

These commands were rerun against the clean Phase 1 staged patch in a temporary worktree after the lint migration, storage polyfill, and roundtable test split:

| Command | Result | Notes |
|---|---:|---|
| `npm run lint` | Pass | ESLint CLI exits 0. Clean Phase 1 baseline is 0 errors / 26 warnings. |
| `npm test` | Pass | 11 files / 42 tests passed. Roundtable route tests are split out for the separate roundtable PR. |
| `npm run build` | Pass | Next.js 15.5.4 production build completed. Build reports the same lint warnings. |
| `npm run test:visual-dialogue` | Pass | Desktop, tablet, and mobile `/dialogue` visual smoke completed. |

Follow-up verification in Node v25.6.1 initially exposed a Vitest/jsdom mismatch where Node's experimental global `localStorage` shadowed jsdom storage. `tests/setup.ts` now installs an in-memory `Storage` polyfill on both `globalThis` and `window`, after which the clean Phase 1 patch passes `npm test` with 11 files / 42 tests.

Previously reported but not rerun in this pass:

- live `/api/branches` and `/api/synthesis`
- live `/api/roundtable` start
- browser E2E for `/dialogue` input -> `正 / 反` -> `合` -> refresh restore
- production page smoke for `/`, `/dialogue`, `/roundtable`, `/newframe`, `/raymarching`, `/liquid`, `/mochi`

## Lint Migration Notes

- `package.json` now runs `eslint .` instead of `next lint`.
- `eslint.config.mjs` uses Next's `core-web-vitals` and `typescript` config through `FlatCompat`.
- Non-release/generated paths are ignored: `.next/**`, `.worktrees/**`, `archived/**`, `coverage/**`, `node_modules/**`, `out/**`, `ref/**`, and `next-env.d.ts`.
- `@typescript-eslint/no-explicit-any` is warning-only for this baseline. This keeps CI non-interactive and error-blocking without forcing a broad legacy typing cleanup into the release gate.

## Worktree Split

### Phase 1 Release Candidate

These are candidates for the clean `/dialogue` release branch, subject to final diff review:

- Lint gate:
  - `package.json`
  - `package-lock.json`
  - `eslint.config.mjs`
  - `tests/setup.ts`
  - `vitest.config.ts`
- Provider compatibility and dialectic API:
  - `src/lib/openai/client.ts`
  - `src/lib/openai/generateText.ts`
  - `src/lib/openai/readChatCompletionText.ts`
  - `src/lib/openai/generateText.test.ts`
  - `src/app/api/branches/route.ts`
  - `src/app/api/synthesis/route.ts`
- Documentation:
  - `README.md`
  - `docs/superpowers/plans/2026-04-25-anicca-dialectic-v2-workspace-phase-implement-plan.md`
  - this verification / inventory record
- Minor lint cleanup:
  - `src/llm/runner.ts`

`src/app/api/__tests__/dialectic-routes.test.ts` has been split back to Phase 1 dialectic coverage only. The roundtable route coverage now lives in `src/app/api/roundtable/roundtable-route.test.ts` and should stay with the separate roundtable PR.

### Needs Separate Roundtable Review

These files are coherent as a roundtable feature slice, but should not be folded into the Phase 1 `/dialogue` release unless the UI flow is accepted:

- `src/app/api/roundtable/route.ts`
- `src/app/roundtable/page.tsx`
- `src/app/roundtable/RoundtableWorkbench.module.css`
- `src/features/roundtable/prompt.ts`
- `src/features/roundtable/types.ts`
- `src/app/api/roundtable/roundtable-route.test.ts`
- the `/roundtable` hero link in `src/components/dialogue/DialogueShell.tsx`
- the matching `heroLink` CSS in `src/components/dialogue/DialogueShell.module.css`

Current validation status: API live smoke and unit coverage exist; full UI interaction acceptance is still open.

### Hold as Visual / Shader Experiments

These should stay out of a Phase 1 release branch unless deliberately shipping the visual experiment surface:

- `src/components/MetaballCanvas.tsx`
- `src/store/metaballStore.ts`
- `src/shaders/metaball_compute.wgsl`
- `src/components/GSAPChatInput.tsx`
- `src/components/InteractiveNebulaShader.tsx`
- `src/components/RaymarchingCanvas.tsx`
- `src/components/archived/**`
- `src/app/liquid/**`
- `src/app/mochi/**`
- `src/app/raymarching/**`
- `newframe.md`
- `docs/Raymarching_Flow_Design.md`
- `docs/Raymarching_Migration_Plan.md`
- `docs/Raymarching_Mochi_Texture.md`
- `docs/flow-chat借鉴分析.md`
- `docs/完成目标实施计划.md`

The lint migration includes small fixes in `src/app/mochi/page.tsx`, `src/app/raymarching/page.tsx`, and `src/components/RaymarchingCanvas.tsx` so the current dirty tree can pass lint. If the experiment files are not staged, those fixes do not need to ship with Phase 1.

### Reference / Cleanup Only

These should not enter the release commit:

- `.DS_Store`
- `ref/.DS_Store`
- `ref/anicca/**`
- `ref/bubbles-background-animation/**`
- `ref/gsap-x-webflow-magnetic-fab-menu-wip/**`
- `ref/liquid-shader.tsx`
- `ref/ljg-roundtable/**`
- `ref/neon-raymarcher.tsx`
- `ref/threejs-gsap-threejs-raymarching-layout-explorations-with-gsap-n-3/**`

`.DS_Store` is already ignored in `.gitignore`, but existing tracked `.DS_Store` files are still modified. Clean release staging should remove them from the index or restore them deliberately before committing.

## Still Open

- Decide whether `/roundtable` is a separate PR or part of a broader demo release.
- Decide whether experimental visual routes remain available in production for this release or are held behind a separate branch.
- Complete manual mobile-device, keyboard tab-order, and long-session restore acceptance notes.
- Pay down the lint warnings after Phase 1; the clean Phase 1 baseline has 26 warnings, while the current dirty tree with experiments has 38 warnings.
