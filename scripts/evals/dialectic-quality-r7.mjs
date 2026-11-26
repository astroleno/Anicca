import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

export const evidence = fileURLToPath(new URL("../../docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r7/", import.meta.url));
const routes = ["branches", "synthesis"];
const retryStatuses = [408, 429, 500, 502, 503, 504];
const maxAttempts = 2;
const timeoutMs = 180_000;
const retryDelayMs = 2_000;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

export async function loadExam() {
  const files = await readFile(join(evidence, "frozen.sha256"), "utf8");
  const pairs = files.trim().split("\n").map((line) => line.split("  "));
  const contents = {};
  for (const [hash, name] of pairs) {
    const bytes = await readFile(join(evidence, name));
    if (sha256(bytes) !== hash) throw new Error(`Frozen input changed: ${name}`);
    contents[name] = JSON.parse(bytes);
  }
  const exam = contents["requests.json"];
  const formal = contents["formal-source.json"];
  if (exam.formalSource.sha256 !== pairs.find(([, name]) => name === "formal-source.json")?.[0] ||
      JSON.stringify(exam.cases.filter((item) => item.set === "formal").map(({ index, group, question: input }) => ({ index, group, input }))) !== JSON.stringify(formal) ||
      exam.cases.length !== 17 || new Set(exam.cases.map((item) => item.id)).size !== 17) {
    throw new Error("Frozen case count, identity or formal corpus mismatch");
  }
  for (const { id, question, requests: { branches, synthesis } } of exam.cases) {
    if (branches.userText !== question || branches.meaningVersion !== 1 || synthesis.meaningVersion !== 1 ||
        synthesis.sources.length !== 2 || synthesis.sources[0].id === synthesis.sources[1].id ||
        synthesis.rootInput !== synthesis.sources.map((source) => source.text).join("\n\n") ||
        !synthesis.contextMessages.some(({ role, content }) => role === "user" && content.endsWith(question))) {
      throw new Error(`Frozen client contract mismatch: ${id}`);
    }
  }
  return { cases: exam.cases, examSha256: pairs.find(([, name]) => name === "requests.json")[0] };
}

const hasText = (text) => typeof text === "string" && Boolean(text.trim());

