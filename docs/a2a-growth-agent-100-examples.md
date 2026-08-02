# A2A Growth Agent 100 Example Design

Purpose: provide 100 independently designed examples for testing Anicca's internal A2A growth layer and the surrounding framework.

Scope baseline:

- Internal A2A contract: `UserAgentEvent`, `ArtworkAgentProfile`, `ArtworkAgentResponse`, `GrowthSession`.
- Existing local artwork agents: `artwork_mist_mountain`, `artwork_night_crossing`, `artwork_cracked_garden`, `artwork_still_table`.
- Existing growth operators: `expand`, `counter_aha`, `merge_promote`, `resonate`, `reframe`.
- Framework paths to exercise: event inference, profile validation, routing, orchestration, graph projection, retrieval, dialogue UI integration, persistence, privacy boundary, and regression stability.

The "10 agents" below are independent test-design roles. Each role contributes 10 examples without depending on another role's cases.

## Agent 01: Contract Sentinel

Focus: runtime contract parsing, stable IDs, and schema rejection.

1. **A01-01 Empty event rejection**
   Input: `"   "`
   Expected: `buildUserAgentEvent` throws `growth_event_empty_input`.
   Verify: no graph node, no `GrowthSession`, no memory write.

2. **A01-02 Request ID echo and event ID**
   Input: `{ text: "我想知道这个方向为什么卡住", requestId: "req_reflect" }`
   Expected: `event.id = "event_req_reflect"`, `intent = "reflect"`.
   Verify: request ID is echoed by `runGrowthSession`.

3. **A01-03 Request ID sanitization**
   Input: `{ text: "继续推进", requestId: "req:42/a" }`
   Expected: `event.id = "event_req_42_a"`.
   Verify: non `[a-zA-Z0-9_-]` characters become `_`.

4. **A01-04 Stable hash without request ID**
   Input: `"同一个输入应该得到同一个事件 id"`
   Expected: repeated calls produce the same `event.id`.
   Verify: no timestamp or random suffix enters event construction.

5. **A01-05 Memory ref accepted**
   Input: text plus one `memoryRef` with `source = "explicit"`, `scope = "turn"`, `confidence = 0.8`.
   Expected: event parses and preserves that memory ref.
   Verify: later graph projection stores only `memoryRefIds`, not the whole memory payload.

6. **A01-06 Invalid memory source rejected**
   Input: memory ref with `source = "browser_history"`.
   Expected: `parseUserAgentEvent` throws `invalid_memory_ref_source`.
   Verify: framework does not silently widen memory provenance.

7. **A01-07 Invalid confidence rejected**
   Input: memory ref or response with `confidence = 1.2`.
   Expected: parser throws the matching `invalid_*_confidence` error.
   Verify: confidence remains within `[0, 1]`.

8. **A01-08 Unknown growth operator rejected**
   Input: response with `operator = "debate"`.
   Expected: `parseArtworkAgentResponse` throws `invalid_growth_operator`.
   Verify: model-shaped output cannot invent operators.

9. **A01-09 Empty artwork capabilities rejected**
   Input: profile with `capabilities = []`.
   Expected: `parseArtworkAgentProfile` throws `invalid_artwork_agent_profile_capabilities`.
   Verify: every artwork agent declares at least one callable behavior.

10. **A01-10 Response text required**
    Input: response with blank `text`.
    Expected: `parseArtworkAgentResponse` throws `invalid_artwork_agent_response_text`.
    Verify: no empty assistant node is projected from malformed A2A output.

## Agent 02: User Event Interpreter

Focus: deterministic intent, mood, tension, uncertainty, and growth-need inference.

1. **A02-01 Search intent**
   Input: `"帮我推荐一个能回应迷茫的画作视角"`
   Expected: `intent = "search"`, mood includes `neutral` or low-risk inference.
   Verify: no long-term memory is created from the search.

2. **A02-02 Create intent**
   Input: `"帮我设计一个新的对话分支"`
   Expected: `intent = "create"`, mood includes `generative`, growth needs include `expand`.
   Verify: route can select an `expand`-capable artwork.

