# Anicca Dialectic V2 Workspace Phase Implement Plan

> **For agentic workers:** Execute this only after the `/dialogue` release gate is closed. Keep this phase local-first. Do not add auth, cloud sync, or server persistence here.

**Goal:** Upgrade `/dialogue` from a single restored snapshot to a multi-workspace local system with a stable workspace registry, migration from the current single-workspace key, validated import/export, naming and switching, and minimal adoption telemetry.

**Origin docs:** `README.md`, `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`

**Current integration status (2026-04-29):**

- Phase 2 Unit 1 is implemented on isolated branch `codex/workspace-registry-unit1`.
- Unit 1 implementation commit: `7a992bb feat(workspaces): add registry migration foundation`.
- The branch is pushed to `origin/codex/workspace-registry-unit1`.
- Unit 1 is not yet merged into `codex/dialectic-v2-mainline`; mainline is still at `2c294fe` for this workstream.
- `codex/workspace-phase2-continuation` is a stacked continuation branch based on Unit 1, used to port the previous round's Unit 2+ work without expanding the Unit 1 review branch.
- Merge order remains Unit 1 first, then continuation work after migration smoke.

---

## Preconditions

- The `/dialogue` release gate is closed on a clean branch, including manual QA.
- A live provider smoke pass has been run with `OPENAI_API_KEY`; this is part of release verification, not a Phase 2 deliverable.
- Phase 2 must preserve the current mainline contracts for lineage, request matching, and legacy isolation.

---

## Phase Entry Gate

- [x] Confirm the clean release branch records the `/dialogue` release checklist as complete, including manual checks.
- [x] Confirm a live provider smoke pass with `OPENAI_API_KEY` has been run and recorded.
- [x] Keep Unit 2, Unit 3, and Unit 4 off the Unit 1 review branch until Unit 1 lands and the registry contract is the active persistence path.

This phase was unblocked for Unit 1 only on `codex/workspace-registry-unit1`. Follow-up units may be staged on `codex/workspace-phase2-continuation`, but merge/release remains blocked until Unit 1 is merged into `codex/dialectic-v2-mainline` and the browser migration smoke passes.

---

## Scope

This plan owns:

- workspace registry contract and migration from the current single-workspace snapshot
- stable `workspaceId` identity separated from runtime request ownership
- validated workspace export/import
- workspace naming, listing, creation, and switching
- minimal telemetry for post-launch adoption signals

This plan does **not** own:

- backend storage or cloud sync
- authentication, accounts, or cross-device workspace sharing
- shader / metaball / raymarching reintegration
- changes to `/api/branches` or `/api/synthesis` contracts beyond telemetry-safe client usage

---

## Core Contracts

### 1. Stable Workspace Identity

- Introduce a stable `workspaceId` for persistence, routing of local records, export/import, and recent-workspace management.
- Keep `workspaceSessionId` as a runtime-only request-ownership token for stale-response protection.
- `workspaceSessionId` must be regenerated when a workspace is hydrated, created, imported, or switched into active use.
- Pending request state remains transient and must never be exported or restored.

### 2. Registry Before Features

- Phase 2 starts by replacing the single-key persistence model with:
  - a workspace registry
  - per-workspace snapshots
  - an explicit `activeWorkspaceId`
- Do not add rename/switch/import flows on top of the current single-key `anicca_workspace_v2` shape.
- Registry metadata must be sufficient to render a recent-workspace list without reading every full graph blob on boot.

### 3. Migration Policy

- The current single-workspace snapshot in `src/lib/persist/local.ts` is the migration source.
- First boot after Phase 2 should migrate the existing snapshot into:
  - one generated `workspaceId`
  - one registry entry
  - one per-workspace snapshot record
- Successful migration must be idempotent and must explicitly consume the legacy source path:
  - boot must prefer the registry path whenever registry metadata already exists
  - the legacy key must only be considered when the registry path is not yet initialized
  - after a successful migration write, persist a migration-consumed marker before treating the legacy path as finished
  - remove the legacy key `anicca_workspace_v2` on a best-effort basis after the marker and new registry writes succeed
- If the legacy key still exists after a successful migration, the migration-consumed marker must suppress duplicate workspace creation on later boots.
- Migration failures must fail closed:
  - keep the app usable
  - avoid partial registry writes
  - never corrupt the original source snapshot before the new write succeeds

### 4. Export / Import Policy

