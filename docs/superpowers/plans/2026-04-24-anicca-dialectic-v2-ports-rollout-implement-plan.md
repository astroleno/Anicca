# Anicca Dialectic V2 Ports And Rollout Implement Plan

> **For agentic workers:** Execute this as the final rollout slice after backend and frontend implementation plans are complete. This plan owns public entrypoints, legacy isolation, docs alignment, and release verification.

**Goal:** Move the public mainline to `/dialogue`, preserve legacy experiments safely, and verify the port boundary is understandable to both users and implementers.

**Origin spec:** `docs/superpowers/specs/2026-04-23-anicca-dialectic-v2-mainline-design.md`

**Origin master plan:** `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`

---

## Scope

This plan owns:

- public route switch from `/` to `/dialogue`
- legacy isolation of `/newframe`
- README alignment with the new product path
- final test/build gate
- manual QA and rollout checklist

This plan does **not** own:

- backend route internals
- graph semantics
- dialogue shell internals

---

## Files

| File | Responsibility | Action |
|---|---|---|
| `src/app/page.tsx` | Root redirect | Modify |
| `src/app/newframe/page.tsx` | Legacy experiment notice + link-out | Modify |
| `src/app/__tests__/entrypoint-smoke.test.ts` | Entrypoint test | Create |
| `README.md` | Product and route description | Modify |

---

## Implementation Units

### Unit 1: Freeze public ports

- [ ] Redirect `/` to `/dialogue`
- [ ] Keep `/newframe` accessible
- [ ] Keep `/raymarching`, `/liquid`, and `/mochi` explicitly experimental
- [ ] Do not silently delete legacy experiments during rollout

### Unit 2: Mark legacy clearly

- [ ] Add a visible legacy banner to `/newframe`
- [ ] Link the banner back to `/dialogue`
- [ ] Make it obvious that `/newframe` is not the mainline product path

### Unit 3: Align top-level docs

- [ ] Run a full README pass, not just the opening sections
- [ ] Align README intro, data model, interaction model, route map, and roadmap with the `/dialogue` mainline
- [ ] Point primary usage to `/dialogue`
- [ ] Describe `/newframe` as legacy experiment rather than current product shell
- [ ] Remove stale references to `three bubbles`, `mute`, or other superseded product contracts

### Unit 4: Run release gate

- [ ] Run the full test suite
- [ ] Run a production build
- [ ] Confirm the entrypoint test covers the route switch
- [ ] Confirm stale-response discard behavior was manually exercised or covered in UI tests
- [ ] Confirm synthesis lineage behavior is consistent across breadcrumb, sidebar, panel, and composer
- [ ] Confirm manual QA items were exercised against the mainline path

---

## Manual QA Checklist

- [ ] Open `/` and confirm it redirects to `/dialogue`
- [ ] Open `/dialogue` and confirm the composer is immediately available
- [ ] Open `/newframe` and confirm the legacy banner points back to `/dialogue`
- [ ] Confirm `/newframe` still renders its experiment instead of breaking
- [ ] Resize to tablet and mobile widths and confirm the mainline shell remains operable
- [ ] Tab through sidebar, stage, panel, and composer and confirm visible focus states
- [ ] Trigger two overlapping generate actions and confirm the late response is discarded
- [ ] Focus a `合` node and confirm breadcrumb, sidebar placement, panel sources, and composer target all agree
- [ ] Reload `/dialogue` and confirm the prior workspace restores

---

## Dependencies

- Backend implement plan: `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-backend-implement-plan.md`
- Frontend implement plan: `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-frontend-implement-plan.md`

This rollout plan should land last.

---

## Exit Criteria

- `/` points to `/dialogue`
- `/newframe` is clearly marked legacy
- top-level docs no longer describe the product as “three bubbles + mute”
- full test/build gate passes
- the public route map matches the master plan and spec