export function readingBody(route, json) {
  if (route === "branches") {
    const { thesis, antithesis } = json ?? {};
    if (thesis?.stance === "正" && antithesis?.stance === "反" && hasText(thesis.text) && hasText(antithesis.text)) {
      return { outcome: "branches", thesis: thesis.text, antithesis: antithesis.text };
    }
  } else if (json?.outcome === "deferred") {
    if (hasText(json.deferred?.reason) && hasText(json.deferred?.question)) {
      return { outcome: "deferred", reason: json.deferred.reason, question: json.deferred.question };
    }
  } else if (json?.synthesis?.stance === "合" && hasText(json.synthesis.text)) {
    return { outcome: "synthesis", text: json.synthesis.text };
  }
  return null;
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

async function post(base, route, body) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  let status = null;
  let rawBody = null;
  let error = null;
  let reading = null;
  let retryable = false;
  try {
    const response = await fetch(new URL(`api/${route}`, base), {
      method: "POST",
      headers: { "content-type": "application/json", "x-anicca-eval-id": body.requestId },
      body: JSON.stringify(body),
      signal
    });
    status = response.status;
    rawBody = await response.text();
    let json;
    try { json = JSON.parse(rawBody); }
    catch { error = "response_not_json"; }
    if (!response.ok) {
      error = json?.error || error || `HTTP ${status}`;
      retryable = retryStatuses.includes(status) && json?.error !== "invalid_model_output";
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

async function runSlot({ item, route, output, run, base }) {
  const file = join(output, "responses", `${item.id}-${route}.json`);
  const record = await readOptional(file) || { id: item.id, route, attempts: [] };
  const last = record.attempts.at(-1);
  if (last?.pending) {
    record.attempts[record.attempts.length - 1] = {
      ...last, pending: false, status: null, reading: null, rawBody: null,
      error: "runner_interrupted_no_response_recorded", retryable: true
    };
    await writeJson(file, record);
  }
  while (record.attempts.length < maxAttempts) {
    const previous = record.attempts.at(-1);
    if (previous && !previous.retryable) break;
    if (previous) await new Promise((done) => setTimeout(done, retryDelayMs));
    const requestId = `quality-r7-${run}-${item.id}-${route}-${record.attempts.length + 1}`;
    const body = { ...item.requests[route], requestId };
    record.attempts.push({ body, pending: true, startedAt: new Date().toISOString() });
    await writeJson(file, record);
    const result = await post(base, route, body);
    record.attempts[record.attempts.length - 1] = { body, ...result };
    await writeJson(file, record);
  }
  return record;
}

function summarize(records) {
  return Object.fromEntries(routes.map((route) => {
    const attempts = records.filter((record) => record.route === route).map((record) => record.attempts);
    const final = attempts.map((list) => list.at(-1));
    const latencies = final.map((last) => last.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
    return [route, {
      cases: final.length, readable: final.filter((last) => last.reading).length,
      deferred: final.filter((last) => last.reading?.outcome === "deferred").length,
      failed: final.filter((last) => !last.reading).length,
      retried: attempts.filter((list) => list.length > 1).length,
      p50FinalAttemptMs: latencies[Math.ceil(latencies.length * .5) - 1] ?? null,
      p95FinalAttemptMs: latencies[Math.ceil(latencies.length * .95) - 1] ?? null
    }];
  }));
}

async function archiveTraces(file, output, records, model) {
  const requestIds = new Set(records.flatMap(({ attempts }) => attempts.map(({ body }) => body.requestId)));
  const prefix = "anicca.generation ";
  const traces = [];
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const start = line.indexOf(prefix);
    if (start < 0) continue;
    const trace = JSON.parse(line.slice(start + prefix.length));
    if (requestIds.has(trace.evalRequestId)) traces.push(trace);
  }
  const seenIds = new Set(traces.map(({ evalRequestId }) => evalRequestId));
  const modelMismatches = traces.filter((trace) => trace.model !== model)
    .map(({ evalRequestId, model: actualModel }) => ({ evalRequestId, actualModel }));
  const missingRequestIds = [...requestIds].filter((id) => !seenIds.has(id));
  await writeJson(join(output, "traces.json"), { traces, missingRequestIds, modelMismatches });
  const readable = records.flatMap(({ attempts }) => attempts.filter(({ reading }) => reading));
  if (modelMismatches.length || readable.some(({ body }) => !seenIds.has(body.requestId))) {
    throw new Error("Trace model does not match settings or is missing for a readable response");
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    base: { type: "string" }, output: { type: "string" }, run: { type: "string" },
    revision: { type: "string" }, settings: { type: "string" },
    concurrency: { type: "string", default: "3" }, "server-log": { type: "string" }
  } });
  const { base: rawBase, output: rawOutput, run, revision, settings: settingsFile } = values;
  const concurrency = Number(values.concurrency);
  if (!rawBase || !rawOutput || !/^[a-z][a-z0-9-]{0,30}$/u.test(run ?? "") ||
      !/^[a-f0-9]{7,40}$/u.test(revision ?? "") || !settingsFile ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("Use --base URL --output DIR --run LABEL --revision GIT_SHA --settings JSON [--concurrency 3] [--server-log FILE]");
  }
  const base = new URL(rawBase.endsWith("/") ? rawBase : `${rawBase}/`);
  if (base.username || base.password || base.search || base.hash) throw new Error("Base URL must be public configuration");
  const output = resolve(rawOutput);
  const settings = await readJson(settingsFile);
  if (!settings.model || !settings.provider) throw new Error("Record model and provider in settings JSON");
  const { cases, examSha256 } = await loadExam();
  const config = { schemaVersion: 1, run, revision, examSha256, base: base.href, settings, concurrency,
    transport: { timeoutMs, maxAttempts, retryDelayMs, retryStatuses, retryOn: ["network error", "interrupted runner", "listed HTTP statuses except invalid_model_output"] }
  };
  await mkdir(join(output, "responses"), { recursive: true });
  const configFile = join(output, "settings.json");
  const existing = await readOptional(configFile);
  if (existing && JSON.stringify(existing) !== JSON.stringify(config)) throw new Error("Resume settings differ from recorded settings");
  if (!existing) await writeJson(configFile, config);

  const slots = cases.flatMap((item) => routes.map((route) => ({ item, route })));
  const records = new Array(slots.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < slots.length) {
      const index = cursor++;
      const { item, route } = slots[index];
      const record = await runSlot({ item, route, output, run, base });
      records[index] = record;
      const final = record.attempts.at(-1);
      console.log(`${item.id} ${route}: ${final.reading?.outcome || final.error} (${record.attempts.length} attempt(s))`);
    }
  }));
  const summary = summarize(records);
  await writeJson(join(output, "summary.json"), summary);
  if (values["server-log"]) await archiveTraces(values["server-log"], output, records, settings.model);
  if (Object.values(summary).some(({ failed }) => failed > 0)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