- Export the current workspace as a workspace bundle, not a bare graph blob.
- Import validation must check:
  - bundle format version
  - workspace snapshot shape
  - graph version compatibility
  - absence of malformed metadata
- Imported workspaces must receive a fresh local `workspaceId` to avoid collisions with existing local records.
- Imported source-history timestamps such as `createdAt` and `updatedAt` may be preserved when valid.
- Local recency metadata must not be imported verbatim:
  - `lastOpenedAt` is local-only recent-list state
  - on import, local `lastOpenedAt` must be set to the import time, not the source bundle value
  - recent-workspace ordering after import must therefore use local import/open time rather than remote/source recency
- Imported bundles must clear transient state such as pending requests and runtime session ownership.

### 5. Telemetry Policy

- Telemetry is Phase 2 only in a minimal, privacy-safe form.
- Required signals:
  - `workspace_resumed`
  - `continuation_created`
  - `synthesis_created`
- Telemetry must be adapter-based with a no-op default.
- Missing telemetry configuration must not break `/dialogue`.

---

## Files

| File | Responsibility | Action |
|---|---|---|
| `src/types/workspace.ts` | Workspace registry, metadata, snapshot, and bundle contracts | Create |
| `src/lib/persist/local.ts` | Compatibility bridge for current single-workspace key and migration entrypoint | Modify |
| `src/lib/persist/workspaces.ts` | Registry CRUD, active workspace management, migration, per-workspace storage | Create |
| `src/lib/persist/workspaces.test.ts` | Registry and migration coverage | Create |
| `src/lib/io/json.ts` | Retire or repurpose stale graph-only MVP import/export helper | Modify |
| `src/lib/io/workspaceBundle.ts` | Workspace export/import validation and serialization | Create |
| `src/lib/io/workspaceBundle.test.ts` | Bundle validation and collision handling tests | Create |
| `src/features/dialectic/store.ts` | Active workspace state, session regeneration, switch/reset behavior | Modify |
| `src/features/dialectic/store.test.ts` | Store behavior for create/switch/reset flows | Modify |
| `src/features/dialectic/demoWorkspace.ts` | Seed demo data through the new workspace contract | Modify |
| `src/components/dialogue/DialogueShell.tsx` | Bootstrap active workspace, create/switch/import/export wiring, telemetry hooks | Modify |
| `src/components/dialogue/DialogueShell.test.tsx` | Workspace resume, switch, import/export, and telemetry-adjacent UX coverage | Modify |
| `src/components/dialogue/WorkspaceBar.tsx` | Current workspace label, recents list, create/switch/import/export controls | Create |
| `src/components/dialogue/WorkspaceBar.test.tsx` | Workspace bar interaction tests | Create |
| `src/components/dialogue/DialogueShell.module.css` | Workspace bar layout and responsive treatment | Modify |
| `src/lib/analytics/dialogue.ts` | Minimal telemetry adapter and event helpers | Create |
| `src/lib/analytics/dialogue.test.ts` | Telemetry payload and no-op adapter tests | Create |
| `README.md` | Phase 2 roadmap plus data model, persistence shape, and field semantics | Modify |

---

## Implementation Units

### Unit 1: Land the workspace registry and migration foundation

- [x] Introduce `workspaceId` as a stable persisted identifier distinct from `workspaceSessionId`
- [x] Define registry metadata with at least:
  - `id`
  - `title`
  - `createdAt`
  - `updatedAt`
  - `lastOpenedAt`
  - lightweight summary fields needed for recent-workspace UI
- [x] Add explicit `activeWorkspaceId`
- [x] Store registry metadata separately from full workspace snapshots
- [x] Migrate the current single-key `anicca_workspace_v2` snapshot into the new registry on first load
- [x] Regenerate `workspaceSessionId` on hydrate, create, and workspace activation; later import/switch UI must use the same activation path
- [x] Keep pending requests and transient errors out of persisted workspace records
- [x] Ensure demo workspace creation goes through the same registry contract as real workspaces
- [x] Update `README.md` data-model and persistence sections so `workspaceId` is the persisted identity and `workspaceSessionId` is documented as runtime-only session ownership

Unit 1 closeout:

- Implementation branch: `codex/workspace-registry-unit1`
- Implementation commit: `7a992bb feat(workspaces): add registry migration foundation`
- Integration state: pushed, not merged
- Deferred by scope: export/import, workspace naming, recent workspace UI, create/switch UI, telemetry

