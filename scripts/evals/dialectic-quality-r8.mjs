import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { evidence as r7Evidence, loadExam as loadR7, readingBody } from "./dialectic-quality-r7.mjs";

export const evidence = fileURLToPath(new URL("../../docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r8/", import.meta.url));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const transport = {
  timeoutMs: 180_000, maxAttempts: 2, retryDelayMs: 2_000, retryStatuses: [408, 429, 500, 502, 503, 504],
  retryOn: ["network error", "interrupted runner", "listed HTTP statuses except invalid_model_output"]
};
const concurrency = 4;
const route = "synthesis";

export async function loadExam(kind = "original") {
  assert.ok(["original", "confirmation"].includes(kind), "Unknown exam");
  const confirmation = kind === "confirmation";
  const directory = confirmation ? join(evidence, "confirmation") : evidence;
  const referenceName = confirmation ? "reference.json" : "holdout-reference.json";
  const manifest = await readFile(join(directory, "frozen.sha256"));
  const hashes = Object.fromEntries(manifest.toString().trim().split("\n").map((line) => line.split("  ").reverse()));
  const [bytes, reference] = await Promise.all([
    readFile(join(directory, "requests.json")), readFile(join(directory, referenceName))
  ]);
  assert.equal(sha256(bytes), hashes["requests.json"]);
  assert.equal(sha256(reference), hashes[referenceName]);
  const { cases, previousRequestsSha256 } = JSON.parse(bytes);
  if (!confirmation) {
    const r7 = await loadR7();
    assert.equal(previousRequestsSha256, r7.examSha256);
    for (const [index, old] of r7.cases.entries()) {
      const item = cases[index];
      assert.deepEqual([item.id, item.set, item.group, item.question], [old.id, old.set, old.group, old.question]);
      assert.equal(JSON.stringify(item.requests.synthesis), JSON.stringify(old.requests.synthesis), item.id);
    }
  }
  assert.equal(cases.length, confirmation ? 8 : 25);
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length);
  const holdout = cases.slice(-8);
  assert.deepEqual(holdout.map(({ id }) => id), JSON.parse(reference).cases.map(({ id }) => id));
  for (const { id, set, question, requests: { synthesis } } of holdout) {
    assert.equal(set, confirmation ? "confirmation" : "holdout");
    assert.equal(synthesis.meaningVersion, 1);
    assert.equal(synthesis.sources.length, 2);
    assert.notEqual(synthesis.sources[0].id, synthesis.sources[1].id);
    assert.equal(synthesis.rootInput, synthesis.sources.map(({ text }) => text).join("\n\n"));
    assert.ok(synthesis.contextMessages.some(({ role, content }) => role === "user" && content.endsWith(question)), id);
  }
  return { cases, examSha256: hashes["requests.json"], manifestSha256: sha256(manifest) };
}

async function writeJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, file);
}