3. **A02-03 Compare intent**
   Input: `"继续做还是暂停复盘？"`
   Expected: `intent = "compare"`, tensions include `choice_pressure`, growth needs include `reframe`.
   Verify: at least one routed response uses `reframe` when supported.

4. **A02-04 Confess intent**
   Input: `"我承认我有点害怕这个方向会失败"`
   Expected: `intent = "confess"`, mood includes `uneasy`, intensity increases.
   Verify: preferred operator includes `resonate`.

5. **A02-05 Continue intent**
   Input: `"下一步继续推进，但先拆小"`
   Expected: `intent = "continue"`.
   Verify: graph projection can attach this as a child user node when `targetAssistantId` is provided.

6. **A02-06 Reflect fallback**
   Input: `"我想知道这个方向为什么卡住"`
   Expected: `intent = "reflect"`, mood includes `reflective`, growth needs include `resonate`.
   Verify: no compare/create/search keyword wins accidentally.

7. **A02-07 High uncertainty**
   Input: `"也许这一步不确定，可能需要换个角度？"`
   Expected: `affect.uncertainty >= 0.6`, tensions include `ambiguity`, growth needs include `expand`.
   Verify: uncertainty stays bounded at `<= 1`.

8. **A02-08 Mixed frame tension**
   Input: `"我一边想加速，另一边又觉得应该等一等"`
   Expected: tensions include `mixed_frame`.
   Verify: response can add context without forcing a binary branch.

9. **A02-09 Single frame tension**
   Input: `"这个方案一定是唯一答案，必须马上定下来"`
   Expected: tensions include `single_frame`, growth needs include `counter_aha`.
   Verify: routed operators include `counter_aha` when a candidate supports it.

10. **A02-10 Blocked mood**
    Input: `"我很累，卡住了，不知道要不要继续"`
    Expected: mood includes `blocked`, uncertainty is high, intent is `continue` or `compare` depending keyword priority.
    Verify: the event remains turn-scoped and does not create a diagnosis.

## Agent 03: Artwork Router

Focus: scoring, candidate order, operator selection, and deterministic fallback.

1. **A03-01 Night crossing wins on risk/direction**
   Input: `"下一步风险和方向都不确定，像夜里找灯"`
   Expected first candidate: `artwork_night_crossing`.
   Verify: matched signals include direction/risk/night/lamp-related overlap.

2. **A03-02 Mist mountain wins on ambiguity and patience**
   Input: `"这件事像雾山留白，我不急着定论"`
   Expected first candidate: `artwork_mist_mountain`.
   Verify: route favors ambiguity/patience/distance signals.

3. **A03-03 Cracked garden wins on repair/growth**
   Input: `"裂隙里还能生长吗？我想修复这个冲突"`
   Expected first candidate: `artwork_cracked_garden`.
   Verify: route picks an agent that can `counter_aha` or `merge_promote`.

4. **A03-04 Still table wins on concrete execution**
   Input: `"把这个计划拆小到桌面清单和下一步动作"`
   Expected first candidate: `artwork_still_table`.
   Verify: practice/inventory/small-step signals beat abstract profiles.

5. **A03-05 Overconfident input selects counter aha**
   Input: `"必须选这个，其他都是错的"`
   Expected: at least one route has `operator = "counter_aha"`.
   Verify: every route's operator is included in that profile's `capabilities`.

6. **A03-06 Compare input selects reframe**
   Input: `"继续发布还是先重构？"`
   Expected: preferred operators include `reframe`.
   Verify: unsupported profiles rotate to the next supported operator.

7. **A03-07 Candidate limit one**
   Input: `"不确定，想看一个最贴近的画作视角"` with `candidateLimit = 1`.
   Expected: exactly one candidate and one response.
   Verify: no `merge_promote` synthesis is produced when response count is `< 2`.

8. **A03-08 Candidate limit four**
   Input: `"风险、方向、修复、执行都要看"` with `candidateLimit = 4`.
   Expected: all four local artwork agents can appear.
   Verify: output remains deterministically sorted by score then ID.

9. **A03-09 No-overlap fallback**
   Input: `"今天随便聊一个没有明显标签的话题"`
   Expected: deterministic fallback order from profile registry.
   Verify: scores use the stable fallback values instead of random ranking.

