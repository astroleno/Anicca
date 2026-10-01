import assert from "node:assert/strict";
import path from "node:path";

export async function runSeedRecoveryAndTouch(browser, { baseUrl, outputDir, setActivePage }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  setActivePage(page);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const input = route.request().postDataJSON();
    requests.push(input);
    if (requests.length === 1) {
      await new Promise(resolve => setTimeout(resolve, 1600));
      return route.fulfill({ status: 502, json: { error: "branches_failed", details: "provider_overloaded" } });
    }
    await route.fulfill({ json: { requestId: input.requestId,
      thesis: { text: "先做一次具体尝试。", label: "尝试", summary: "先尝试。", stance: "正" },
      antithesis: { text: "先检验隐含前提。", label: "检验", summary: "先检验。", stance: "反" }
    } });
  });
  try {
    await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.click();
    await page.getByRole("textbox", { name: "输入", exact: true }).fill("失败后仍然保留我的想法");
    await page.getByRole("button", { name: "生成", exact: true }).click();
    await page.getByLabel("已用时间").filter({ hasText: "1 秒" }).waitFor();
    await page.screenshot({ path: path.join(outputDir, "mobile-pending-elapsed.png") });
    await page.getByRole("button", { name: "重试", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "输入", exact: true }).inputValue(), "失败后仍然保留我的想法");
    await page.screenshot({ path: path.join(outputDir, "mobile-failure-retry.png") });
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="dialogue-stage-node-"]').length === 3);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].userText, requests[1].userText);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="dialogue-stage-node-"]')].every(node => Math.abs(parseFloat(node.style.translate) || 0) < .2));
    const a = await page.locator('[data-testid^="dialogue-stage-node-"][data-metaball-role="thesis"]').boundingBox();
    const b = await page.locator('[data-testid^="dialogue-stage-node-"][data-metaball-role="antithesis"]').boundingBox();
    assert(a && b);
    const session = await context.newCDPSession(page);
    const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const end = { x: b.x + b.width / 2 - 15, y: b.y + b.height / 2 };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
    await page.waitForTimeout(400); // The hold itself is the gesture under test.
    for (let step = 1; step <= 12; step++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12, id: 1 }] });
      await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.getByRole("button", { name: "合成", exact: true }).waitFor();
    assert.equal(requests.length, 2, "A touch bridge previews a pair without generating it");
    await page.screenshot({ path: path.join(outputDir, "mobile-touch-combination.png") });
    await page.getByRole("button", { name: "取消组合", exact: true }).click();
    assert.deepEqual(errors, []);
    return { name: "seed-recovery-and-touch", passed: true, requests: requests.length,
      checks: ["elapsed-wait", "retained-draft", "retry", "long-press-drag", "explicit-confirmation"] };
  } finally { await context.close(); }
}

export async function runCanvasLifecycle(browser, { baseUrl, outputDir, setActivePage }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    window.__canvasAudit = { creates: 0, deletes: 0, draws: 0, rects: 0, live: new Set() };
    const audit = window.__canvasAudit;
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...args) { audit.rects++; return rect.apply(this, args); };
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const create = prototype.createProgram, remove = prototype.deleteProgram;
      prototype.createProgram = function (...args) { const program = create.apply(this, args); audit.creates++; audit.live.add(program); return program; };
      prototype.deleteProgram = function (program) { audit.deletes++; audit.live.delete(program); return remove.call(this, program); };
      for (const name of ["drawArrays", "drawElements"]) {
        const draw = prototype[name];
        prototype[name] = function (...args) { audit.draws++; return draw.apply(this, args); };
      }
    }
  });
  const page = await context.newPage();
  setActivePage(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/labs`, { waitUntil: "networkidle" });
    const runs = [];
    for (let index = 0; index < 3; index++) {
      await page.getByRole("link", { name: /液滴融合/ }).click();
      await page.waitForFunction(() => document.querySelector("canvas")?.width > 1 && window.__canvasAudit.draws > 20);
      await page.waitForTimeout(600); // Allow the first set of postprocessing shaders to compile.
      const before = await page.evaluate(() => ({ creates: window.__canvasAudit.creates, position: document.querySelector('[data-ball-id="0"]').style.transform }));
      await page.evaluate(() => { window.__canvasAudit.rects = 0; });
      await page.mouse.move(640, 360);
      await page.mouse.down();
      // Stay inside the empty centre: moving into the surrounding ring can
      // legitimately trigger this experiment's dwell-to-merge on a slow run.
      await page.mouse.move(680, 380, { steps: 24 });
      await page.mouse.up();
      await page.getByRole("button", { name: "高对比", exact: true }).click();
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => ({ creates: window.__canvasAudit.creates, rects: window.__canvasAudit.rects,
        position: document.querySelector('[data-ball-id="0"]').style.transform }));
      assert.equal(after.creates, before.creates, "Dragging and changing presets reuse the scene's programs");
      if (index === 0) assert.notEqual(after.position, before.position, "The label follows the dragged ball");
      assert(after.rects < 12, `Dragging must not read layout for every ball: ${JSON.stringify(after)}`);
      if (index === 0) await page.screenshot({ path: path.join(outputDir, "raymarching-drag.png") });
      await page.getByRole("link", { name: "全部实验", exact: true }).click();
      await page.waitForURL("**/labs");
      await page.waitForFunction(() => window.__canvasAudit.live.size === 0, undefined, { timeout: 5000 }).catch(async () => {
        throw Error(`Canvas cleanup audit: ${JSON.stringify(await page.evaluate(() => ({ creates: window.__canvasAudit.creates, deletes: window.__canvasAudit.deletes,
          live: window.__canvasAudit.live.size, canvases: document.querySelectorAll("canvas").length, url: location.pathname })))}`);
      });
      runs.push(after);
    }
    await page.getByRole("link", { name: /流动星云/ }).click();
    await page.waitForFunction(() => document.querySelector("canvas")?.width > 1);
    const resolution = await page.evaluate(() => ({ width: document.querySelector("canvas").width, viewport: innerWidth, dpr: devicePixelRatio }));
    assert(resolution.width <= resolution.viewport, JSON.stringify(resolution));
    const hiddenDraws = await page.evaluate(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      const before = window.__canvasAudit.draws;
      await new Promise(resolve => setTimeout(resolve, 150));
      const difference = window.__canvasAudit.draws - before;
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
      return difference;
    });
    assert.equal(hiddenDraws, 0, "The nebula pauses when hidden");
    await page.screenshot({ path: path.join(outputDir, "nebula-capped-dpr.png") });
    await page.getByRole("link", { name: "全部实验", exact: true }).click();
    await page.waitForURL("**/labs");
    await page.waitForFunction(() => window.__canvasAudit.live.size === 0);
    assert.deepEqual(errors, []);
    return { name: "canvas-lifecycle", passed: true, runs, resolution, hiddenDraws,
      checks: ["scene-reuse", "preset-reuse", "label-motion", "no-per-frame-layout", "three-route-cleanups", "dpr-cap", "hidden-pause"] };
  } finally { await context.close(); }
}
