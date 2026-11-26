import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { finalReading, loadRun, makePacket, packetRow, privateTarget } from "./blind-dialectic-quality-r8.mjs";
import { evidence as r8Evidence, loadExam as loadR8, metrics, readJson, sha256 } from "./dialectic-quality-r8.mjs";
import { evidence, loadExam } from "./dialectic-quality-r9.mjs";

const sides = ["A", "B"];
const groups = [
  { name: "旧卷", sets: ["formal", "transfer"], minimum: 16 },
  { name: "已揭回归", sets: ["holdout"], minimum: 8 },
  { name: "原确认卷", sets: ["confirmation"], minimum: 7 },
  { name: "第九轮新卷", sets: ["r9-new"], minimum: 8 }
];
const extraGroup = { name: "追加确认卷", sets: ["r9-confirmation"], minimum: 4 };
const expectedDecisions = {
  "可做": "allow", "不可做": "deny", "条件未满足": "conditional",
  "授权缺口": "permission_gap", "应撤下": "remove", "不应增设": "no_extra_permission"
};
const decisions = [...Object.values(expectedDecisions), "omitted", "unclear"];
const hasText = (value) => typeof value === "string" && Boolean(value.trim());
const json = (value) => JSON.stringify(value, null, 2) + "\n";

function mergeRuns(parts) {
  const records = new Map(parts.flatMap((part) => [...part.records]));
  const traces = new Map(parts.flatMap((part) => [...part.traces]));
  assert.equal(records.size, parts.reduce((sum, part) => sum + part.records.size, 0));
  assert.equal(traces.size, parts.reduce((sum, part) => sum + part.traces.size, 0));
  return { records, traces };
}

async function loadComparison({ afterDir, freshDir, extended, extraBeforeDir, extraAfterDir }) {
  const includeExtra = extended || Boolean(extraAfterDir);
  const [exam, original, confirmation, fresh, candidateExam, extra] = await Promise.all([
    loadExam(includeExtra ? "extended" : "all"), loadR8(), loadR8("confirmation"), loadExam("new"),
    loadExam(extended ? "extended" : "all"), includeExtra ? loadExam("confirmation") : null
  ]);
  const [baselineOld, baselineConfirmation, baselineFresh, after, baselineExtra, candidateExtra] = await Promise.all([
    loadRun(join(r8Evidence, "confirmation-regression", "after"), original),
    loadRun(join(r8Evidence, "confirmation", "after"), confirmation),
    loadRun(freshDir, fresh, "r9"),
    loadRun(afterDir, candidateExam, "r9"),
    extra ? loadRun(extraBeforeDir, extra, "r9") : null,
    extraAfterDir ? loadRun(extraAfterDir, extra, "r9") : null
  ]);
  assert.deepEqual([baselineOld, baselineConfirmation, baselineFresh, after].map(({ config }) => config.run),
    ["after", "after", "before", "after"]);
  assert.ok([baselineOld, baselineConfirmation].every(({ config }) => config.revision === "c7888fa"));
  assert.equal(baselineFresh.config.revision, "34a47e4");
  assert.ok(!["c7888fa", "34a47e4"].includes(after.config.revision));
  const prior = [baselineOld, baselineConfirmation, baselineFresh];
  if (baselineExtra) {
    assert.equal(baselineExtra.config.run, "before");
    assert.equal(baselineExtra.config.revision, "34a47e4");
    prior.push(baselineExtra);
  }
  if (candidateExtra) {
    assert.equal(candidateExtra.config.run, "after");
    assert.equal(candidateExtra.config.revision, after.config.revision);
  }
  for (const { config } of [...prior, ...(candidateExtra ? [candidateExtra] : [])]) {
    assert.deepEqual(config.settings, after.config.settings);
    assert.deepEqual(config.transport, after.config.transport);
  }
  const before = mergeRuns(prior);
  const candidate = candidateExtra ? mergeRuns([after, candidateExtra]) : after;
  assert.equal(before.records.size, exam.cases.length);
  assert.equal(candidate.records.size, exam.cases.length);
  const versions = {
    before: [
      { revision: "c7888fa", sets: ["formal", "transfer", "holdout", "confirmation"] },
      { revision: "34a47e4", sets: ["r9-new", ...(includeExtra ? ["r9-confirmation"] : [])] }
    ],
    after: [{ revision: after.config.revision, sets: exam.cases.map(({ set }) => set).filter((set, i, list) => list.indexOf(set) === i) }]
  };
  return { exam, versions, runs: [before, candidate] };
}