10. **A03-10 Matched signal includes capability**
    Input: `"也许不确定，需要展开"`
    Expected: growth needs include `expand`; expand-capable profiles gain score.
    Verify: `matchedSignals` includes `expand` for matching candidates.

## Agent 04: Artwork Profile Auditor

Focus: local profile registry quality and capability constraints.

1. **A04-01 Registry has usable profiles**
   Setup: call `getArtworkAgentProfiles()`.
   Expected: at least four parsed profiles.
   Verify: every profile has `artworkId`, `title`, `voice`, signals, and capabilities.

2. **A04-02 Find existing profile**
   Setup: `findArtworkAgentProfile("artwork_night_crossing")`.
   Expected: returns `夜航灯`.
   Verify: profile can be used by routing and graph labels.

3. **A04-03 Missing profile returns null**
   Setup: `findArtworkAgentProfile("artwork_unknown")`.
   Expected: `null`.
   Verify: caller does not fabricate a profile.

4. **A04-04 Unsupported operator blocked**
   Setup: call `assertArtworkSupportsOperator(artwork_mist_mountain, "counter_aha")`.
   Expected: throws `artwork_operator_not_supported:*`.
   Verify: router must not assign unsupported operators.

5. **A04-05 Capability values are closed**
   Setup: profile with capability `"summon"`.
   Expected: `invalid_growth_operator`.
   Verify: future curator imports cannot widen protocol by typo.

6. **A04-06 Constraints are preserved**
   Setup: profile with `constraints = ["avoid diagnosis"]`.
   Expected: parser keeps non-empty constraints.
   Verify: downstream generation can read safety boundaries.

7. **A04-07 Missing signal arrays rejected**
   Setup: profile missing `themes` or `sensoryHooks`.
   Expected: matching `invalid_artwork_agent_profile_*` error.
   Verify: every agent remains routable and inspectable.

8. **A04-08 Chinese signal matching**
   Input: `"留白、山、雾、冷光"`
   Expected: `artwork_mist_mountain` scores from Chinese signals.
   Verify: bilingual profile fields are not decorative only.

9. **A04-09 Memory affinities are not user memory**
   Setup: inspect `memoryAffinities`.
   Expected: they are static profile signals, not persisted user claims.
   Verify: no `MemoryRef` object is created from profile data.

10. **A04-10 Titles are projection labels**
    Setup: project responses to graph.
    Expected: assistant labels use profile titles such as `夜航灯`.
    Verify: label fallback only uses `artworkId` when profile is absent.

## Agent 05: Growth Orchestrator

Focus: `runGrowthSession` session shape, response construction, synthesis, and confidence.

1. **A05-01 Complete session with request echo**
   Input: `{ text: "也许下一步要把这个方向拆小一点？", requestId: "req_growth" }`
   Expected: `session.requestId = "req_growth"`, `userEvent.id = "event_req_growth"`.
   Verify: candidates, responses, and synthesis are present for default limit.

2. **A05-02 Response count equals candidate count**
   Input: default candidate limit.
   Expected: `responses.length === candidates.length === 3`.
   Verify: no routed agent is silently dropped.

3. **A05-03 Response references artwork title**
   Input: `"夜里找灯，方向不确定"`
   Expected: each response text contains its candidate title.
   Verify: user can inspect which artwork agent spoke.

4. **A05-04 Stance follows operator**
   Input: `"一定只有这条路"`
   Expected: `counter_aha -> opposes`, `resonate -> resonates`, `expand/reframe -> extends`.
   Verify: stance is not free-form model prose.

5. **A05-05 Confidence is clamped**
   Input: any high-score event.
   Expected: every response `confidence` is within `[0, 1]`.
   Verify: projection can average confidence safely.

6. **A05-06 Synthesis for multiple responses**
   Input: default candidate limit.
   Expected: `synthesis.operator = "merge_promote"`.
   Verify: `sourceArtworkIds` exactly equals response artwork IDs.

7. **A05-07 No synthesis for single response**
   Input: `{ text: "只要一个视角", candidateLimit: 1 }`.
   Expected: `synthesis` is absent.
   Verify: merge promotion only happens when there are multiple sources.

