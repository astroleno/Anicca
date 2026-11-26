import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadComparison, packetRow } from "./blind-dialectic-quality-r8.mjs";
import { evidence, metrics, readJson, sha256 } from "./dialectic-quality-r8.mjs";

const sides = ["A", "B"];
const winners = [...sides, "tie", "unavailable"];
const labels = ["改前", "改后"];
const groups = [
  { label: "旧卷合计", sets: ["formal", "transfer"] },
  { label: "旧卷正式", sets: ["formal"] },
  { label: "旧卷迁移", sets: ["transfer"] },
  { label: "独立新卷", sets: ["holdout"] }
];
const format = (value) => value == null ? "—" : new Intl.NumberFormat("en-US").format(value);
const cell = (value) => String(value ?? "—").replaceAll("|", "\\|").replace(/\s+/gu, " ");
const contents = (value) => typeof value === "string" && Boolean(value.trim());
const showCards = (cards) => cards?.length ? cards.join("、") : cards ? "无" : "缺跟踪";

function details(rawBody) {
  try { return JSON.parse(rawBody)?.details ?? null; }
  catch { return null; }
}

function slot(run, item) {
  const { attempts } = run.records.get(item.id);
  const response = attempts.at(-1);
  const trace = run.traces.get(response.body.requestId);
  return {
    reading: response.reading ?? { outcome: "unavailable" },
    status: response.status,
    error: response.error,
    details: details(response.rawBody),
    elapsedMs: response.elapsedMs ?? null,
    attempts: attempts.length,
    requestId: response.body.requestId,
    trace: trace ? {
      id: trace.traceId,
      outcome: trace.outcome,
      candidateIds: trace.policyCards?.candidateIds ?? [],
      applicableIds: trace.policyCards?.applicableIds ?? [],
      modelCalls: trace.modelCalls,
      providerCalls: trace.providerCalls,
      stages: trace.calls.map(({ stage, repair, repairKind }) => ({ stage, repair, ...(repairKind ? { repairKind } : {}) }))
    } : null
  };
}

function groupedMetrics(run, cases) {
  const records = cases.map(({ id }) => run.records.get(id));
  const stats = metrics(records, run.traces);
  const calls = records.flatMap(({ attempts }) => attempts.flatMap(({ body }) => run.traces.get(body.requestId)?.calls ?? []));
  const repairs = { contract: 0, prose: 0, reviewer_protocol: 0, unclassified: 0 };
  for (const call of calls.filter(({ repair }) => repair)) {
    const kind = call.repairKind ?? (["draft", "critic", "final"].includes(call.stage) ? "contract" : "unclassified");
    assert.ok(kind in repairs, `Unexpected repair kind: ${kind}`);
    repairs[kind]++;
  }
  return { ...stats, repairs };
}

function comparison(exam, runs, packet, key, judgments) {
  const cases = new Map(exam.cases.map((item) => [item.id, item]));
  assert.equal(packet.length, cases.size);
  assert.equal(judgments.length, cases.size);
  const judging = new Map(judgments.map((item) => [item.id, item]));
  assert.equal(judging.size, cases.size, "Duplicate judgments");
  assert.deepEqual(Object.keys(key.mapping).sort(), [...judging.keys()].sort());
  const rows = new Map();
  for (const question of packet) {
    const judgment = judging.get(question.id);
    const binding = key.mapping[question.id];
    assert.ok(judgment && binding, `Unknown blind ID: ${question.id}`);
    assert.deepEqual([binding.A, binding.B].sort(), [0, 1]);
    const item = cases.get(binding.caseId);
    assert.ok(item && !rows.has(item.id), `Unknown or repeated case: ${binding.caseId}`);
    const versions = runs.map((run) => slot(run, item));
    assert.deepEqual(question, packetRow(question.id, item, sides.map((side) => versions[binding[side]].reading)));
    assert.ok(winners.includes(judgment.winner) && contents(judgment.reason), `Incomplete result: ${question.id}`);
    for (const side of sides) {
      const serious = judgment[`serious${side}`];
      assert.ok(contents(judgment[side]) && typeof serious === "boolean", `Incomplete side: ${question.id} ${side}`);
      const version = versions[binding[side]];
      if (version.reading.outcome === "unavailable") {
        assert.equal(serious, false, `Missing side cannot make a claim: ${question.id} ${side}`);
      }
      version.judgment = { finding: judgment[side], serious };
    }
    const unavailable = versions.some(({ reading }) => reading.outcome === "unavailable");
    assert.equal(judgment.winner === "unavailable", unavailable, question.id);
    const comparison = ({ tie: "tie", unavailable: "unavailable" })[judgment.winner] ??
      (binding[judgment.winner] === 1 ? "win" : "loss");
    rows.set(item.id, { id: item.id, group: item.group, set: item.set, blindId: question.id, comparison,
      reason: judgment.reason, before: versions[0], after: versions[1] });
  }
  return exam.cases.map(({ id }) => rows.get(id));
}