#### Unit 1 Expanded Task Slice

##### Step 1: Write the failing migration and boot-path tests first

- [x] Create `src/lib/persist/workspaces.test.ts` with failing tests for:
  - migration from legacy `anicca_workspace_v2`
  - idempotent re-boot after migration does not create a duplicate workspace
  - creation of registry metadata
  - creation of `activeWorkspaceId`
  - regeneration of `workspaceSessionId` on hydrate/switch
- [x] Extend `src/features/dialectic/store.test.ts` with failing tests for `workspaceId`-aware hydration and runtime session regeneration.
- [x] Extend `src/components/dialogue/DialogueShell.test.tsx` with a failing boot-path test that expects `/dialogue` to load through the active workspace registry instead of the legacy single snapshot key.
- [x] Verification command:
  - `npm test -- src/lib/persist/workspaces.test.ts src/features/dialectic/store.test.ts src/components/dialogue/DialogueShell.test.tsx`
- [x] Expected result before implementation:
  - missing module failures for `src/lib/persist/workspaces.ts`
  - state-shape failures for missing `workspaceId`
  - boot-path failures because `DialogueShell` still reads the legacy single snapshot directly

##### Step 2: Define the registry contract in types first

- [x] Create `src/types/workspace.ts`.
- [x] Define exact persisted concepts:
  - `WorkspaceId`
  - `WorkspaceRegistryEntry`
  - `WorkspaceRegistry`
  - `PersistedWorkspaceSnapshot`
- [x] Keep `workspaceId` stable and persisted.
- [x] Keep `workspaceSessionId` runtime-only and outside exported bundle identity.

##### Step 3: Implement storage keys and migration path

- [x] Create `src/lib/persist/workspaces.ts`.
- [x] Use exact storage keys:
  - legacy source key: `anicca_workspace_v2`
  - migration marker key: `anicca_workspace_legacy_migrated_v1`
  - registry key: `anicca_workspace_registry_v1`
  - active workspace key: `anicca_workspace_active_v1`
  - snapshot key prefix: `anicca_workspace_snapshot_v1:`
- [x] Implement exact responsibilities:
  - migrate legacy single snapshot if needed
  - create/read/update registry metadata
  - create/read/update per-workspace snapshots
  - read/write `activeWorkspaceId`
  - read/write the legacy migration-consumed marker
  - regenerate `workspaceSessionId` when activating a workspace
- [x] Migration must write the new snapshot, registry, active workspace id, and migration marker successfully before treating the legacy shape as consumed.
- [x] Boot must not create a second migrated workspace when the marker exists, even if the legacy key still remains.

##### Step 4: Convert the legacy persistence module into a compatibility bridge

- [x] Modify `src/lib/persist/local.ts` so it no longer represents the long-term active persistence model.
- [x] Keep it only as:
  - legacy snapshot reader for migration source data
  - compatibility bridge if other mainline code still imports it during Unit 1
- [x] Do not leave two independent active persistence paths in the codebase.

##### Step 5: Move store and boot logic onto the new registry path

- [x] Modify `src/features/dialectic/store.ts` so hydrated state includes persisted `workspaceId`.
- [x] Ensure create/hydrate/activation paths regenerate runtime `workspaceSessionId`.
- [x] Modify `src/features/dialectic/demoWorkspace.ts` to produce data compatible with the new workspace snapshot contract.
- [x] Modify `src/components/dialogue/DialogueShell.tsx` boot flow to:
  - migrate legacy data if needed
  - load the active workspace by `activeWorkspaceId`
  - hydrate graph, focus, composer target, and stage layout from that workspace
  - persist back through the registry path instead of the legacy single key

##### Step 6: Align docs before closing Unit 1

- [x] Update `README.md` section `四、数据模型（当前 contract）` so it no longer documents `workspaceSessionId` as the persisted workspace identity.
- [x] Update `README.md` persistence and roadmap text to describe:
  - stable `workspaceId`
  - runtime-only `workspaceSessionId`
  - registry + active workspace + per-workspace snapshot shape
- [x] Do not leave stale JSON examples or field descriptions that reflect the Phase 1 single-workspace model after Unit 1 lands.

##### Step 7: Verification and commit slices

- [x] Targeted verification command:
  - `npm test -- src/lib/persist/workspaces.test.ts src/features/dialectic/store.test.ts src/components/dialogue/DialogueShell.test.tsx`
