import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { thoughtFlowFixture } from "./thought-flow.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

// Fresh contexts and synthetic garden text only. Provider failures are controlled;
// the existing deployment runner separately exercises real generation end to end.
const urls = (process.env.ANICCA_QA_URLS || "http://127.0.0.1:48822/Anicca").split(",");
const output = path.resolve(process.env.ANICCA_QA_OUTPUT || `/tmp/anicca-review-fixes-${Date.now()}`);
await mkdir(output, { recursive: true });
const fixture = structuredClone(thoughtFlowFixture);
fixture.graph.nodes.root.meta = { label: "社区花园" };
fixture.graph.nodes.root.children = ["positive", "negative"];
for (const [id, stance, label] of [["positive", "正", "共同发现"], ["negative", "反", "持续维护"]]) {
  fixture.graph.nodes[id] = { id, kind: "assistant", branchType: stance, text: `${label}的条件可以继续商量。`,
    parents: ["root"], children: [], createdAt: "2026-10-28T00:00:00Z", meta: { label } };
  fixture.graph.edges[id] = { id, from: "root", to: id };
}
const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal"]
  : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"] });
const results = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  for (const baseUrl of urls) for (const spec of [{ name: "desktop", width: 1440, height: 900, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true }].filter(item => !process.env.ANICCA_QA_VIEWPORT || item.name === process.env.ANICCA_QA_VIEWPORT)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: spec.mobile, hasTouch: spec.mobile });
    await context.addInitScript(data => {
      localStorage.setItem("anicca_workspace_v2", JSON.stringify(data));
      window.__readingMotions = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (this.id === "dialogue-reading-drawer") window.__readingMotions.push(options.duration);
        return animate.call(this, frames, options);
      };
    }, fixture);
    const errors = [], requests = [];
    const attach = page => { page.setDefaultTimeout(30_000); page.on("pageerror", error => errors.push(error.message)); };
    let page = await context.newPage(); attach(page);
    await context.route("**/api/**", route => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 502, json: { error: "branches_failed", details: "provider_overloaded" } });
    });
    const result = { baseUrl, viewport: spec.name, passed: false };
    const folder = path.join(output, new URL(baseUrl).hostname);
    await mkdir(folder, { recursive: true });
    const shot = async name => { await settle(page); await page.screenshot({ path: path.join(folder, `${spec.name}-${name}.png`) }); };
    const ready = async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-stage-track"]')?.dataset.metaballRenderer === "ready");
      const guide = page.getByRole("button", { name: "关闭提示", exact: true }); if (await guide.isVisible()) await guide.click();
      await documentFonts();
    };
    const documentFonts = () => page.evaluate(() => document.fonts.ready.then(() => undefined));
    const activeWorkspace = () => page.evaluate(() => localStorage.getItem("anicca_workspace_active_v1"));
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`)));
    const journal = () => page.evaluate(() => JSON.parse(localStorage.getItem(`anicca_reading_v1:${localStorage.getItem("anicca_workspace_active_v1")}`)));
    const openPerspective = () => page.getByRole("button", { name: "换个角度", exact: true }).click();
    const edit = () => page.getByRole("button", { name: "编辑维度", exact: true }).click();
    const nameInput = () => page.getByRole("dialog").getByLabel("名称", { exact: true }).first();
    const closePerspective = () => page.getByRole("button", { name: "关闭思考空间", exact: true }).click();
    const openRoot = async keyboard => {
      await waitForSeedLayout(page);
      const seed = page.getByTestId("dialogue-stage-node-root");
      if (keyboard) { await seed.focus(); await seed.press("Enter"); } else await seed.locator("[data-seed-caption]").click();
      await page.locator('#dialogue-reading-drawer[data-open="true"]').waitFor(); await settle(page);
    };
    const closeReading = async () => { await page.keyboard.press("Escape"); await page.locator("#dialogue-reading-drawer").waitFor({ state: "hidden" }); };
    try {
      await ready();
      const workspaceA = await activeWorkspace();
      await openPerspective(); await edit(); await nameInput().fill("范围草稿");
      await page.getByRole("button", { name: "观察", exact: true }).click();
      await page.getByRole("button", { name: "整体", exact: true }).click(); await edit();
      assert.equal(await nameInput().inputValue(), "范围草稿"); await closePerspective();
      await page.reload({ waitUntil: "networkidle" }); await openPerspective(); await edit();
      assert.equal(await nameInput().inputValue(), "范围草稿", "Ordinary closing and refresh retain the draft");
      assert.equal((await snapshot()).thinkingSpace.axes[0].label, "尺度", "Draft has not been applied");
      await closePerspective();
      await page.getByRole("button", { name: "更多", exact: true }).click(); await page.getByRole("button", { name: "新建工作区", exact: true }).click();
      await page.waitForFunction(id => localStorage.getItem("anicca_workspace_active_v1") !== id, workspaceA);
      await openPerspective(); await edit(); assert.equal(await nameInput().inputValue(), "尺度");
      await nameInput().fill("另一个草稿"); await closePerspective();
      await page.getByRole("button", { name: "更多", exact: true }).click();
      await page.getByRole("group", { name: "最近工作区", exact: true }).locator('button:not([aria-current="true"])').first().click();
      await page.waitForFunction(id => localStorage.getItem("anicca_workspace_active_v1") === id, workspaceA);
      await openPerspective(); await edit(); assert.equal(await nameInput().inputValue(), "范围草稿");
      await page.getByRole("button", { name: "保存维度", exact: true }).click();
      await page.getByRole("heading", { name: "范围草稿", exact: true }).waitFor(); await shot("saved-dimension");
      assert.equal((await snapshot()).thinkingSpace.focus.scale, 1);
      await edit(); await nameInput().fill("明确取消"); await page.getByRole("button", { name: "取消编辑", exact: true }).click(); await edit();
      assert.equal(await nameInput().inputValue(), "范围草稿"); await closePerspective();
      result.dimensionDraft = "observe / close / refresh / workspace isolation / save / cancel passed";

      await openRoot(true);
      assert.deepEqual(await page.evaluate(() => window.__readingMotions), [], "Keyboard reading is immediate");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "conversation-panel-heading");
      await page.getByTestId("dialogue-panel").evaluate(el => { el.scrollTop = 650; el.dispatchEvent(new Event("scroll")); });
      await settle(page); await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      const before = await journal(); assert.equal(before.activeId, "root"); assert(before.positions.root.anchor.offset > 0);
      await shot("reading-before-refresh");
      await page.reload({ waitUntil: "networkidle" }); await documentFonts();
      await page.locator('#dialogue-reading-drawer[data-open="true"]').waitFor(); await settle(page);
      const sameWidth = await page.getByTestId("dialogue-panel").evaluate(el => el.scrollTop);
      assert(Math.abs(sameWidth - before.positions.root.scrollTop) < 3, `Same-width read position: ${sameWidth}`);
      assert.deepEqual(await page.evaluate(() => window.__readingMotions), [], "Restored reading is immediate");
      await shot("reading-after-refresh"); await page.close();
      page = await context.newPage(); attach(page);
      await page.setViewportSize({ width: spec.mobile ? 430 : 700, height: spec.height }); await ready();
      await page.locator('#dialogue-reading-drawer[data-open="true"]').waitFor(); await settle(page);
      const reflowed = await page.getByTestId("dialogue-panel").evaluate((panel, anchor) => {
        for (const passage of panel.querySelectorAll("[data-passage-start]")) {
          let offset = anchor.offset - Number(passage.dataset.passageStart);
          if (offset < 0 || offset >= passage.textContent.length) continue;
          const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
          let text = walker.nextNode();
          while (text && offset >= text.textContent.length) { offset -= text.textContent.length; text = walker.nextNode(); }
          const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + 1);
          return { scrollTop: panel.scrollTop, anchor: { offset: anchor.offset, top: range.getBoundingClientRect().top - panel.getBoundingClientRect().top } };
        }
        return null;
      }, before.positions.root.anchor);
      assert(reflowed && Math.abs(reflowed.anchor.top - before.positions.root.anchor.top) < 3, `Reflow restores the visible source character: ${JSON.stringify(reflowed)}`);
      await shot("reading-reflowed"); await closeReading();
      await page.reload({ waitUntil: "networkidle" }); await settle(page);
      assert.equal(await page.locator('#dialogue-reading-drawer[data-open="true"]').count(), 0, "Explicit close stays closed after refresh");
      result.reading = { before: before.positions.root, sameWidth, afterReflow: reflowed, closedAfterRefresh: true };

      await openRoot(false); await page.getByRole("button", { name: "组合", exact: true }).click();
      await page.getByRole("textbox", { name: "搜索种子", exact: true }).fill("绝无匹配的关键词");
      assert(await page.getByText("没有找到匹配的种子，换个词试试。", { exact: true }).isVisible());
      assert.equal(await page.getByText(/还没有可组合/).count(), 0); await shot("query-no-match");
      await page.getByRole("button", { name: "清空搜索", exact: true }).click();
      assert.equal(await page.getByRole("group", { name: "选择组合对象", exact: true }).getByRole("button").count(), 2);
      assert.equal(requests.length, 0); await closeReading(); result.search = "local clear restores both candidates without generating";

      if (spec.mobile) {
        const beforeReset = await snapshot(), session = await context.newCDPSession(page);
        for (let drag = 0; drag < 3; drag++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: 30, y: 310 }] });
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: 350, y: 460 }] });
          await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        const pan = await page.getByTestId("dialogue-stage-track").getAttribute("data-space-pan-x"); assert(Number(pan) > 500);
        await openPerspective(); await page.getByRole("button", { name: "复位视角与缩放", exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-stage-track"]').dataset.spacePanX === "0");
        const track = page.getByTestId("dialogue-stage-track"); assert.equal(await track.getAttribute("data-space-pan-y"), "0");
        assert.equal(await track.getAttribute("data-space-zoom"), "1"); assert.equal(await track.getAttribute("data-space-yaw"), "0");
        assert.deepEqual((await snapshot()).stageLayouts, beforeReset.stageLayouts); assert.deepEqual((await snapshot()).thinkingSpace, beforeReset.thinkingSpace);
        await shot("camera-reset"); await session.detach(); result.reset = { panBefore: Number(pan), restored: true, layoutUnchanged: true };
      } else {
        await openPerspective(); await page.getByRole("button", { name: "复位视角与缩放", exact: true }).waitFor(); await closePerspective();
      }

      const input = page.getByRole("textbox", { name: "输入", exact: true });
      await input.fill("花园维护的条件是什么？"); await page.getByRole("button", { name: "生成", exact: true }).click();
      const retry = page.getByRole("button", { name: "重试上次", exact: true }); await retry.waitFor();
      const alert = await page.getByRole("alert").filter({ has: retry }).innerText(); assert(!/OPENAI|API key|baseURL|切换.*模型|检查.*配置/i.test(alert));
      await input.fill("失败后继续完善的下一句"); await retry.click(); await retry.waitFor();
      assert.equal(requests[0].userText, requests[1].userText); assert.equal(await input.inputValue(), "失败后继续完善的下一句");
      assert.equal(Object.keys((await snapshot()).graph.nodes).length, 3); await shot("actionable-retry");
      result.errors = "retry sends previous request while preserving new draft and graph";
      assert.deepEqual(errors, []); assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      result.passed = true; console.log(JSON.stringify(result));
    } catch (error) {
      result.failure = String(error); await shot("failure").catch(() => {}); throw error;
    } finally { results.push(result); await context.close(); }
  }
} finally {
  await browser.close(); await writeFile(path.join(output, "summary.json"), JSON.stringify({ environment: "Chromium desktop and mobile touch viewport; controlled failures", results }, null, 2));
  console.log(JSON.stringify({ evidence: output }));
}
