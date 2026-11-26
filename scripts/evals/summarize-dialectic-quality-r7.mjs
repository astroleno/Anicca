import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, isDeepStrictEqual } from "node:util";
import assert from "node:assert/strict";

const routes = ["branches", "synthesis"];
const sides = ["A", "B"];
const names = ["改前", "改后"];
const routeNames = { branches: "正反", synthesis: "合" };
const gateCards = {
  "formal-05": "authoritative-decision", "formal-11": "verified-recovery",
  "transfer-01": "verified-recovery", "transfer-02": "authoritative-decision"
};
const sha = (contents) => createHash("sha256").update(contents).digest("hex");
const read = (file) => readFile(file, "utf8");
const json = async (file) => JSON.parse(await read(file));
const mapById = (items) => new Map(items.map((item) => [item.id, item]));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const fmt = (value) => value == null ? "—" : value.toLocaleString("en-US");
const md = (value) => typeof value === "string" ? value.replaceAll("|", "\\|").replace(/\s+/gu, " ") : String(value ?? "—");

async function loadRun(dir, version, cases) {
  const [settings, traceArchive] = await Promise.all([
    json(join(dir, "settings.json")), json(join(dir, "traces.json"))
  ]);
  assert.deepEqual({ run: settings.run, revision: settings.revision }, version);
  assert.equal(traceArchive.modelMismatches?.length ?? 0, 0);
  const traces = new Map(traceArchive.traces.map((trace) => [trace.evalRequestId, trace]));
  assert.equal(traces.size, traceArchive.traces.length, "Trace IDs must be unique");
  const records = new Map();
  for (const item of cases) {
    for (const route of routes) {
      const record = await json(join(dir, "responses", `${item.id}-${route}.json`));
      assert.equal(record.id, item.id);
      assert.equal(record.route, route);
      assert.ok(record.attempts.length > 0);
      for (const attempt of record.attempts) {
        assert.ok(!attempt.pending);
        const { requestId, ...body } = attempt.body;
        assert.deepEqual(body, item.requests[route]);
        attempt.trace = traces.get(requestId) ?? null;
        if (attempt.reading) {
          assert.equal(attempt.status, 200);
          assert.equal(attempt.trace?.model, settings.settings.model);
          assert.equal(JSON.parse(attempt.rawBody).requestId, requestId);
        }
      }
      records.set(`${item.id}/${route}`, record);
    }
  }
  return { settings, records };
}

function tokenTotals(calls, key) {
  const reported = calls.map((call) => call.usage?.[key]).filter(Number.isFinite);
  return { tokens: sum(reported), reported: reported.length, calls: calls.length };
}