function buildResult(exam, runs, packet, key, judgments, judgeSha) {
  const rows = comparison(exam, runs, packet, key, judgments);
  const confirmation = exam.confirmationExamSha256;
  const reportGroups = confirmation ? [
    ...groups.slice(0, -1), { label: "已揭卷回归", sets: ["holdout"] }, { label: "独立确认卷", sets: ["confirmation"] }
  ] : groups;
  const summaries = reportGroups.map(({ label, sets }) => {
    const selected = rows.filter(({ set }) => sets.includes(set));
    const cases = exam.cases.filter(({ set }) => sets.includes(set));
    const tally = Object.fromEntries(["win", "tie", "loss", "unavailable"]
      .map((result) => [result, selected.filter(({ comparison }) => comparison === result).length]));
    return { label, tally, stats: runs.map((run) => groupedMetrics(run, cases)) };
  });
  const [baselineHoldout, candidateHoldout] = summaries[3].stats.map(({ readable }) => readable);
  const candidateRegression = summaries[0].stats[1].readable;
  const confirmationReadability = confirmation ? {
    before: summaries[4].stats[0].readable, after: summaries[4].stats[1].readable, cases: summaries[4].stats[1].cases
  } : null;
  const seriousBefore = rows.filter(({ before }) => before.judgment.serious).map(({ id }) => id);
  const seriousAfter = rows.filter(({ after }) => after.judgment.serious).map(({ id }) => id);
  return {
    examSha256: exam.examSha256, manifestSha256: exam.manifestSha256,
    ...(confirmation ? { confirmationExamSha256: confirmation, confirmationManifestSha256: exam.confirmationManifestSha256 } : {}),
    packetSha256: key.packetSha256, judgmentsSha256: judgeSha,
    versions: key.versions, summaries, rows,
    gates: { candidateRegression, candidateHoldout, baselineHoldout,
      readablePass: candidateRegression >= 16 && candidateHoldout >= Math.max(7, baselineHoldout),
      ...(confirmationReadability ? { confirmationReadability } : {}),
      seriousBefore, seriousAfter, newSerious: seriousAfter.filter((id) => !seriousBefore.includes(id)) }
  };
}