function blindRow(id, item, readings) {
  const { contextMessages } = item.requests.synthesis;
  const context = contextMessages.map(({ role, content }) => ({
    role, content: content.replace(/^\[[^\]\r\n]* · id=[^\]\r\n]* · 来源=[^\]\r\n]*\]\s*/u, "")
  }));
  return { ...packetRow(id, item, readings), context };
}

function validateJudgment(side, reading, id) {
  assert.ok(side && hasText(side.finding), id);
  assert.equal(side.readable, reading.outcome !== "unavailable", id);
  assert.equal(typeof side.serious, "boolean", id);
  assert.ok(["pass", "fail", "na", "unavailable"].includes(side.boundary), id);
  assert.equal(side.boundary === "unavailable", !side.readable, id);
  assert.ok(Array.isArray(side.actions), id);
  if (!side.readable) {
    assert.equal(side.serious, false, id);
    assert.equal(side.actions.length, 0, id);
  }
  if (side.boundary === "pass") assert.ok(side.actions.length > 0 && side.actions.every(({ correct }) => correct), id);
  for (const { action, decision, evidence, correct } of side.actions) {
    assert.ok(hasText(action) && decisions.includes(decision) && hasText(evidence) && typeof correct === "boolean", id);
  }
}

function slot(run, item) {
  const { attempts } = run.records.get(item.id);
  return {
    reading: finalReading(run, item),
    attempts: attempts.map(({ status, error, elapsedMs, body, rawBody }) => {
      const trace = run.traces.get(body.requestId);
      let details = null;
      try { details = JSON.parse(rawBody)?.details ?? null; } catch { /* Preserve the raw HTTP record in its run archive. */ }
      return {
        requestId: body.requestId, status, error, elapsedMs, details,
        traceId: trace?.traceId ?? null, traceOutcome: trace?.outcome ?? null,
        modelCalls: trace?.modelCalls ?? null, providerCalls: trace?.providerCalls ?? null,
        repairCalls: trace?.repairCalls ?? null,
        stages: trace?.calls.map(({ stage, outcome, repair, repairKind }) => ({ stage, outcome, repair, repairKind })) ?? [],
        invalidChecks: trace?.checks?.filter(({ valid }) => valid === false) ?? []
      };
    })
  };
}

function revealRows(exam, runs, packet, mapping, judgments) {
  const byId = new Map(exam.cases.map((item) => [item.id, item]));
  const judgeById = new Map(judgments.map((judgment) => [judgment.id, judgment]));
  const references = new Map(exam.reference.cases.map((item) => [item.id, item]));
  assert.equal(packet.length, byId.size);
  assert.equal(judgments.length, byId.size);
  assert.equal(judgeById.size, byId.size);
  assert.deepEqual(Object.keys(mapping).sort(), [...judgeById.keys()].sort());
  const rows = new Map();
  for (const question of packet) {
    const judgment = judgeById.get(question.id);
    const binding = mapping[question.id];
    assert.ok(judgment && binding, question.id);
    assert.deepEqual([binding.A, binding.B].sort(), [0, 1]);
    const item = byId.get(binding.caseId);
    assert.ok(item && !rows.has(item.id), question.id);
    const results = runs.map((run) => slot(run, item));
    assert.deepEqual(question, blindRow(question.id, item, sides.map((side) => results[binding[side]].reading)));
    for (const side of sides) {
      const result = results[binding[side]];
      validateJudgment(judgment[side], result.reading, `${question.id} ${side}`);
      result.judgment = judgment[side];
    }
    const isUnavailable = results.some(({ judgment }) => !judgment.readable);
    assert.ok([...sides, "tie", "unavailable"].includes(judgment.winner) && hasText(judgment.reason), question.id);
    assert.equal(judgment.winner === "unavailable", isUnavailable, question.id);
    const comparison = ({ tie: "tie", unavailable: "unavailable" })[judgment.winner] ??
      (binding[judgment.winner] === 1 ? "win" : "loss");
    rows.set(item.id, { id: item.id, set: item.set, blindId: question.id, comparison, reason: judgment.reason,
      reference: references.get(item.id), before: results[0], after: results[1] });
  }
  return exam.cases.map(({ id }) => rows.get(id));
}

