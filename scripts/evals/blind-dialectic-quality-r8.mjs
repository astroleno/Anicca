import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { lstat, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkRecord, loadExam, metrics, readJson, sha256 } from "./dialectic-quality-r8.mjs";

export async function loadRun(dir, { cases, examSha256, manifestSha256 }, prefix = "r8") {
  const [config, archive] = await Promise.all([
    readJson(join(dir, "settings.json")), readJson(join(dir, "traces.json"))
  ]);
  assert.equal(config.examSha256, examSha256);
  assert.equal(config.manifestSha256, manifestSha256);
  assert.equal(config.route, "synthesis");
  assert.equal(config.concurrency, 4);
  assert.deepEqual(archive.mismatches, []);
  const traces = new Map(archive.traces.map((trace) => [trace.evalRequestId, trace]));
  assert.equal(traces.size, archive.traces.length);
  const records = await Promise.all(cases.map(async (item) => {
    const record = await readJson(join(dir, "responses", `${item.id}-synthesis.json`));
    checkRecord(record, item, config.run, prefix);
    for (const { body, reading, pending } of record.attempts) {
      assert.ok(!pending);
      const trace = traces.get(body.requestId);
      if (reading) assert.ok(trace, `Missing trace for ${body.requestId}`);
      if (trace) {
        assert.equal(trace.model, config.settings.model);
        assert.equal(trace.endpoint, config.route);
      }
    }
    return record;
  }));
  const attemptIds = records.flatMap(({ attempts }) => attempts.map(({ body }) => body.requestId));
  const attemptIdSet = new Set(attemptIds);
  assert.ok([...traces.keys()].every((id) => attemptIdSet.has(id)));
  assert.deepEqual(archive.missingRequestIds, attemptIds.filter((id) => !traces.has(id)));
  const summary = await readJson(join(dir, "summary.json"));
  assert.deepEqual(summary.all, metrics(records, traces));
  for (const set of new Set(cases.map(({ set }) => set))) {
    assert.deepEqual(summary.bySet[set], metrics(records.filter((_, i) => cases[i].set === set), traces));
  }
  return { config, traces, summary, records: new Map(records.map((record) => [record.id, record])) };
}

export async function loadRuns(dirs, exam) {
  const runs = await Promise.all(dirs.map((dir) => loadRun(dir, exam)));
  assert.deepEqual(runs.map(({ config }) => config.run), ["before", "after"]);
  assert.notEqual(runs[0].config.revision, runs[1].config.revision);
  assert.deepEqual(runs[0].config.settings, runs[1].config.settings);
  assert.deepEqual(runs[0].config.transport, runs[1].config.transport);
  return runs;
}

export async function loadComparison(dirs, confirmationDirs) {
  const exam = await loadExam();
  if (!confirmationDirs) return { exam, runs: await loadRuns(dirs, exam) };

  const confirmation = await loadExam("confirmation");
  const [originalRuns, confirmationRuns] = await Promise.all([loadRuns(dirs, exam), loadRuns(confirmationDirs, confirmation)]);
  const runs = originalRuns.map((run, index) => {
    const counterpart = confirmationRuns[index];
    assert.equal(run.config.revision, counterpart.config.revision, "Use the same revision for both exams");
    assert.deepEqual(run.config.settings, counterpart.config.settings);
    assert.deepEqual(run.config.transport, counterpart.config.transport);
    return {
      ...run,
      records: new Map([...run.records, ...counterpart.records]),
      traces: new Map([...run.traces, ...counterpart.traces])
    };
  });
  const cases = [...exam.cases, ...confirmation.cases];
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length);
  return {
    exam: { ...exam, cases, confirmationExamSha256: confirmation.examSha256, confirmationManifestSha256: confirmation.manifestSha256 },
    runs
  };
}

export function packetRow(id, item, readings) {
  const { sources, connectionInput } = item.requests.synthesis;
  return {
    id, question: item.question,
    sources: sources.map(({ label, stance, text }) => ({ label, stance, text })),
    ...(connectionInput ? { connectionInput } : {}),
    A: readings[0], B: readings[1]
  };
}

export const finalReading = (run, item) => run.records.get(item.id).attempts.at(-1).reading ?? { outcome: "unavailable" };

export function makePacket(cases, runs, buildRow = packetRow) {
  const shuffled = [...cases];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const mapping = {};
  const packet = shuffled.map((item, index) => {
    const id = "q" + String(index + 1).padStart(2, "0");
    const sideA = randomInt(2);
    mapping[id] = { caseId: item.id, A: sideA, B: 1 - sideA };
    return buildRow(id, item, [sideA, 1 - sideA].map((side) => finalReading(runs[side], item)));
  });
  return { packet, mapping };
}

export async function privateTarget(file) {
  const temp = await realpath("/tmp");
  const dir = await realpath(dirname(resolve(file)));
  assert.ok(dir.startsWith(`${temp}${sep}`) && ((await lstat(dir)).mode & 0o077) === 0,
    "Use a private subdirectory of /tmp (mktemp -d)");
  return join(dir, basename(file));
}

async function main() {
  const { values } = parseArgs({ options: {
    before: { type: "string" }, after: { type: "string" }, packet: { type: "string" }, key: { type: "string" },
    "confirmation-before": { type: "string" }, "confirmation-after": { type: "string" }
  } });
  const { before, after, "confirmation-before": confirmationBefore, "confirmation-after": confirmationAfter } = values;
  assert.ok(before && after && values.packet && values.key,
    "Use --before RUN_DIR --after RUN_DIR --packet PRIVATE_TMP/PACKET.json --key OTHER_PRIVATE_TMP/KEY.json " +
    "[--confirmation-before RUN_DIR --confirmation-after RUN_DIR]");
  assert.equal(Boolean(confirmationBefore), Boolean(confirmationAfter), "Provide both confirmation runs");
  const [packetFile, keyFile] = await Promise.all([privateTarget(values.packet), privateTarget(values.key)]);
  assert.notEqual(dirname(packetFile), dirname(keyFile), "Keep packet and mapping in distinct private directories");
  const { exam, runs } = await loadComparison([before, after], confirmationBefore ? [confirmationBefore, confirmationAfter] : undefined);
  const { packet, mapping } = makePacket(exam.cases, runs);
  const packetBytes = JSON.stringify(packet, null, 2) + "\n";
  const versions = runs.map(({ config: { run, revision } }) => ({ run, revision }));
  const key = { packetSha256: sha256(packetBytes), versions, mapping };
  await writeFile(keyFile, JSON.stringify(key, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await writeFile(packetFile, packetBytes, { mode: 0o600, flag: "wx" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
