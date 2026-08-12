import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function runVisualSmoke(env) {
  const scriptPath = path.resolve(process.cwd(), "scripts/visual-smoke/dialogue.mjs");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
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
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("dialogue visual smoke failure evidence", () => {
  it("publishes an isolated manifest without replacing the last successful output", async () => {
    const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "anicca-visual-failure-"));
    const successDir = path.join(artifactRoot, "dialogue");
    await mkdir(successDir, { recursive: true });
    await writeFile(path.join(successDir, "summary.json"), "old-success\n");

    try {
      const result = await runVisualSmoke({
        DIALOGUE_SMOKE_ARTIFACT_ROOT: artifactRoot,
        DIALOGUE_SMOKE_SERVER_MODE: "unsupported-test-mode",
        GITHUB_RUN_ATTEMPT: "7",
        GITHUB_RUN_ID: "987654",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567"
      });

      expect(result.code).toBe(1);
      expect(await readFile(path.join(successDir, "summary.json"), "utf8")).toBe("old-success\n");

      const manifest = JSON.parse(
        await readFile(path.join(artifactRoot, "dialogue-failure", "failure-manifest.json"), "utf8")
      );
      expect(manifest).toMatchObject({
        status: "failure",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        runId: "987654",
        runAttempt: "7",
        currentStep: "setup:resolve-server-mode",
        lastSuccessfulStep: "setup:prepare-output-dir",
        lastViewport: null,
        lastScenario: null,
        failureWait: null
      });
      expect(manifest.error.stack).toContain("resolveServerMode");
      expect(manifest.error.stack).toContain("dialogue.mjs");
      expect(result.stderr).toContain(manifest.error.stack);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("turns the total timeout into an uploadable failure instead of leaving the server alive", async () => {
    const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "anicca-visual-timeout-"));
    const startedAt = Date.now();

    try {
      const result = await runVisualSmoke({
        DIALOGUE_SMOKE_ARTIFACT_ROOT: artifactRoot,
        DIALOGUE_SMOKE_SERVER_MODE: "dev",
        DIALOGUE_SMOKE_TOTAL_TIMEOUT_MS: "1000"
      });

      expect(result.code).toBe(1);
      expect(Date.now() - startedAt).toBeLessThan(12_000);
      const manifest = JSON.parse(
        await readFile(path.join(artifactRoot, "dialogue-failure", "failure-manifest.json"), "utf8")
      );
      expect(manifest.error.message).toContain("DIALOGUE_SMOKE_TOTAL_TIMEOUT_MS=1000");
      expect(result.stderr).toContain(manifest.error.stack);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("labels every Playwright condition wait and retains browser failure diagnostics", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "scripts/visual-smoke/dialogue.mjs"),
      "utf8"
    );

    expect(source).toContain("failure-screenshot.png");
    expect(source).toContain("failure-dom.html");
    expect(source).toContain("failure-page-state.json");
    expect(source).toContain("error.stack");
    expect(source).toContain("viewport:");
    expect(source).toContain("interaction:");
    expect(source).toContain("wait:");
    expect(source.match(/\.waitForFunction\(/g)).toHaveLength(1);
  });

  it("owns the production server process and reserves time to publish failure evidence", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "scripts/visual-smoke/dialogue.mjs"),
      "utf8"
    );

    expect(source).toMatch(/spawn\(\s*process\.execPath,\s*\[nextCliPath/);
    expect(source).toContain("await stopNextServer(server)");
    expect(source).toContain("DIALOGUE_SMOKE_TOTAL_TIMEOUT_MS");
  });

  it("captures the Roundtable handoff element without a full-page surface", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "scripts/visual-smoke/dialogue.mjs"),
      "utf8"
    );

    expect(source).toContain("await handoff.screenshot({ path: screenshotPath })");
    expect(source).not.toContain("await page.screenshot({ path: screenshotPath, fullPage: true })");
  });
});
