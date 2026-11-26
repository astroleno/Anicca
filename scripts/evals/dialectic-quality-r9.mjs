import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadExam as loadR8, runExam, sha256 } from "./dialectic-quality-r8.mjs";

export const evidence = fileURLToPath(new URL("../../docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r9/", import.meta.url));

export async function loadExam(kind = "all") {
  assert.ok(["all", "new"].includes(kind), "Use --exam all|new");
  const [manifest, requests, referenceBytes] = await Promise.all(
    ["frozen.sha256", "requests.json", "reference.json"].map((file) => readFile(join(evidence, file)))
  );
  assert.equal(manifest.toString(), `${sha256(requests)}  requests.json\n${sha256(referenceBytes)}  reference.json\n`);
  const { cases } = JSON.parse(requests);
  const reference = JSON.parse(referenceBytes);
  assert.equal(cases.length, 8);
  assert.deepEqual(cases.map(({ id }) => id), reference.cases.map(({ id }) => id));
  for (const { id, set, question, requests: { synthesis } } of cases) {
    assert.equal(set, "r9-new");
    assert.equal(synthesis.meaningVersion, 1);
    assert.equal(synthesis.sources.length, 2);
    assert.equal(new Set(synthesis.sources.map(({ id }) => id)).size, 2);
    assert.equal(synthesis.rootInput, synthesis.sources.map(({ text }) => text).join("\n\n"));
    assert.ok(synthesis.contextMessages.some(({ role, content }) => role === "user" && content.endsWith(question)), id);
  }
  const fresh = { cases, examSha256: sha256(requests), manifestSha256: sha256(manifest), reference };
  if (kind === "new") return fresh;
  const [original, confirmation] = await Promise.all([loadR8(), loadR8("confirmation")]);
  const editions = [original, confirmation, fresh];
  const all = editions.flatMap(({ cases }) => cases);
  assert.equal(new Set(all.map(({ id }) => id)).size, 41);
  return {
    cases: all,
    examSha256: sha256(editions.map(({ examSha256 }) => examSha256).join("\n")),
    manifestSha256: sha256(editions.map(({ manifestSha256 }) => manifestSha256).join("\n")),
    reference
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runExam({ load: loadExam, defaultExam: "all", fullOnly: ["all", "new"], prefix: "r9" });
}
