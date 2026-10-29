import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { thoughtFlowFixture, thoughtFlowResponseFor } from "./thought-flow.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

// Only synthetic text in fresh contexts. All model replies are controlled.
const urls = (process.env.ANICCA_QA_URLS || "http://127.0.0.1:48840/Anicca").split(",");
const output = process.env.ANICCA_QA_OUTPUT || `/tmp/anicca-selection-intent-${Date.now()}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal"]
  : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"] });
const results = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function fresh(baseUrl, mobile) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(fixture => {
    if (!localStorage.getItem("anicca_workspace_active_v1")) localStorage.setItem("anicca_workspace_v2", JSON.stringify(fixture));
  }, thoughtFlowFixture);
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(30_000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-stage-track"]')?.dataset.metaballRenderer === "ready");
  const hint = await page.getByLabel("探索提示", { exact: true }).innerText();
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const gestureHint = coarse ? "拖空白平移 · 拖球合成 · 双指转动与缩放" : "拖动空白，改变观察方向";
  assert(hint.includes(gestureHint), "First-visit help describes the actual primary input");
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await waitForSeedLayout(page);
  await page.getByTestId("dialogue-stage-node-root").locator("[data-seed-caption]").click();
  await page.locator('#dialogue-reading-drawer[data-open="true"]').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#dialogue-reading-drawer")).opacity === "1");
  return { context, page, errors, hint, coarse };
}
try {
  for (const baseUrl of urls) for (const mobile of [false, true]) {
    const { context, page, errors, hint, coarse } = await fresh(baseUrl, mobile);
    const result = { test: "inquiry-dismissal", baseUrl, mobile, coarse, hint, passed: false }; results.push(result);
    const prefix = `${new URL(baseUrl).hostname}-${mobile ? "mobile" : "desktop"}`;
    let release, started;
    const gate = new Promise(resolve => { release = resolve; }), requestStarted = new Promise(resolve => { started = resolve; });
    await page.route("**/api/inquiry", async route => {
      const body = route.request().postDataJSON(); started(); await gate;
      await route.fulfill({ json: thoughtFlowResponseFor("/api/inquiry", body, 1) });
    });
    try {
      await page.getByRole("button", { name: "选一句追问", exact: true }).click();
      await page.getByLabel("选择要追问的原句").getByRole("button").first().click();
      await page.getByRole("button", { name: "追问前提", exact: true }).click();
      await page.getByRole("textbox", { name: "输入", exact: true }).fill("保留开放角落需要哪些共同条件？");
      await page.getByRole("button", { name: "追问", exact: true }).click(); await requestStarted;
      await page.getByRole("button", { name: "返回种子，收起阅读", exact: true }).click();
      await page.locator("#dialogue-reading-drawer").waitFor({ state: "hidden" });
      result.fullyExitedBeforeReply = await page.locator("#dialogue-reading-drawer").count() === 0;
      await page.screenshot({ path: path.join(output, `${prefix}-closed.png`) }); release();
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`) || "null");
        return Object.keys(saved?.graph.nodes || {}).length === 3;
      });
      await settle(page);
      result.afterReply = await page.evaluate(() => ({ readingReopened: document.querySelector("#dialogue-reading-drawer")?.dataset.open === "true",
        activeElement: document.activeElement?.id }));
      assert(result.fullyExitedBeforeReply); assert.equal(result.afterReply.readingReopened, false);
      assert.notEqual(result.afterReply.activeElement, "conversation-panel-heading");
      await page.screenshot({ path: path.join(output, `${prefix}-after-reply.png`) });
      await page.reload({ waitUntil: "networkidle" }); await settle(page);
      assert.equal(await page.locator('#dialogue-reading-drawer[data-open="true"]').count(), 0, "Refresh retains the reader's dismissal");
      const responseId = await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`));
        return Object.values(data.graph.nodes).find(node => node.kind === "assistant").id;
      });
      await waitForSeedLayout(page);
      await page.getByTestId(`dialogue-stage-node-${responseId}`).locator("[data-seed-caption]").click();
      await page.getByRole("heading", { name: "协商的余地", exact: true }).waitFor();
      result.savedResponseReadableAfterRefresh = true;
      assert.deepEqual(errors, []); assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin);
      result.passed = true;
    } finally { release(); await context.close(); console.log(JSON.stringify(result)); }
  }
  for (const baseUrl of urls) {
    const { context, page, errors } = await fresh(baseUrl, false);
    const result = { test: "native-drag-selection", baseUrl, steps: [], passed: false }; results.push(result);
    try {
      const points = await page.locator("[data-seed-passage] p").first().evaluate(p => {
        window.__selectionSource = p.firstChild; window.__selectionContent = p.textContent;
        return [1, 3, 8, 15, 21, 15, 8].map(offset => {
          const range = document.createRange(); range.setStart(p.firstChild, offset); range.setEnd(p.firstChild, offset + 1);
          const rect = range.getBoundingClientRect(); return { offset, x: rect.x + rect.width * .15, y: rect.y + rect.height * .5 };
        });
      });
      await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
      for (const point of points.slice(1)) {
        await page.mouse.move(point.x, point.y, { steps: 4 }); await settle(page);
        const state = await page.evaluate(() => ({ selection: getSelection()?.toString(),
          originalUnchanged: window.__selectionSource?.textContent === window.__selectionContent,
          quote: document.querySelector('[aria-label="围绕选句继续"] blockquote')?.textContent || null,
          splitVisible: [...document.querySelectorAll("button")].some(button => button.textContent?.includes("推演正反") && button.getClientRects().length) }));
        result.steps.push({ offset: point.offset, pointerStillDown: true, ...state });
        assert(state.originalUnchanged); assert.equal(state.quote, null); assert(state.splitVisible);
      }
      const finalQuote = result.steps.at(-1).selection.trim(); assert(finalQuote.length > 2);
      await page.screenshot({ path: path.join(output, `${new URL(baseUrl).hostname}-drag-before-release.png`) });
      await page.mouse.up(); await page.getByLabel("围绕选句继续").waitFor();
      assert.equal(await page.getByLabel("围绕选句继续").locator("blockquote").innerText(), finalQuote);
      await page.screenshot({ path: path.join(output, `${new URL(baseUrl).hostname}-drag-after-release.png`) });
      await page.getByRole("button", { name: "追问前提", exact: true }).click();
      assert.equal(await page.getByLabel("本次追问的原句").innerText(), finalQuote);
      result.finalQuote = finalQuote; assert.deepEqual(errors, []); result.passed = true;
    } finally { await page.mouse.up().catch(() => {}); await context.close(); console.log(JSON.stringify(result)); }
  }
} finally {
  await browser.close(); await writeFile(path.join(output, "summary.json"), JSON.stringify({
    method: "Existing project Playwright; synthetic text, controlled replies, desktop / mobile touch viewport", results }, null, 2));
  console.log(JSON.stringify({ evidence: output }));
}
