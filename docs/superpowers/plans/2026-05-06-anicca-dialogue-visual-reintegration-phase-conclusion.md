# Anicca Dialogue Visual Reintegration Phase Conclusion

Date: 2026-05-06
Branch: `codex/dialogue-visual-reintegration`
Base: `main` / `origin/main` at `95a0648 Close workspace phase 2 and add roundtable sidecar artifacts (#1)`

## Stage Verdict

### Mainline: done

The mainline workspace and roundtable sidecar integration is considered closed for this phase.

Closed scope:

- Workspace Phase 2 registry, migration, create, rename, switch, export, import, malformed import, and mobile QA.
- Roundtable as a `/dialogue` sidecar artifact, not a second main product path.
- Roundtable artifact persistence through workspace autosave and workspace bundle import/export.
- Phase 2 documentation closure in `README.md` and the workspace phase plan.

Mainline should not receive more visual reintegration changes in this pass. Treat it as the stable base.

### Visual reintegration: in progress

`codex/dialogue-visual-reintegration` is now a separate phase line.

This branch owns the unfinished `/dialogue` interaction and visual reintegration work:

- `/dialogue` correctness fixes around hydration, mobile scroll, touch behavior, focus, console cleanliness, and stale async UI.
- Mobile-first hierarchy work so graph reading and continuation are not buried under management chrome.
- `合` as a convergence event / record rather than a permanent third bubble or ordinary branch category.
- Stage relation visibility, lineage readability, and desktop chrome reduction.
- Visual smoke coverage for desktop, tablet, tablet touch, mobile, and mobile touch.

This branch must not be merged as a workspace/roundtable closure patch. It is its own visual/product phase.

## Priority Order

### 1. Correctness first

Resolve correctness issues before adding visual polish or reconnecting any experimental renderer.

Priority items:

- Hydration safety: no client/server mismatch, no boot-time UI flicker that changes available actions, no stale restored runtime pending state.
- Mobile scroll: `/dialogue` must remain vertically scrollable on mobile and coarse-pointer tablet paths; stage interactions must not create touch dead zones.
- Console-clean: no render-time debug logs, hydration warnings, page errors, or visual smoke console noise in production routes.
- Focus and pending correctness: async branch, synthesis, and roundtable completions must not steal context after the user moves away.
- Accessibility correctness: visible focus, stable accessible names, keyboard-safe popovers, and no ARIA roles without matching keyboard behavior.

Gate before moving on:

- `npm test`
- `npm run build`
- `npm run test:visual-dialogue`
- focused browser smoke for mobile scroll / touch selection / console-clean

### 2. Visual hierarchy second

Only after correctness is stable, improve the visible product hierarchy.

Priority items:

- Desktop chrome: reduce hero, workspace management, sidebars, and panels so the graph field is the first visual protagonist.
- Mobile first screen: compact the management layer; stage, lineage, current node, and composer should carry the task flow.
- Relations row / relation layer: make parent-child, 正/反 source, and convergence lines readable enough to show lineage rather than decorative texture.
- `合` record language: keep convergence as a record/event marker in sidebar, panel, composer, and stage; avoid returning to a normal branch pill or large permanent bubble.
- Workspace controls: keep management actions available but visually subordinate to graph reading and continuation.

Gate before moving on:

- Fresh screenshots for desktop, tablet touch, and mobile touch.
- Screenshot review confirms graph field is primary, management chrome is secondary, and relation structure is legible.
- No regression in the correctness gate above.

### 3. Renderer reintegration last

Do not reconnect an experimental renderer to `/dialogue` until correctness and hierarchy are accepted.

Decision still open:

- Whether the experiment renderer should become part of `/dialogue`.
- Whether it should stay as a lab route or visual prototype.
- Whether a smaller rendering layer should be extracted instead: relation lines, convergence event marks, or blob material only.

Renderer reintegration requirements if pursued:

- Preserve `branchGraph -> viewModel -> UI` as the product truth source.
- No renderer-owned graph semantics.
- No inaccessible canvas-only primary interactions.
- Reduced-motion and low-performance fallback.
- Touch, keyboard, and screen-reader paths must remain usable without the experimental renderer.
- No console noise or hydration warnings.

## Non-Goals For This Phase

- Do not reopen Workspace Phase 2 unless a regression is found against mainline.
- Do not merge visual reintegration into mainline as a documentation-only closure patch.
- Do not promote `/roundtable` into a second mainline product path.
- Do not decide renderer reintegration before correctness and visual hierarchy gates are clean.

## Current Working Position

Current state should be read as:

- `mainline = done`
- `visual reintegration = in progress`
- `renderer reconnection = undecided`

The next execution pass should start with correctness findings only. Visual hierarchy and renderer decisions come later, in that order.

## Closeout Review: 2026-05-08

Current recommendation: merge the current `/dialogue` interaction and visual reintegration refinements to `main`, but do not reconnect the experimental renderer in this phase.

Decision:

- `merge to main`: yes, for the current React/CSS/view-model refinements after review.
- `keep as experiment`: yes, for renderer-level experiments and shader/metaball routes.
- `drop renderer reintegration for now`: yes, until a separate renderer contract is written and accepted.

Rationale:

- Correctness gates now cover hydration/console noise, mobile scroll from the stage area, touch viewport semantics, touch node selection, horizontal overflow, composer/lineage overlap, and visual smoke screenshots.
- `合` is now treated as a convergence record across stage, sidebar, right panel, and composer language rather than as a permanent third bubble.
- Workspace management and hero chrome have been visually downgraded so the graph field is the first product surface.
- The experimental renderer still has unresolved product-contract risk: graph truth source, canvas accessibility, reduced-motion fallback, and touch/keyboard parity. That work should remain outside this merge.

Latest verification:

- `npm run lint`: pass, 0 errors / 38 existing warnings.
- `npm test`: pass, 16 files / 104 tests.
- `npm run build`: pass, existing warnings only.
- `npm run test:visual-dialogue`: pass, covering desktop, tablet, tablet touch, mobile, and mobile touch.
- `git diff --check`: pass.

Known non-blockers:

- The repository still has existing lint warnings in legacy/API/experiment files. They are warning-only and not introduced by this phase.
- `codex/dialectic-v2-mainline` contains an older unsquashed `08d815c` pending-interaction patch that is not directly in `main`; the current visual reintegration line includes those behaviors semantically and extends them with source-bound roundtable pending, touch copy, convergence-record UI, and stronger visual smoke coverage.

Merge boundary:

- Merge the current visual reintegration refinement slice as a product UI iteration.
- Do not include renderer reconnection, shader promotion, or additional `/roundtable` feature expansion.
- After merge, any renderer work should start as a new phase with its own acceptance gate.