function metrics(run, route, cases) {
  const records = cases.map(({ id }) => run.records.get(`${id}/${route}`));
  const attempts = records.flatMap((record) => record.attempts);
  const finals = records.map((record) => record.attempts.at(-1));
  const latencies = finals.map((attempt) => attempt.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
  const traces = attempts.map((attempt) => attempt.trace).filter(Boolean);
  const calls = traces.flatMap((trace) => trace.calls);
  return {
    cases: records.length,
    readable: finals.filter((attempt) => attempt.reading).length,
    deferred: finals.filter((attempt) => attempt.reading?.outcome === "deferred").length,
    attempts: attempts.length,
    traced: traces.length,
    p50Ms: latencies[Math.ceil(latencies.length * .5) - 1] ?? null,
    p95Ms: latencies[Math.ceil(latencies.length * .95) - 1] ?? null,
    modelCalls: calls.length,
    repairCalls: sum(traces.map((trace) => trace.repairCalls)),
    providerCalls: sum(traces.map((trace) => trace.providerCalls)),
    inputTokens: tokenTotals(calls, "inputTokens"),
    cachedInputTokens: tokenTotals(calls, "cachedInputTokens"),
    outputTokens: tokenTotals(calls, "outputTokens")
  };
}

function gate(run, id) {
  const attempts = run.records.get(`${id}/synthesis`).attempts;
  const attempt = attempts.at(-1);
  const { trace } = attempt;
  return {
    id, requestId: attempt.body.requestId, outcome: attempt.reading?.outcome ?? "unavailable",
    elapsedMs: attempt.elapsedMs ?? null,
    candidateIds: trace?.policyCards?.candidateIds ?? null,
    applicableIds: trace?.policyCards?.applicableIds ?? null,
    auditCalls: trace?.calls.filter(({ stage }) => stage === "audit").length ?? null,
    finalRewrite: trace ? trace.calls.some(({ stage }) => stage === "final") : null
  };
}

function generateTable(result) {
  const lines = [
    "# 第七轮正文评测技术附表",
    "",
    `修订为改前 \`${result.versions[0].revision}\`、改后 \`${result.versions[1].revision}\`。逐题理由和原始 A/B 判读见[封存判断](judgments.json)，缺测与分类明细见[揭盲结果](revealed.json)。`,
    "",
    "## 匿名比较揭盲",
    "",
    "胜、平、负以改后为参照。无法比较计入原分母。",
    "",
    "| 题组 | 路由 | 胜 | 平 | 负 | 无法比较 |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...result.tallies.map(({ set, route, counts }) =>
      `| ${set === "formal" ? "正式 12 题" : "迁移 5 题"} | ${routeNames[route]} | ${counts.W} | ${counts.D} | ${counts.L} | ${counts.NC} |`),
    "",
    "### 缺测",
    "",
    "| 题号 | 路由 | 版本 | 状态 | 原因 |",
    "| --- | --- | --- | ---: | --- |",
    ...(result.missing.length ? result.missing.map(({ id, route, version, status, error }) =>
      `| ${id} | ${routeNames[route]} | ${names[version]} | ${fmt(status)} | ${md(error)} |`) : ["| 无 | — | — | — | — |"]),
    "",
    "## 策略卡语义门控",
    "",
    "改前检索复核记录在[复跑说明](README.md)。改后候选与适用卡取自当次真实跟踪，final 阶段用于识别高风险审计后的最终重写。audit 调用还包括正文审阅。",
    "",
    "| 题号 | 语境 | 改后候选 | 改后适用 | final 阶段 改前 → 改后 | 客户端耗时 ms 改前 → 改后 |",
    "| --- | --- | --- | --- | --- | ---: |",
    ...result.gates.map(({ id, baseline, candidate }) => {
      const displayCards = (ids) => ids ? ids.join("、") || "无" : "缺记录";
      const flag = (value) => value == null ? "缺记录" : value ? "有" : "无";
      return `| ${id} | ${id.startsWith("formal") ? "工程" : "比喻"} | ${displayCards(candidate.candidateIds)} | ${displayCards(candidate.applicableIds)} | ${flag(baseline.finalRewrite)} → ${flag(candidate.finalRewrite)} | ${fmt(baseline.elapsedMs)} → ${fmt(candidate.elapsedMs)} |`;
    }),
    "",
    "## 可读率、时延与用量",
    "",
    "合路由的可读结果包含有理由和追问的暂不融合。耗时是逐题最后一次 HTTP 尝试，含失败并采用最近秩分位数。调用数与 token 累加所有有跟踪的尝试，含失败与修复。输入 token 含已缓存部分。用量按供应商回报统计。",
    "",
    "| 版本 | 路由 | 可读 | 暂不融合 | p50 / p95 ms | 跟踪 / 尝试 | 模型 / 供应商调用 | 修复调用 | 输入 / 缓存输入 / 输出 token |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...result.metrics.map(({ version, route, value }) => {
      const token = (field) => `${fmt(field.tokens)}${field.reported === field.calls ? "" : `（${field.reported}/${field.calls} 次有数据）`}`;
      return `| ${names[version]} | ${routeNames[route]} | ${value.readable}/${value.cases}（${(100 * value.readable / value.cases).toFixed(1)}%） | ${value.deferred} | ${fmt(value.p50Ms)} / ${fmt(value.p95Ms)} | ${value.traced} / ${value.attempts} | ${value.modelCalls} / ${value.providerCalls} | ${value.repairCalls} | ${token(value.inputTokens)} / ${token(value.cachedInputTokens)} / ${token(value.outputTokens)} |`;
    }),
    "",
    "| 路由 | 改后减改前模型调用 | 改后减改前供应商调用 | 输入 / 输出 token 差 | p50 / p95 ms 差 |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...routes.map((route) => {
      const [before, after] = result.metrics.filter((row) => row.route === route).map(({ value }) => value);
      const delta = (a, b) => a == null || b == null ? "—" : `${b >= a ? "+" : ""}${fmt(b - a)}`;
      return `| ${routeNames[route]} | ${delta(before.modelCalls, after.modelCalls)} | ${delta(before.providerCalls, after.providerCalls)} | ${delta(before.inputTokens.tokens, after.inputTokens.tokens)} / ${delta(before.outputTokens.tokens, after.outputTokens.tokens)} | ${delta(before.p50Ms, after.p50Ms)} / ${delta(before.p95Ms, after.p95Ms)} |`;
    }),
    ""
  ];
  return lines.join("\n") + "\n";
}

