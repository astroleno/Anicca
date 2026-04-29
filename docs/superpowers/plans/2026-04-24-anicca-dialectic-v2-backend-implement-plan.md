# Anicca Dialectic V2 Backend Implement Plan

> **For agentic workers:** Execute this as the backend slice of the Dialectic V2 mainline. Keep work scoped to parsing, contracts, and route behavior. Do not implement dialogue UI in this plan.

**Goal:** Land a reliable backend contract for `/api/chat`, `/api/branches`, and `/api/synthesis` so the frontend can depend on stable structured outputs and stable error semantics.

**Origin spec:** `docs/superpowers/specs/2026-04-23-anicca-dialectic-v2-mainline-design.md`

**Origin master plan:** `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`

---

## Scope

This plan owns:

- test harness required for backend route work
- OpenAI Responses text extraction
- invalid model output handling
- request correlation echo contract
- `/api/branches` and `/api/synthesis` route contracts
- compatibility cleanup for `src/app/api/chat/route.ts`

This plan does **not** own:

- graph mutations
- view-model logic
- dialogue shell components
- route switching from `/` to `/dialogue`

---

## Compatibility Boundary

- `src/app/api/chat/route.ts` remains a legacy text endpoint, but it adopts the shared safe parsing path and the same `invalid_model_output` provider-format semantics.
- `src/app/api/chat/route.ts` does not become a substitute for `/api/branches` or `/api/synthesis`.
- legacy rerun helpers are outside this slice; this plan only documents the backend-facing compatibility rule they depend on.

---

## Files

| File | Responsibility | Action |
|---|---|---|
| `package.json` | Add test script and test deps | Modify |
| `package-lock.json` | Lock backend test deps | Modify |
| `vitest.config.ts` | Vitest config | Create |
| `tests/setup.ts` | JSDOM setup | Create |
| `src/lib/openai/readOutputText.ts` | Responses text extraction | Create |
| `src/lib/openai/readOutputText.test.ts` | Parser contract tests | Create |
| `src/app/api/chat/route.ts` | Use shared parser | Modify |
| `src/app/api/branches/route.ts` | Structured `正 / 反` generation | Create |
| `src/app/api/synthesis/route.ts` | Structured `合` generation | Create |
| `src/app/api/__tests__/dialectic-routes.test.ts` | Route contract tests | Create |

---

## Implementation Units

### Unit 1: Add backend test harness

- [ ] Add `vitest` + `@testing-library/jest-dom` + `jsdom` + `vite-tsconfig-paths`
- [ ] Create `vitest.config.ts`
- [ ] Create `tests/setup.ts`
- [ ] Verify `npm run test` works before route work begins

### Unit 2: Normalize Responses text extraction

- [ ] Create `src/lib/openai/readOutputText.ts`
- [ ] Cover `output_text`
- [ ] Cover fallback `output[].content[].text`
- [ ] Return empty string instead of throwing on missing text
- [ ] Update `src/app/api/chat/route.ts` to use the shared parser
- [ ] Make `/api/chat` return `502 invalid_model_output` on provider-format failures instead of silently coercing arbitrary output

### Unit 3: Implement `/api/branches` contract

- [ ] Validate `userText`
- [ ] Accept and echo `requestId`
- [ ] Forward `contextMessages`
- [ ] Parse first JSON object from model output, including fenced output
- [ ] Reject malformed payloads with `502 invalid_model_output`
- [ ] Reject payloads whose `stance` values do not match `正 / 反`
- [ ] Log invalid output without exposing raw provider errors to the client

### Unit 4: Implement `/api/synthesis` contract

- [ ] Validate `thesis` and `antithesis`
- [ ] Accept and echo `requestId`
- [ ] Forward `contextMessages`
- [ ] Parse first JSON object from model output, including fenced output
- [ ] Reject malformed payloads with `502 invalid_model_output`
- [ ] Reject payloads whose `stance` does not match `合`
- [ ] Log invalid output without exposing raw provider errors to the client

### Unit 5: Freeze backend error semantics

- [ ] Keep `400` for caller input errors
- [ ] Keep `502 invalid_model_output` for parse/shape/provider-format errors
- [ ] Reserve `500` for true server failures only
- [ ] Ensure these semantics are reflected in tests and route comments
- [ ] Ensure `/api/chat`, `/api/branches`, and `/api/synthesis` do not drift on provider-format handling

---

## Test Matrix

| File | Scenario |
|---|---|
| `src/lib/openai/readOutputText.test.ts` | `output_text`, fallback parts, empty output |
| `src/app/api/__tests__/dialectic-routes.test.ts` | valid `正 / 反`, valid `合`, invalid JSON returns `502`, malformed payload returns `502`, requestId is echoed |

---

## Sequencing

1. Land test harness.
2. Land parser utility.
3. Land `/api/branches`.
4. Land `/api/synthesis`.
5. Run backend test suite.

This plan should complete before the frontend shell depends on these routes.

---

## Exit Criteria

- `npm run test -- src/lib/openai/readOutputText.test.ts` passes
- `npm run test -- src/app/api/__tests__/dialectic-routes.test.ts` passes
- `/api/branches` never does raw `JSON.parse(readOutputText(result))` without a guard
- `/api/synthesis` never does raw `JSON.parse(readOutputText(result))` without a guard
- `/api/chat` no longer silently stringifies malformed provider output
- `/api/branches` and `/api/synthesis` both echo caller-supplied `requestId`
- frontend callers can distinguish bad input from bad model output from server failure