- [x] Broader verification command after Unit 1 stabilizes:
  - `npm test`
- [x] Actual Unit 1 commit:
  - `7a992bb feat(workspaces): add registry migration foundation`

Unit 1 verification record:

- `npm run lint`: passed, 0 errors / 38 warnings
- `npm test`: passed, 13 files / 51 tests
- `npm run build`: passed
- `npm run test:visual-dialogue`: passed
- `git diff --check`: passed

### Unit 2: Add validated workspace export and import

- [x] Define a versioned workspace bundle JSON shape
- [x] Replace graph-only MVP import/export with workspace-aware import/export
- [x] Validate bundle format, graph version, and metadata before import
- [x] Reject malformed or incompatible bundles with recoverable UI copy
- [x] Assign a fresh local `workspaceId` on import, even when the incoming bundle already contains one
- [x] Preserve safe user-facing metadata such as title and timestamps when valid
- [x] Preserve source-history timestamps separately from local recency semantics
- [x] Set local `lastOpenedAt` to import time so imported workspaces sort as newly opened locally
- [x] Strip transient request/session state from imported payloads
- [x] Add UI entry points for export current workspace and import into local registry

#### Unit 2 Expanded Task Slice

##### Step 1: Write the failing export/import tests first

- [x] Create `src/lib/io/workspaceBundle.test.ts` with failing tests for:
  - exporting the current active workspace as a versioned bundle
  - rejecting malformed JSON payloads
  - rejecting incompatible graph versions
  - assigning a fresh local `workspaceId` on import
  - resetting local `lastOpenedAt` to import time instead of the bundle value
  - clearing transient runtime session ownership on import
- [x] Extend `src/components/dialogue/DialogueShell.test.tsx` with failing tests for:
  - exporting the active workspace through a shell-level action
  - importing a valid bundle into a new local workspace
  - preserving graph/focus content while regenerating runtime ownership
- [x] `src/lib/io/json.ts` no longer defines the `/dialogue` mainline path; it remains only as a deprecated raw-graph helper with current graph-version validation.
- [x] Verification command:
  - `npm test -- src/lib/io/workspaceBundle.test.ts src/components/dialogue/DialogueShell.test.tsx`

##### Step 2: Define the workspace bundle contract before wiring UI

- [x] Extend `src/types/workspace.ts` or `src/lib/io/workspaceBundle.ts` with exact bundle concepts:
  - `ANICCA_WORKSPACE_BUNDLE_VERSION`
  - `WorkspaceBundle`
  - `WorkspaceBundleMetadata`
  - import result shape that distinguishes source-history timestamps from local recency metadata
- [x] The bundle contract makes this distinction explicit:
  - `createdAt` / `updatedAt` may be preserved when valid
  - `lastOpenedAt` is never trusted as source-of-truth local recency

##### Step 3: Implement serializer, validator, and import path

- [x] Create `src/lib/io/workspaceBundle.ts`.
- [x] Implement exact responsibilities:
  - serialize the active workspace into a versioned bundle
  - parse JSON safely
  - validate bundle format version
  - validate snapshot shape and graph version compatibility
  - sanitize malformed metadata
  - assign a fresh local `workspaceId`
  - keep `workspaceSessionId` out of persisted/imported snapshots
  - rely on workspace activation to regenerate runtime `workspaceSessionId`
  - write imported workspaces into the existing registry path
- [x] `src/lib/io/json.ts` has been reduced to a deprecated raw-graph helper and no longer defines the mainline `/dialogue` import/export contract.

##### Step 4: Wire import/export through the dialogue shell

- [x] Modify `src/components/dialogue/DialogueShell.tsx` to expose export/import entry points without introducing cloud or auth flows.
- [x] Export operates on the current active workspace.
- [x] Import:
  - write a new local workspace record
  - set it active
  - hydrate graph, focus, composer target, and stage layouts from the imported snapshot
  - clear transient pending/error state
  - regenerate runtime `workspaceSessionId`
- [x] Keep the UI recoverable:
  - invalid bundles must show user-facing validation copy
  - failed imports must not corrupt existing registry state

##### Step 5: Align docs and verification before closing Unit 2

- [x] Update `README.md` to describe workspace bundle export/import rather than raw graph export/import.
- [x] Explicitly document that imported workspaces get a fresh local `workspaceId` and a new local `lastOpenedAt`.
- [x] Verification commands:
  - `npm test -- src/lib/io/workspaceBundle.test.ts src/components/dialogue/DialogueShell.test.tsx`
  - `npm test`
  - `npm run build`