function render(result) {
  const { summaries, versions, gates, rows } = result;
  const confirmation = gates.confirmationReadability;
  const readability = confirmation
    ? `改后旧卷 ${gates.candidateRegression}/17，已揭卷 ${gates.candidateHoldout}/8。同批已揭卷改前 ${gates.baselineHoldout}/8。独立确认卷改前 ${confirmation.before}/${confirmation.cases}，改后 ${confirmation.after}/${confirmation.cases}。原两卷的可读率门槛${gates.readablePass ? "达到" : "未达到"}。`
    : `改后旧卷 ${gates.candidateRegression}/17，新卷 ${gates.candidateHoldout}/8。改前同批新卷 ${gates.baselineHoldout}/8。可读率门槛${gates.readablePass ? "达到" : "未达到"}。`;
  const output = [
    "# 第八轮合流实测",
    "",
    `改前为 \`${versions[0].revision}\`，改后为 \`${versions[1].revision}\`。盲评按实际交付的正文或暂不融合判读。只有一侧可读时，评审照常判读其风险，该题计入无法比较。[封存判断](judgments.json) · [逐题揭盲](revealed.json)`,
    "",
    "## 可读率与盲判",
    "",
    `${readability}改前严重误导 ${gates.seriousBefore.length} 题，改后 ${gates.seriousAfter.length} 题。`,
    "",
    "| 题组 | 改前可读 | 改后可读 | 改后胜 | 平 | 改后负 | 无法比较 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summaries.map(({ label, tally, stats: [before, after] }) =>
      `| ${label} | ${before.readable}/${before.cases} | ${after.readable}/${after.cases} | ${tally.win} | ${tally.tie} | ${tally.loss} | ${tally.unavailable} |`),
    "",
    "## 缺测与退步",
    "",
    "| 题号 | 版本 | HTTP | 错误与细节 |",
    "| --- | --- | ---: | --- |",
    ...(rows.some(({ before, after }) => before.error || after.error)
      ? rows.flatMap((row) => ["before", "after"].flatMap((version, i) => {
        const { status, error, details: description } = row[version];
        return error ? [`| ${row.id} | ${labels[i]} | ${format(status)} | ${cell([error, description].filter(Boolean).join(" · "))} |`] : [];
      })) : ["| — | — | — | 无 |"]),
    ""
  ];
  const regressions = rows.filter(({ comparison, before, after }) => comparison === "loss" || before.judgment.serious || after.judgment.serious);
  if (regressions.length) {
    output.push("| 题号 | 改前判读 | 改后判读 | 比较理由 |", "| --- | --- | --- | --- |");
    for (const { id, before, after, reason } of regressions) {
      const finding = ({ judgment }) => cell([judgment.serious ? "严重误导" : "", judgment.finding].filter(Boolean).join(" · "));
      output.push(`| ${id} | ${finding(before)} | ${finding(after)} | ${cell(reason)} |`);
    }
    output.push("");
  }
  output.push(
    "## 延迟与用量",
    "",
    "延迟用每题最后一次 HTTP 尝试，含可记录耗时的失败。跟踪、调用和 token 总计包括所有正式尝试及其内部修复。输入 token 包含已缓存输入。用量为供应商回报，缺报时标出覆盖次数。",
    "",
    "| 题组 | 版本 | 暂不融合 | p50 / p95 ms | 跟踪 / 尝试 | 模型 / 供应商 | 格式 / 正文 / 协议 / 未分类修复 | 输入 / 缓存输入 / 输出 token |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const { label, stats } of summaries) {
    for (const [i, entry] of stats.entries()) {
      const tokens = [entry.inputTokens, entry.cachedInputTokens, entry.outputTokens].map(({ tokens, reported, calls }) =>
        format(tokens) + (reported === calls ? "" : `（${reported}/${calls} 次）`)).join(" / ");
      const repairs = Object.values(entry.repairs).join(" / ");
      output.push(`| ${label} | ${labels[i]} | ${entry.deferred} | ${format(entry.p50FinalAttemptMs)} / ${format(entry.p95FinalAttemptMs)} | ${entry.traced} / ${entry.attempts} | ${entry.modelCalls} / ${entry.providerCalls} | ${repairs} | ${tokens} |`);
    }
  }
  output.push(
    "",
    "## 逐题跟踪",
    "",
    "候选与实际适用的策略卡均来自本轮生产跟踪。下一表列出涉及候选卡的题以及任何一版调用数或单题耗时出现增长的题。所有原始数据见两版归档。",
    "",
    "| 题号 | 候选卡 改前 → 改后 | 适用卡 改前 → 改后 | 模型调用 改前 → 改后 | 客户端 ms 改前 → 改后 | 改后阶段 |",
    "| --- | --- | --- | ---: | ---: | --- |"
  );
  for (const { id, before, after } of rows) {
    if (!(before.trace?.candidateIds.length || after.trace?.candidateIds.length ||
      after.trace?.modelCalls > before.trace?.modelCalls || after.elapsedMs > before.elapsedMs)) continue;
    const stages = after.trace?.stages.map(({ stage, repair, repairKind }) =>
      `${stage}${repair ? `(${repairKind ?? "修复"})` : ""}`).join(" · ") ?? "缺跟踪";
    output.push(`| ${id} | ${showCards(before.trace?.candidateIds)} → ${showCards(after.trace?.candidateIds)} | ${showCards(before.trace?.applicableIds)} → ${showCards(after.trace?.applicableIds)} | ${format(before.trace?.modelCalls)} → ${format(after.trace?.modelCalls)} | ${format(before.elapsedMs)} → ${format(after.elapsedMs)} | ${stages} |`);
  }
  return output.join("\n") + "\n";
}

async function main() {
  const { values } = parseArgs({ options: {
    judgments: { type: "string" }, "judge-sha": { type: "string" }, packet: { type: "string" },
    key: { type: "string" }, evidence: { type: "string", default: evidence }, out: { type: "string" },
    before: { type: "string" }, after: { type: "string" },
    "confirmation-before": { type: "string" }, "confirmation-after": { type: "string" }
  } });
  const { judgments: judgmentFile, "judge-sha": judgeSha, packet: packetFile, key: keyFile, evidence: folder, out,
    before = join(folder, "before"), after = join(folder, "after"),
    "confirmation-before": confirmationBefore, "confirmation-after": confirmationAfter } = values;
  assert.ok(judgmentFile && /^[a-f0-9]{64}$/u.test(judgeSha ?? "") && packetFile && keyFile && out,
    "Use --judgments FILE --judge-sha SHA256 --packet FILE --key FILE [--evidence DIR] --out DIR " +
    "[--before RUN_DIR --after RUN_DIR] [--confirmation-before RUN_DIR --confirmation-after RUN_DIR]");
  assert.equal(Boolean(confirmationBefore), Boolean(confirmationAfter), "Provide both confirmation runs");
  const [judgmentBytes, packetBytes, key] = await Promise.all([
    readFile(judgmentFile), readFile(packetFile), readJson(keyFile)
  ]);
  assert.equal(sha256(judgmentBytes), judgeSha, "Judgments must match sealed SHA-256");
  assert.equal(sha256(packetBytes), key.packetSha256, "Wrong packet and key pairing");
  const { exam, runs } = await loadComparison([before, after], confirmationBefore ? [confirmationBefore, confirmationAfter] : undefined);
  assert.deepEqual(key.versions, runs.map(({ config: { run, revision } }) => ({ run, revision })));
  const result = buildResult(exam, runs, JSON.parse(packetBytes), key, JSON.parse(judgmentBytes), judgeSha);
  await writeFile(join(out, "revealed.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  await writeFile(join(out, "results.md"), render(result), { flag: "wx" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