async function readOptional(file) {
  try { return await readJson(file); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function post(base, body) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let status = null;
  let rawBody = null;
  let error = null;
  let reading = null;
  let retryable = false;
  try {
    const response = await fetch(new URL("api/synthesis", base), {
      method: "POST",
      headers: { "content-type": "application/json", "x-anicca-eval-id": body.requestId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(transport.timeoutMs)
    });
    status = response.status;
    rawBody = await response.text();
    let json;
    try { json = JSON.parse(rawBody); }
    catch { error = "response_not_json"; }
    if (!response.ok) {
      error = json?.error || error || `HTTP ${status}`;
      retryable = transport.retryStatuses.includes(status) && json?.error !== "invalid_model_output";
    } else {
      reading = json?.requestId === body.requestId ? readingBody(route, json) : null;
      if (!reading) error = "response_contract_mismatch";
    }
  } catch (cause) {
    error = `${cause.name}: ${cause.message}`;
    retryable = true;
  }
  return { startedAt, elapsedMs: Math.round(performance.now() - start), status, rawBody, reading, error, retryable };
}

export function checkRecord(record, item, run) {
  assert.equal(record.id, item.id);
  assert.equal(record.route, route);
  assert.ok(record.attempts.length > 0 && record.attempts.length <= transport.maxAttempts);
  for (const [index, attempt] of record.attempts.entries()) {
    const { requestId, ...body } = attempt.body;
    assert.equal(requestId, `r8-${run}-${item.id}-${index + 1}`);
    assert.equal(JSON.stringify(body), JSON.stringify(item.requests.synthesis), item.id);
    if (index > 0) assert.equal(record.attempts[index - 1].retryable, true);
    if (attempt.reading) {
      assert.equal(attempt.status, 200);
      assert.ok(!attempt.pending);
      const json = JSON.parse(attempt.rawBody);
      assert.equal(json.requestId, requestId);
      assert.deepEqual(readingBody(route, json), attempt.reading);
    }
  }
}

async function runSlot({ item, output, run, base }) {
  const file = join(output, "responses", `${item.id}-synthesis.json`);
  const prior = await readOptional(file);
  if (prior) checkRecord(prior, item, run);
  const record = prior ?? { id: item.id, route, attempts: [] };
  const last = record.attempts.at(-1);
  if (last?.pending) {
    Object.assign(last, { pending: false, status: null, reading: null, rawBody: null,
      error: "runner_interrupted_no_response_recorded", retryable: true });
    await writeJson(file, record);
  }
  while (record.attempts.length < transport.maxAttempts) {
    const previous = record.attempts.at(-1);
    if (previous && !previous.retryable) break;
    if (previous) await setTimeout(transport.retryDelayMs);
    const requestId = `r8-${run}-${item.id}-${record.attempts.length + 1}`;
    const body = { ...item.requests.synthesis, requestId };
    record.attempts.push({ body, pending: true, startedAt: new Date().toISOString() });
    await writeJson(file, record);
    const result = await post(base, body);
    record.attempts[record.attempts.length - 1] = { body, ...result };
    await writeJson(file, record);
  }
  return record;
}

async function collectTraces(file, records) {
  const requestIds = new Set(records.flatMap(({ attempts }) => attempts.map(({ body }) => body.requestId)));
  const prefix = "anicca.generation ";
  const traces = [];
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const start = line.indexOf(prefix);
    if (start < 0 || !line.includes('"evalRequestId":"r8-')) continue;
    const trace = JSON.parse(line.slice(start + prefix.length));
    if (requestIds.has(trace.evalRequestId)) traces.push(trace);
  }
  return traces;
}

export function metrics(records, traceById) {
  const attempts = records.flatMap((record) => record.attempts);
  const final = records.map((record) => record.attempts.at(-1));
  const traces = attempts.map(({ body }) => traceById.get(body.requestId)).filter(Boolean);
  const calls = traces.flatMap((trace) => trace.calls);
  const latencies = final.map((last) => last.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
  const tokenTotals = (key) => {
    const reported = calls.map((call) => call.usage?.[key]).filter(Number.isFinite);
    return { tokens: reported.reduce((sum, value) => sum + value, 0), reported: reported.length, calls: calls.length };
  };
  const count = (items) => Object.fromEntries([...new Set(items)].map((key) => [key, items.filter((item) => item === key).length]));
  return {
    cases: records.length,
    readable: final.filter((last) => last.reading).length,
    deferred: final.filter((last) => last.reading?.outcome === "deferred").length,
    failed: final.filter((last) => !last.reading).length,
    retried: records.filter(({ attempts }) => attempts.length > 1).length,
    attempts: attempts.length,
    traced: traces.length,
    p50FinalAttemptMs: latencies[Math.ceil(latencies.length * .5) - 1] ?? null,
    p95FinalAttemptMs: latencies[Math.ceil(latencies.length * .95) - 1] ?? null,
    modelCalls: traces.reduce((sum, trace) => sum + trace.modelCalls, 0),
    providerCalls: traces.reduce((sum, trace) => sum + trace.providerCalls, 0),
    repairCalls: traces.reduce((sum, trace) => sum + trace.repairCalls, 0),
    stages: count(calls.map(({ stage }) => stage)),
    repairKinds: count(calls.filter(({ repair }) => repair).map(({ repairKind }) => repairKind ?? "unclassified")),
    traceOutcomes: count(traces.map(({ outcome }) => outcome)),
    inputTokens: tokenTotals("inputTokens"),
    cachedInputTokens: tokenTotals("cachedInputTokens"),
    outputTokens: tokenTotals("outputTokens")
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    base: { type: "string" }, output: { type: "string" }, run: { type: "string" },
    revision: { type: "string" }, "server-log": { type: "string" },
    exam: { type: "string", default: "original" }, group: { type: "string", default: "all" }
  } });
  const { base: rawBase, output: rawOutput, run, revision, "server-log": serverLog, group, exam } = values;
  assert.ok(rawBase && rawOutput && ["before", "after"].includes(run) && /^[a-f0-9]{7,40}$/u.test(revision ?? "") && serverLog,
    "Use --base URL --output DIR --run before|after --revision GIT_SHA --server-log FILE [--exam original|confirmation] [--group all|r7|holdout]");
  assert.ok(["all", "r7", "holdout"].includes(group));
  assert.ok(exam !== "confirmation" || group === "all", "Run the full confirmation exam");
  const base = new URL(rawBase.endsWith("/") ? rawBase : `${rawBase}/`);
  assert.ok(/^https?:$/.test(base.protocol) && !base.username && !base.password && !base.search && !base.hash,
    "Use an HTTP(S) base URL without credentials, query or fragment");
  const output = resolve(rawOutput);
  const settings = await readJson(join(r7Evidence, "provider.json"));
  const { cases, examSha256, manifestSha256 } = await loadExam(exam);
  const config = { schemaVersion: 1, run, revision, examSha256, manifestSha256, base: base.href, route, settings, concurrency, transport,
    ...(exam === "confirmation" ? { exam } : {}) };
  await mkdir(join(output, "responses"), { recursive: true });
  const configFile = join(output, "settings.json");
  const existing = await readOptional(configFile);
  if (existing) assert.deepEqual(existing, config, "Resume settings differ from recorded settings");
  else await writeJson(configFile, config);

  const selected = cases.filter((item) => group === "all" || (group === "holdout") === (item.set === "holdout"));
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < selected.length) {
      const item = selected[cursor++];
      const record = await runSlot({ item, output, run, base });
      const final = record.attempts.at(-1);
      console.log(`${item.set} ${item.id}: ${final.reading?.outcome || final.error} (${record.attempts.length} attempt(s))`);
    }
  }));

  const completed = (await Promise.all(cases.map(async (item) => {
    const record = await readOptional(join(output, "responses", `${item.id}-synthesis.json`));
    if (!record) return null;
    checkRecord(record, item, run);
    if (record.attempts.at(-1).pending) return null;
    return { item, record };
  }))).filter(Boolean);
  const records = completed.map(({ record }) => record);
  const traces = await collectTraces(serverLog, records);
  const traceById = new Map(traces.map((trace) => [trace.evalRequestId, trace]));
  const attempts = records.flatMap((record) => record.attempts);
  const missingRequestIds = attempts.filter(({ body }) => !traceById.has(body.requestId)).map(({ body }) => body.requestId);
  const mismatches = traces.filter((trace) => trace.model !== settings.model || trace.endpoint !== route)
    .map(({ evalRequestId, model, endpoint }) => ({ evalRequestId, model, endpoint }));
  await writeJson(join(output, "traces.json"), { traces, missingRequestIds, mismatches });
  const bySet = Object.fromEntries([...new Set(cases.map(({ set }) => set))].map((set) => [
    set, metrics(completed.filter(({ item }) => item.set === set).map(({ record }) => record), traceById)
  ]));
  const summary = { all: metrics(records, traceById), bySet };
  await writeJson(join(output, "summary.json"), summary);
  assert.equal(traceById.size, traces.length, "Duplicate trace request ID");
  assert.equal(mismatches.length, 0, "Trace model or route differs from settings");
  assert.ok(attempts.every(({ body, reading }) => !reading || traceById.has(body.requestId)), "A readable response lacks a trace");
  if (summary.all.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