8. **A05-08 Four-agent session**
   Input: `{ text: "风险、修复、执行、留白都要看", candidateLimit: 4 }`.
   Expected: four candidates and four responses.
   Verify: all local profiles remain compatible with response parser.

9. **A05-09 Deterministic local output**
   Input: same text and request ID twice.
   Expected: identical candidate order, operators, summaries, and synthesis fields.
   Verify: no model call or random source changes the local MVP.

10. **A05-10 Candidate override**
    Setup: pass a custom profile list with one valid artwork agent.
    Expected: only that profile responds.
    Verify: orchestrator honors injected test fixtures.

## Agent 06: Graph Projection Inspector

Focus: `BranchGraphStore` integration, growth metadata, edge reasons, and branch safety.

1. **A06-01 Root growth projection**
   Setup: empty store, project a normal growth session.
   Expected: a new user node is added to `entryIds`.
   Verify: user node meta includes `growth.eventId`.

2. **A06-02 Response nodes are assistants without branch type**
   Setup: project session with three responses.
   Expected: every response node has `kind = "assistant"` and `branchType === undefined`.
   Verify: growth responses are not canonical `正 / 反 / 合`.

3. **A06-03 Response growth metadata**
   Setup: inspect projected response node meta.
   Expected: `eventId`, `operator`, `artworkId`, `confidence` are present.
   Verify: values match `session.responses`.

4. **A06-04 Explicit growth edge reasons**
   Setup: inspect graph edges after projection.
   Expected: edge reasons include `growth:${response.operator}`.
   Verify: retrieval can map the relation explicitly.

5. **A06-05 Synthesis source node IDs**
   Setup: project session with synthesis.
   Expected: synthesis node meta has `sourceNodeIds = responseNodeIds`.
   Verify: synthesis can be inspected back to all artwork replies.

6. **A06-06 Average synthesis confidence**
   Setup: compare synthesis meta confidence to average response confidence.
   Expected: number rounded to two decimals.
   Verify: no confidence is invented for synthesis.

7. **A06-07 Projection under existing assistant**
   Setup: create normal user -> 正/反 pair, then project growth under 正.
   Expected: new user node has parent `[thesisId]`.
   Verify: root user's first children remain `[thesisId, antithesisId]`.

8. **A06-08 Invalid target assistant rejected**
   Setup: call projection with `targetAssistantId = "missing"`.
   Expected: store throws `assistant parent not found`.
   Verify: growth cannot attach to a missing branch.

9. **A06-09 Growth assistant requires parent**
   Setup: call `createGrowthAssistant([], draft)`.
   Expected: throws `growth assistant requires at least one parent`.
   Verify: orphan growth responses are impossible.

10. **A06-10 Duplicate parent IDs deduped**
    Setup: call `createGrowthAssistant([userId, userId], draft)`.
    Expected: created node has one parent entry.
    Verify: no duplicate edges from repeated parent IDs.

## Agent 07: Retrieval Cartographer

Focus: workspace graph retrieval with growth relations and metadata matching.

1. **A07-01 Normalize growth node metadata**
   Setup: project a growth session, then normalize/query graph.
   Expected: retrieval nodes include `growth.operator`, `growth.artworkId`, `growth.eventId`.
   Verify: growth metadata survives the retrieval view.

2. **A07-02 Explicit expand relation**
   Setup: edge reason `growth:expand`.
   Expected: relation resolves to `growth:expand` with `confidence = "explicit"`.
   Verify: no warning for known growth edge reasons.

3. **A07-03 Explicit counter aha relation**
   Setup: edge reason `growth:counter_aha`.
   Expected: relation resolves to `growth:counter_aha`.
   Verify: relation filter can isolate counter-aha responses.

4. **A07-04 Infer growth relation from node meta**
   Setup: growth assistant node has `meta.growth.operator = "reframe"` but edge reason is missing.
   Expected: retrieval infers `growth:reframe` when parent membership is valid.
   Verify: confidence is `derived`.

5. **A07-05 Query by growth operator**
   Query: `"expand"`
   Expected: nodes with `growth.operator = "expand"` match via `growthOperator`.
   Verify: match scoring includes the growth operator field.

