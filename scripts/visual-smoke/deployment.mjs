import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { runThoughtFlow, thoughtFlowFixture } from "./thought-flow.mjs";
import { runSeedRecoveryAndTouch } from "./soft-interactions.mjs";

// Uses fresh contexts only; existing users' workspaces and renderer preferences
// are never cleared. --live sends this test's garden discussion to the real API.
const live = process.argv.includes("--live");
const rendererOnly = process.argv.includes("--renderer-only");
assert(!(live && rendererOnly), "Renderer-only checks do not call model APIs");
const urls = (process.env.ANICCA_QA_URLS || "https://aitoshuu.me/Anicca,https://tongye.me/Anicca")
  .split(",").map(value => value.trim().replace(/\/+$/, "")).filter(Boolean);
const outputDir = path.resolve(process.env.ANICCA_QA_OUTPUT || `/tmp/anicca-public-qa-${Date.now()}`);
await mkdir(outputDir, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true,
  ...(process.env.DIALOGUE_SMOKE_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.DIALOGUE_SMOKE_BROWSER_EXECUTABLE_PATH } : {}),
  args: process.platform === "darwin" ? ["--use-angle=metal"]
    : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"] });
try {
  for (const baseUrl of urls) {
    const target = new URL(baseUrl);
    assert.equal(target.pathname, "/Anicca");
    const folder = path.join(outputDir, target.hostname, live ? "live" : "controlled");
    await mkdir(folder, { recursive: true });
    const networkErrors = [];
    const setActivePage = page => {
      page.on("response", response => {
        const url = new URL(response.url());
        if (url.origin === target.origin && url.pathname.startsWith("/Anicca/_next/") && response.status() >= 400) {
          networkErrors.push({ path: url.pathname, status: response.status() });
        }
      });
    };
    console.log(JSON.stringify({ deploymentQa: "start", baseUrl, live }));
    const flow = rendererOnly ? null : await runThoughtFlow(browser, { baseUrl, outputDir: folder, setActivePage, live, entryPath: "",
      specs: [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile-390", width: 390, height: 844 }] });
    const pointers = [];
    if (!live && !rendererOnly) for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844, hasTouch: true, isMobile: true }
    ]) pointers.push(await runSeedRecoveryAndTouch(browser, { baseUrl, outputDir: folder, setActivePage, viewport }));
    const renderers = live ? [] : await checkRendererSelection(browser, baseUrl, setActivePage);
    assert.deepEqual(networkErrors, [], "All prefixed scripts, styles and lazy chunks must load");
    results.push({ baseUrl, live, rendererOnly, passed: true, networkErrors, flow, pointers, renderers });
    console.log(JSON.stringify({ deploymentQa: "passed", baseUrl, live, flow: (flow?.results || []).map(result => ({
      name: result.name, nodeCount: result.nodeCount, requestCount: result.requestCount, renderer: result.renderer
    })), pointers: pointers.length, renderers }));
  }
} finally {
  await browser.close();
  await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify({ live, rendererOnly,
    environment: { browser: "Chromium", mobile: "touch viewport emulation", method: "existing project visual workflow", browserPlugin: "not available" },
    results }, null, 2)}\n`);
  console.log(JSON.stringify({ evidence: outputDir }));
}

async function checkRendererSelection(browser, baseUrl, setActivePage) {
  const results = [];
  for (const spec of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844, hasTouch: true, isMobile: true }]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height },
      hasTouch: Boolean(spec.hasTouch), isMobile: Boolean(spec.isMobile), deviceScaleFactor: 1 });
    await context.addInitScript(data => localStorage.setItem("anicca_workspace_v2", JSON.stringify(data)), thoughtFlowFixture);
    const page = await context.newPage(); setActivePage(page);
    page.setDefaultTimeout(30_000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const ready = expected => page.waitForFunction(backend => {
      const canvas = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
      return document.querySelector('[data-testid="dialogue-stage-track"]')?.dataset.metaballRenderer === "ready"
        && (backend ? canvas?.dataset.rendererBackend === backend : ["webgpu", "webgl2"].includes(canvas?.dataset.rendererBackend));
    }, expected);
    try {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await ready(spec.hasTouch ? "original" : undefined);
      const guide = page.getByRole("button", { name: "关闭提示", exact: true }); if (await guide.isVisible()) await guide.click();
      await page.getByRole("button", { name: "更多", exact: true }).click();
      assert.equal(await page.getByRole("link", { name: "视觉实验", exact: true }).getAttribute("href"), "/Anicca/labs");
      for (const [label, mode, backend] of [["TSL WebGL2", "tsl-webgl", "webgl2"], ["原版", "original", "original"], ["TSL 自动", "tsl", undefined]]) {
        await page.getByRole("radio", { name: label, exact: true }).check();
        await ready(backend);
        assert.equal(await page.evaluate(() => localStorage.getItem("anicca.dialogue.renderer.v1")), mode);
      }
      await page.reload({ waitUntil: "networkidle" }); await ready();
      const selectedBackend = await page.getByTestId("dialogue-metaball-canvas").getAttribute("data-renderer-backend");
      assert.equal(await page.evaluate(() => localStorage.getItem("anicca.dialogue.renderer.v1")), "tsl");
      // Exercise the loss handler in this isolated test; this is not a real GPU crash.
      await page.getByTestId("dialogue-metaball-canvas").evaluate(canvas => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
      await ready("original");
      assert.equal(await page.getByTestId("dialogue-metaball-canvas").getAttribute("data-renderer-fallback"), "true");
      await page.getByRole("button", { name: "更多", exact: true }).click();
      await page.getByText("TSL 不可用，已回退原版", { exact: true }).waitFor();
      assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin);
      assert.equal(new URL(page.url()).pathname, "/Anicca");
      assert.deepEqual(errors, []);
      results.push({ name: spec.name, selectedBackend, passed: true,
        checks: ["manual-original", "manual-tsl-webgl2", "manual-tsl-auto", "selection-persists-after-refresh", "simulated-context-loss-falls-back-to-original", "prefixed-labs-link"] });
    } finally { await context.close(); }
  }
  return results;
}