async function main(values) {
  const { judgments: judgmentFile, "judge-sha": judgeSha, packet: packetFile, key: keyFile, evidence, out } = values;
  assert.ok(judgmentFile && judgeSha && packetFile && keyFile && evidence && out,
    "Use --judgments FILE --judge-sha SHA256 --packet FILE --key FILE --evidence DIR --out DIR");
  const rawJudgments = await read(judgmentFile);
  assert.equal(sha(rawJudgments), judgeSha, "Judgments must match sealed SHA-256");
  const judgments = JSON.parse(rawJudgments);
  const [packetRaw, key, examRaw] = await Promise.all([read(packetFile), json(keyFile), read(join(evidence, "requests.json"))]);
  assert.equal(sha(packetRaw), key.packetSha256, "Wrong packet/key pairing");
  const packet = JSON.parse(packetRaw);
  const { cases } = JSON.parse(examRaw);
  assert.equal(key.versions.length, 2);
  assert.deepEqual(key.versions.map(({ run }) => run), ["baseline", "candidate"]);
  assert.equal(cases.length, 17);
  for (const entries of [packet, judgments]) {
    assert.equal(entries.length, cases.length);
    assert.deepEqual([...mapById(entries).keys()].sort(), cases.map(({ id }) => id).sort());
  }
  const [packetById, judgmentsById] = [mapById(packet), mapById(judgments)];
  const runs = await Promise.all(key.versions.map((version) => loadRun(join(evidence, version.run), version, cases)));
  for (const run of runs) assert.equal(run.settings.examSha256, sha(examRaw));
  assert.ok(isDeepStrictEqual(runs[0].settings.settings, runs[1].settings.settings));
  assert.ok(isDeepStrictEqual(runs[0].settings.transport, runs[1].settings.transport));

  const missing = [];
  const rows = [];
  for (const item of cases) {
    const { id } = item;
    assert.deepEqual(Object.values(key.mapping[id]).toSorted(), [0, 1]);
    const question = packetById.get(id);
    assert.equal(question.question, item.question);
    assert.deepEqual(question.sources, item.requests.synthesis.sources.map(({ label, stance, text }) => ({ label, stance, text })));
    assert.equal(question.connectionInput, item.requests.synthesis.connectionInput);
    for (const route of routes) {
      const judge = judgmentsById.get(id)[route];
      assert.ok(["A", "B", "tie", "unavailable"].includes(judge?.winner), `Malformed judgment: ${id} ${route}`);
      assert.ok(typeof judge.reason === "string" && judge.reason.trim(), `Missing review reason: ${id} ${route}`);
      const byVersion = [];
      for (const side of sides) {
        const index = key.mapping[id][side];
        const attempt = runs[index].records.get(`${id}/${route}`).attempts.at(-1);
        assert.deepEqual(question[side][route], attempt.reading ?? { outcome: "unavailable" });
        byVersion[index] = { side, outcome: attempt.reading?.outcome ?? "unavailable",
          ...(route === "synthesis" && judge[side] !== undefined ? { judgment: judge[side] } : {}) };
        if (!attempt.reading) missing.push({ id, route, side, version: index,
          requestId: attempt.body.requestId, status: attempt.status, error: attempt.error });
      }
      if (byVersion.some(({ outcome }) => outcome === "unavailable")) {
        assert.equal(judge.winner, "unavailable", `Uncomparable row assigned winner: ${id} ${route}`);
      }
      const verdict = judge.winner === "unavailable" ? "NC" : judge.winner === "tie" ? "D"
        : key.mapping[id][judge.winner] === 1 ? "W" : "L";
      rows.push({ id, set: item.set, route, verdict, reason: judge.reason, baseline: byVersion[0], candidate: byVersion[1] });
    }
  }

  const result = {
    versions: key.versions, examSha256: sha(examRaw), packetSha256: key.packetSha256, judgmentSha256: judgeSha,
    tallies: ["formal", "transfer"].flatMap((set) => routes.map((route) => ({
      set, route, counts: Object.fromEntries(["W", "D", "L", "NC"].map((outcome) =>
        [outcome, rows.filter((row) => row.set === set && row.route === route && row.verdict === outcome).length]))
    }))),
    missing, rows,
    gates: Object.entries(gateCards).map(([id, expectedCandidate]) => ({
      id, expectedCandidate, baseline: gate(runs[0], id), candidate: gate(runs[1], id)
    })),
    metrics: runs.flatMap((run, version) => routes.map((route) => ({ version, route, value: metrics(run, route, cases) })))
  };
  await Promise.all([
    writeFile(join(out, "revealed.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" }),
    writeFile(join(out, "results.md"), generateTable(result), { flag: "wx" })
  ]);
}

const { values } = parseArgs({ options: Object.fromEntries(
  ["judgments", "judge-sha", "packet", "key", "evidence", "out"].map((name) => [name, { type: "string" }])
) });
await main(values);
