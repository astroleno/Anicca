import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function runHarness(baseUrl, outputDir) {
  const scriptPath = path.resolve(process.cwd(), "scripts/evals/dialectic-50-live.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANICCA_EVAL_BASE_URL: baseUrl,
        ANICCA_EVAL_MODE: "mock",
        ANICCA_EVAL_OUTPUT_DIR: outputDir
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`eval harness exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

describe("dialectic 50 latency reporting", () => {
  it("includes failed attempts and retry backoff in end-to-end latency", async () => {
    let firstBranchRequest = true;
    const server = http.createServer(async (request, response) => {
      const body = await readJson(request);

      if (request.url === "/api/branches" && firstBranchRequest) {
        firstBranchRequest = false;
        sendJson(response, 429, { requestId: body.requestId, error: "rate_limited" });
        return;
      }

      if (request.url === "/api/branches") {
        sendJson(response, 200, {
          requestId: body.requestId,
          thesis: { text: "推进试验", summary: "先试验再决定。", label: "小步验证", stance: "正" },
          antithesis: { text: "先看约束", summary: "先明确约束。", label: "约束优先", stance: "反" }
        });
        return;
      }

      sendJson(response, 200, {
        requestId: body.requestId,
        synthesis: { text: "有边界地试验", summary: "设定边界后试验。", label: "双轨试验", stance: "合" }
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "anicca-eval-latency-"));

    try {
      if (!address || typeof address === "string") {
        throw new Error("test server did not expose a TCP port");
      }
      await runHarness(`http://127.0.0.1:${address.port}`, outputDir);
      const summary = JSON.parse(fs.readFileSync(path.join(outputDir, "summary.json"), "utf8"));
      const records = JSON.parse(fs.readFileSync(path.join(outputDir, "records.json"), "utf8"));

      expect(records[0].branchesResponse.totalElapsedMs).toBeGreaterThanOrEqual(1_100);
      expect(summary.latencyMs.branches.max).toBeGreaterThanOrEqual(1_100);
      expect(summary.retriedRecords).toEqual([
        expect.objectContaining({ index: 1, branchesAttempt: 2 })
      ]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