6. **A07-06 Query by artwork ID**
   Query: `"artwork_night_crossing"`
   Expected: night crossing response nodes match via `growthArtworkId`.
   Verify: users can retrieve agent provenance.

7. **A07-07 Growth relations excluded by default**
   Setup: query with default relations only.
   Expected: dialectic relations appear, growth edges require explicit relation options.
   Verify: legacy retrieval behavior remains stable.

8. **A07-08 Growth relation option includes subgraph**
   Setup: query with `relations = ["growth:expand", "growth:merge_promote"]`.
   Expected: matching growth response and synthesis edges are included.
   Verify: relation filtering is respected.

9. **A07-09 Dangling growth edge warning**
   Setup: edge points to missing growth node.
   Expected: warning and omitted edge count increase.
   Verify: retrieval does not crash on corrupted imported graphs.

10. **A07-10 Synthesis source artworks inspectable**
    Setup: retrieve a merge-promote synthesis node.
    Expected: synthesis retrieval node exposes `sourceArtworkIds`.
    Verify: merge-promote provenance remains inspectable even though source IDs are not search fields.

## Agent 08: Dialogue UI Integrator

Focus: `/dialogue` entry behavior, composer target semantics, stale protection, and persistence surfaces.

1. **A08-01 Growth submit from root composer**
   Action: type `"也许下一步要把这个方向拆小一点？"` and submit growth mode.
   Expected: one user event node, three artwork response nodes, one synthesis node.
   Verify: canonical `生成正 / 反` flow is untouched.

2. **A08-02 Growth submit under selected assistant**
   Action: select a `正` assistant, type `"继续拆小"`, submit growth mode.
   Expected: user event is created under the selected assistant.
   Verify: parent edge is `continue`, response edges are growth relations.

3. **A08-03 Dialectic submit still creates 正/反**
   Action: use the normal branch submit, not growth mode.
   Expected: exactly a thesis and antithesis pair.
   Verify: no growth metadata appears on canonical branch nodes.

4. **A08-04 Growth response labels visible**
   Action: run growth session.
   Expected: response labels display artwork titles such as `夜航灯` and `静物桌`.
   Verify: UI does not show raw IDs unless title lookup fails.

5. **A08-05 Empty growth composer blocked**
   Action: submit blank or whitespace composer text.
   Expected: user-visible validation or no-op, no graph mutation.
   Verify: same empty-input contract as core builder.

6. **A08-06 Stale growth request ignored**
   Action: start growth request A, change target, then finish request A after request B.
   Expected: stale A does not patch the new target.
   Verify: growth path follows existing pending/stale protection patterns.

7. **A08-07 Error keeps composer recoverable**
   Action: force invalid injected profile in local growth path.
   Expected: error appears without clearing valid user input unexpectedly.
   Verify: store remains unchanged after failed session.

8. **A08-08 Growth synthesis inspectable**
   Action: click/open synthesis node.
   Expected: source response node IDs and source artwork IDs are available in metadata.
   Verify: UI can show where the synthesis came from.

9. **A08-09 Export/import preserves growth graph**
   Action: create growth session, export workspace, import it.
   Expected: growth meta, labels, and edge reasons survive.
   Verify: imported workspace renders and retrieves growth nodes.

10. **A08-10 Mobile layout does not hide growth actions**
    Action: narrow viewport/manual smoke without Playwright unless explicitly requested.
    Expected: growth entry point remains reachable and text does not overlap.
    Verify: no reliance on desktop-only hover actions.

## Agent 09: Robustness And Privacy Guard

Focus: privacy boundary, malformed data, cross-session safety, and unsafe inference prevention.

1. **A09-01 No trait permanence from affect**
   Input: `"我今天很焦虑"`
   Expected: mood may include `uneasy`, but no permanent personality label is written.
   Verify: `memoryRefs` stays empty unless explicitly supplied.

2. **A09-02 No diagnosis inference**
   Input: `"我最近总是害怕失败"`
   Expected: response may resonate with current event only.
   Verify: no diagnosis, condition, or protected-trait metadata is created.

3. **A09-03 Explicit memory needs provenance**
   Setup: add memory ref only with `source`, `scope`, `confidence`, and `decay` or expiry.
   Expected: valid ref is accepted; incomplete provenance is rejected.
   Verify: memory boundary is auditable.

