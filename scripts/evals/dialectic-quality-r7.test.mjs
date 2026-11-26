// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { makeBlind } from "./blind-dialectic-quality-r7.mjs";
import { loadExam, readingBody } from "./dialectic-quality-r7.mjs";

describe("round seven frozen comparison", () => {
  it("retains the formal corpus and real ordered source shapes", async () => {
    const { cases } = await loadExam();
    expect(cases.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => `formal-${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 5 }, (_, i) => `transfer-0${i + 1}`)
    ]);
    expect(cases[15].requests.synthesis.sources.map(({ stance }) => stance)).toEqual(["正", "正"]);
    expect(cases[15].requests.synthesis.connectionInput).toContain("第一次出现的地名");
    expect(cases[16].requests.synthesis.sources.map(({ stance }) => stance)).toEqual(["想法", "想法"]);
  });

  it("projects only full reading text and preserves a deferred reason and question", () => {
    expect(readingBody("branches", {
      thesis: { stance: "正", text: "第一段\n\n第二段", summary: "摘要" },
      antithesis: { stance: "反", text: "反方", change: "调试信息" }
    })).toEqual({ outcome: "branches", thesis: "第一段\n\n第二段", antithesis: "反方" });
    expect(readingBody("synthesis", {
      outcome: "deferred", deferred: { reason: "题目彼此独立。", question: "你想让两件事在哪相遇？" }
    })).toEqual({ outcome: "deferred", reason: "题目彼此独立。", question: "你想让两件事在哪相遇？" });
    expect(readingBody("synthesis", { outcome: "deferred", deferred: { reason: "题目彼此独立。" } })).toBeNull();
  });

  it("independently switches A and B and keeps the mapping outside the packet", async () => {
    const { cases } = await loadExam();
    const coins = [0, 1];
    const { packets, mapping } = await makeBlind(cases.slice(-2), (version, _, route) => ({ version, route }), () => coins.shift());
    expect(mapping).toEqual({ "transfer-04": { A: 0, B: 1 }, "transfer-05": { A: 1, B: 0 } });
    expect(packets[1].A.synthesis.version).toBe(1);
    expect(packets[1].A.branches.version).toBe(1);
    expect(packets[1].sources[0]).toEqual({ label: "周末边界", stance: "想法", text: expect.any(String) });
    expect(packets[1]).not.toHaveProperty("requests");
    expect(packets[1]).not.toHaveProperty("mapping");
  });

  it("records attempts and deferred responses, then resumes without reposting completed cases", async () => {
    const directory = await mkdtemp(join(tmpdir(), "anicca-quality-test-"));
    const settings = join(directory, "provider.json");
    await writeFile(settings, JSON.stringify({ model: "mock", provider: "loopback" }));
    const calls = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls.push({ url: request.url, id: body.requestId, header: request.headers["x-anicca-eval-id"] });
      const { requestId } = body;
      const retry = requestId.endsWith("formal-01-branches-1");
      if (retry) response.statusCode = 429;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(retry ? { requestId, error: "rate_limited" }
        : request.url === "/api/branches" ? { requestId,
          thesis: { stance: "正", text: "正方正文" }, antithesis: { stance: "反", text: "反方正文" } }
          : { requestId, outcome: "deferred", deferred: { reason: "合流理由", question: "补充问题" } }));
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const output = join(directory, "run");
    const execute = () => promisify(execFile)(process.execPath, [
      resolve("scripts/evals/dialectic-quality-r7.mjs"), "--base", `http://127.0.0.1:${server.address().port}`,
      "--output", output, "--run", "mock", "--revision", "123abcd", "--settings", settings
    ]);
    try {
      await execute();
      const load = async (...parts) => JSON.parse(await readFile(join(output, ...parts), "utf8"));
      const record = await load("responses", "formal-01-branches.json");
      expect(record.attempts.map(({ status }) => status)).toEqual([429, 200]);
      const synthesis = await load("responses", "transfer-05-synthesis.json");
      expect(synthesis.attempts[0].reading).toEqual({
        outcome: "deferred", reason: "合流理由", question: "补充问题"
      });
      expect(calls).toHaveLength(35);
      expect(calls.every(({ id, header }) => id === header)).toBe(true);
      await execute();
      expect(calls).toHaveLength(35);
    } finally {
      await new Promise((done) => server.close(done));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