- [x] `npm run test:visual-dialogue`
- [x] Preferred commit slices:
  - `test(workspaces): characterize workspace bundle import export`
  - `feat(workspaces): add validated workspace bundle io`
  - `feat(dialogue): wire workspace import export actions`
  - `docs(workspaces): document bundle import export semantics`

### Unit 3: Add workspace naming, listing, creation, and switching

- [x] Add a workspace bar or equivalent shell-level control for current workspace operations
- [x] Create a new empty workspace without mutating the currently active graph
- [x] Derive a default workspace title from the earliest/root topic until the user renames it
- [x] Support explicit rename of the current workspace
- [x] Render a recent-workspace list from registry metadata
- [x] Switching workspaces must:
  - cancel transient pending state
  - hydrate graph, focus, composer target, and stage layout from the selected snapshot
  - issue a fresh `workspaceSessionId`
- [x] Keep active workspace metadata in sync when graph content changes materially

#### Unit 3 Verification

- 2026-04-28: targeted `npx vitest run src/lib/persist/workspaces.test.ts src/components/dialogue/WorkspaceBar.test.tsx src/components/dialogue/DialogueShell.test.tsx` passed with 3 test files / 26 tests
- 2026-04-28: default `npm test` passed with 14 test files / 69 tests
- 2026-04-28: `npm run build` passed
- 2026-04-28: `npm run test:visual-dialogue` passed

### Unit 4: Add minimal adoption telemetry

- [x] Add an adapter-based telemetry module with a no-op default sink
- [x] Emit `workspace_resumed` when a workspace is restored or switched into active use
- [x] Emit `continuation_created` only after a branch generation succeeds and graph writes land
- [x] Emit `synthesis_created` only after synthesis succeeds and graph writes land
- [x] Keep payloads privacy-safe and low-cardinality
- [x] Ensure telemetry failures never block UI, persistence, or request flows

#### Unit 4 Verification

- 2026-04-28: targeted `npx vitest run src/lib/analytics/dialogue.test.ts src/components/dialogue/DialogueShell.test.tsx` passed with 2 test files / 21 tests
- 2026-04-28: default `npm test` passed with 15 test files / 77 tests
- 2026-04-28: `npm run build` passed
- 2026-04-28: `npm run test:visual-dialogue` passed

---

## Test Matrix

| File | Scenario |
|---|---|
| `src/lib/persist/workspaces.test.ts` | migrate old single snapshot, create registry entry, switch active workspace, regenerate runtime session id |
| `src/lib/io/workspaceBundle.test.ts` | export bundle shape, import valid bundle, reject malformed bundle, reject incompatible graph version, fresh local workspace id on collision, imported `lastOpenedAt` resets to local import time |
| `src/features/dialectic/store.test.ts` | switching workspaces resets transient pending state and keeps active workspace state coherent |
| `src/components/dialogue/WorkspaceBar.test.tsx` | create workspace, rename workspace, switch workspace, import/export control visibility |
| `src/components/dialogue/DialogueShell.test.tsx` | boot restores active workspace, import creates a new local workspace, switching updates graph/focus, telemetry does not fire on stale or failed requests |
| `src/lib/analytics/dialogue.test.ts` | no-op adapter safety and event payload contract |

---

## Sequencing

1. Confirm Phase Entry Gate.
2. Unit 1 only: registry and migration foundation.
3. Review Unit 1 results before starting export/import.
4. Export/import bundle contract.
5. Naming, list, and switching UI.
6. Minimal telemetry.

Do not start Unit 2 or Unit 3 on top of the current single-snapshot persistence model.

---

## Exit Criteria

- `/dialogue` boots through a workspace registry, not a single global snapshot key
- Existing users with one local workspace are migrated forward without manual intervention
- Workspace switching does not leak pending requests or stale session ownership across workspaces
- Exported files contain workspace bundle metadata rather than only a raw graph
- Invalid imports fail safely and do not corrupt local registry state
- Users can create, rename, switch, export, and import workspaces from the mainline shell
- Minimal telemetry exists for workspace resume, continuation creation, and synthesis creation
- Phase 2 still preserves current lineage, request matching, and `/newframe` legacy boundaries
- `README.md` no longer documents `workspaceSessionId` as the persisted local workspace identity