function frozenBoundary(row, version) {
  const { readable, boundary, actions, serious } = row[version].judgment;
  if (!readable || serious || boundary !== "pass" || actions.length < row.reference.actions.length) return false;
  const remaining = actions.map(({ decision }) => decision);
  return row.reference.actions.every(({ accept }) => {
    const index = remaining.indexOf(expectedDecisions[accept]);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

function buildResult(exam, runs, versions, packet, key, judgments, judgeSha) {
  const rows = revealRows(exam, runs, packet, key.mapping, judgments);
  const reportGroups = rows.some(({ set }) => set === "r9-confirmation") ? [...groups, extraGroup] : groups;
  const comparisons = reportGroups.map(({ name, sets, minimum }) => {
    const ids = rows.filter(({ set }) => sets.includes(set)).map(({ id }) => id);
    const selected = rows.filter(({ id }) => ids.includes(id));
    const wins = ["win", "tie", "loss", "unavailable"].map((label) => selected.filter(({ comparison }) => comparison === label).length);
    const [before, after] = runs.map((run) => metrics(ids.map((id) => run.records.get(id)), run.traces));
    return { name, cases: ids.length, minimum, readablePass: after.readable >= minimum, before, after, wins };
  });
  const historical = ["holdout-04", "holdout-05", "holdout-06"].map((id) => {
    const { judgment, reading } = rows.find((row) => row.id === id).after;
    const substantiveOralHistory = id !== "holdout-06" || reading.outcome === "synthesis";
    return { id, pass: judgment.readable && !judgment.serious && judgment.boundary === "pass" && substantiveOralHistory };
  });
  const boundaries = rows.filter(({ reference }) => reference).map((row) => ({
    id: row.id, before: frozenBoundary(row, "before"), after: frozenBoundary(row, "after")
  }));
  const serious = rows.filter(({ after }) => after.judgment.serious).map(({ id }) => id);
  const provisionalPass = comparisons.every(({ readablePass }) => readablePass) &&
    historical.every(({ pass }) => pass) && boundaries.every(({ after }) => after) && serious.length === 0;
  return { versions, examSha256: exam.examSha256, manifestSha256: exam.manifestSha256,
    packetSha256: key.packetSha256, judgmentsSha256: judgeSha, comparisons, historical, boundaries, serious, provisionalPass, rows };
}

function report(result) {
  const measures = [
    ["可读", "readable"], ["HTTP 尝试", "attempts"], ["HTTP 重试题数", "retried"],
    ["真实跟踪", "traced"], ["模型调用", "modelCalls"], ["供应商调用", "providerCalls"], ["修复", "repairCalls"],
    ["客户端最后一次尝试 p50 毫秒", "p50FinalAttemptMs"], ["客户端最后一次尝试 p95 毫秒", "p95FinalAttemptMs"]
  ];
  const extra = result.comparisons.some(({ name }) => name === extraGroup.name);
  const showBoundaries = (boundaries) =>
    `改前 ${boundaries.filter(({ before }) => before).length}/${boundaries.length}，改后 ${boundaries.filter(({ after }) => after).length}/${boundaries.length}`;
  const fresh = extra ? result.boundaries.filter(({ id }) => id.startsWith("r9-new-")) : result.boundaries;
  return [
    "# 第九轮盲评复算",
    "",
    "| 题组 | 样本数 | 改后最低可读数 | 改后可读 | 改后胜 / 平 / 负 / 不可比 |",
    "| --- | ---: | ---: | ---: | --- |",
    ...result.comparisons.map(({ name, cases, minimum, after, wins }) => `| ${name} | ${cases} | ${minimum} | ${after.readable} | ${wins.join(" / ")} |`),
    "",
    "| 指标（改前 → 改后） | " + result.comparisons.map(({ name }) => name).join(" | ") + " |",
    "| --- | " + result.comparisons.map(() => "---:").join(" | ") + " |",
    ...measures.map(([label, key]) => `| ${label} | ` + result.comparisons.map(({ before, after }) =>
      `${before[key] ?? "未知"} → ${after[key] ?? "未知"}`).join(" | ") + " |"),
    ...[["输入 token", "inputTokens"], ["已缓存输入 token", "cachedInputTokens"], ["输出 token", "outputTokens"]].map(([label, key]) =>
      `| ${label} | ` + result.comparisons.map(({ before, after }) =>
        [before, after].map((sample) => {
          const { tokens, reported, calls } = sample[key];
          return reported === calls ? tokens : `${tokens}（仅 ${reported}/${calls} 调用报告）`;
        }).join(" → ")).join(" | ") + " |"),
    "",
    "供应商实际计费未知。逐题错误、HTTP 状态、修复与校验阶段见 [揭盲 JSON](revealed.json)。",
    "",
    `历史严重题通过 ${result.historical.filter(({ pass }) => pass).length}/3。独立新卷逐动作结构核对${showBoundaries(fresh)}。改后判严重 ${result.serious.length} 题。`,
    ...(extra ? [`追加确认卷逐动作结构核对${showBoundaries(result.boundaries.filter(({ id }) => id.startsWith("r9-confirm-")))}。`] : []),
    "",
    `程序复算${result.provisionalPass ? "达到" : "未达到"}冻结数值门槛。最终验收需核对逐动作语义与引文，并对照历史严重题原要求。`,
    ""
  ].join("\n");
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      ...Object.fromEntries(["after", "new-before", "confirmation-before", "confirmation-after", "packet", "key", "judgments", "judge-sha", "out"]
        .map((key) => [key, { type: "string" }])),
      extended: { type: "boolean", default: false }
    }
  });
  const [mode] = positionals;
  const { after, packet: packetFile, key: keyFile, judgments: judgmentFile, "judge-sha": judgeSha, out } = values;
  assert.ok(positionals.length === 1 && ["pack", "reveal"].includes(mode) && after && packetFile && keyFile,
    "Use pack|reveal --after DIR --packet FILE --key FILE [--new-before DIR]. Reveal adds --judgments FILE --judge-sha SHA --out DIR.");
  assert.ok(!values.extended || !values["confirmation-after"], "Choose a single extended run or two separate runs");
  assert.ok(!values["confirmation-before"] || values.extended || values["confirmation-after"], "Include candidate confirmation runs");
  const { exam, versions, runs } = await loadComparison({
    afterDir: after,
    freshDir: values["new-before"] ?? join(evidence, "new-before"),
    extended: values.extended,
    extraBeforeDir: values["confirmation-before"] ?? join(evidence, "confirmation", "before"),
    extraAfterDir: values["confirmation-after"]
  });
  if (mode === "pack") {
    const [packetTarget, keyTarget] = await Promise.all([privateTarget(packetFile), privateTarget(keyFile)]);
    assert.notEqual(dirname(packetTarget), dirname(keyTarget));
    const { packet, mapping } = makePacket(exam.cases, runs, blindRow);
    const packetBytes = json(packet);
    const key = { packetSha256: sha256(packetBytes), versions, mapping };
    await writeFile(keyTarget, json(key), { mode: 0o600, flag: "wx" });
    await writeFile(packetTarget, packetBytes, { mode: 0o600, flag: "wx" });
    console.log(`${packet.length} anonymous comparisons, packet SHA-256 ${key.packetSha256}`);
    return;
  }
  assert.ok(judgmentFile && /^[a-f0-9]{64}$/u.test(judgeSha ?? "") && out);
  const [key, packetBytes, judgmentBytes] = await Promise.all([readJson(keyFile), readFile(packetFile), readFile(judgmentFile)]);
  assert.equal(sha256(judgmentBytes), judgeSha, "Judgment SHA-256 differs from the seal");
  assert.equal(sha256(packetBytes), key.packetSha256, "Packet SHA-256 differs from the key");
  assert.deepEqual(key.versions, versions);
  const result = buildResult(exam, runs, versions, JSON.parse(packetBytes), key, JSON.parse(judgmentBytes), judgeSha);
  await mkdir(out, { recursive: true });
  await Promise.all([
    writeFile(join(out, "revealed.json"), json(result), { flag: "wx" }),
    writeFile(join(out, "results.md"), report(result), { flag: "wx" })
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