4. **A09-04 Workspace memory does not leak across projects**
   Setup: event in workspace A references workspace-scoped memory.
   Expected: exported graph contains only explicit IDs and local metadata.
   Verify: no unrelated private files or cross-project history are read.

5. **A09-05 Malformed model-shaped response rejected**
   Setup: fake model output missing `stance` or `summary`.
   Expected: parser rejects before graph projection.
   Verify: no malformed assistant node is created.

6. **A09-06 Capability mismatch rejected**
   Setup: route `artwork_mist_mountain` to `counter_aha`.
   Expected: `artwork_operator_not_supported`.
   Verify: orchestration never bypasses profile constraints.

7. **A09-07 Oversized text remains deterministic**
   Input: a long multi-paragraph user event.
   Expected: event builds without random truncation; intensity may rise from length.
   Verify: later retrieval applies its own query clamps separately.

8. **A09-08 Punctuation uncertainty bounded**
   Input: `"？？？？可能吗？？？？"`
   Expected: uncertainty increases but remains `<= 1`.
   Verify: repeated punctuation cannot overflow confidence math.

9. **A09-09 Unknown edge reason warning**
   Setup: imported graph edge reason `growth:unknown_operator`.
   Expected: retrieval warns or skips rather than treating it as valid growth.
   Verify: reserved growth namespace remains closed.

10. **A09-10 Concurrent request IDs isolate sessions**
    Setup: run two sessions with `req_a` and `req_b`.
    Expected: event IDs and projected metadata remain distinct.
    Verify: stale UI or retrieval cannot merge two events by text alone.

## Agent 10: End-To-End Evaluator

Focus: complete flows across event -> routing -> orchestration -> graph -> retrieval/UI assertions.

1. **A10-01 Ambiguity expansion flow**
   Input: `"也许这一步不确定，可能需要换个角度？"`
   Expected: `expand` need, routed artwork responses, growth graph nodes.
   Verify: retrieval can find `growth:expand` edges when requested.

2. **A10-02 Overconfidence counter aha flow**
   Input: `"这个方案一定是唯一答案，必须马上定下来"`
   Expected: `single_frame`, `counter_aha`, opposing stance.
   Verify: graph has at least one `growth:counter_aha` edge.

3. **A10-03 Compare reframe flow**
   Input: `"继续做还是暂停复盘？"`
   Expected: `compare`, `choice_pressure`, `reframe`.
   Verify: response text reframes decision as a scene or frame.

4. **A10-04 Create expansion flow**
   Input: `"帮我设计一个新的分支，让它更有生长感"`
   Expected: `create`, `generative`, `expand`.
   Verify: no canonical branch type is added to growth responses.

5. **A10-05 Confess resonance flow**
   Input: `"我承认我担心这个方向会失败"`
   Expected: `confess`, `uneasy`, preferred `resonate`.
   Verify: output says it resonates with the current event, not the user's permanent identity.

6. **A10-06 Existing dialogue branch flow**
   Setup: root user has `正` and `反`; submit growth under `正`.
   Expected: growth child appears under `正`; canonical sibling order is stable.
   Verify: synthesis from 正/反 remains possible later.

7. **A10-07 Multi-session workspace flow**
   Setup: run growth session one on ambiguity, session two on execution.
   Expected: two distinct user event IDs and separate response groups.
   Verify: retrieval by each event ID scopes the right nodes.

8. **A10-08 Persistence roundtrip flow**
   Setup: project growth session, export bundle, import bundle, query graph.
   Expected: growth meta, edges, labels, and source IDs survive.
   Verify: no bundle validator rejects the additive `meta.growth` field.

9. **A10-09 Retrieval provenance flow**
   Setup: query by `"artwork_cracked_garden"` after a repair/growth session.
   Expected: cracked garden response and merge synthesis are discoverable.
   Verify: match fields include `growthArtworkId` where appropriate.

10. **A10-10 Local-first no-model flow**
    Setup: run `runGrowthSession` in an environment with no API key.
    Expected: deterministic session still completes.
    Verify: first-slice A2A growth tests do not require `/api/growth` or provider calls.
