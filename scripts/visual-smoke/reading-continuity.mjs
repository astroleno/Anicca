import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { thoughtFlowFixture, thoughtFlowResponseFor } from "./thought-flow.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function state(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="dialogue-panel"]');
    const back = document.querySelector('button[aria-label="返回种子，收起阅读"]');
    const rect = back?.getBoundingClientRect(), focus = document.activeElement;
    const hit = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
    return { url: location.href, title: document.title, reading: document.querySelector('#dialogue-reading-drawer')?.dataset.open === "true",
      heading: document.querySelector("#conversation-panel-heading")?.textContent, scrollTop: panel?.scrollTop,
      focus: { tag: focus?.tagName, id: focus?.id, text: focus?.textContent?.trim().slice(0, 80) },
      draft: document.querySelector("#dialogue-input")?.value,
      workspaceId: localStorage.getItem("anicca_workspace_active_v1"),
      workspaceTitle: document.querySelector('[data-testid="dialogue-workspace-bar"] strong')?.textContent,
      rename: document.querySelector('input[aria-label="工作区名称"]')?.value,
      arrival: Boolean(document.querySelector('button[aria-label="阅读新回应"]')),
      back: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height,
        visible: rect.top >= 0 && rect.bottom <= visualViewport.height, hittable: hit === back || back.contains(hit) } : null };
  });
}

async function anchor(page, offset) {
  return page.evaluate(wanted => {
    const panel = document.querySelector('[data-testid="dialogue-panel"]'), box = panel.getBoundingClientRect();
    const points = [];
    for (const passage of panel.querySelectorAll("[data-seed-passage] [data-passage-start]")) {
      const start = Number(passage.dataset.passageStart), walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
      let node, position = start;
      while ((node = walker.nextNode())) {
        const text = node.textContent || "";
        for (let index = 0; index < text.length; index++) {
          if (wanted !== null && position + index !== wanted) continue;
          const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
          const r = range.getBoundingClientRect();
          if (wanted !== null) return { offset: wanted, top: r.top - box.top };
          if (r.bottom >= box.top + 24 && r.top < box.bottom && r.height) {
            points.push({ offset: position + index, top: r.top - box.top }); break;
          }
        }
        position += text.length;
        if (points.length) break;
      }
      if (points.length) break;
    }
    return points[0] || null;
  }, offset ?? null);
}

async function settleScroll(page) {
  await page.evaluate(() => new Promise(resolve => {
    const panel = document.querySelector('[data-testid="dialogue-panel"]');
    let previous = panel.scrollTop, stable = 0, frames = 0;
    const check = () => {
      stable = Math.abs(panel.scrollTop - previous) < .5 ? stable + 1 : 0;
      previous = panel.scrollTop;
      if (stable >= 8 || ++frames >= 150) resolve(); else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }));
}

/** Controlled responses verify attention and workspace ownership, with no provider calls. */
export async function runReadingContinuity(browser, { baseUrl, outputDir, setActivePage }) {
  const results = []; await mkdir(outputDir, { recursive: true });
  try {
    for (const spec of [{ name: "desktop", width: 1440, height: 900, touch: false },
      { name: "mobile", width: 390, height: 844, touch: true }]) {
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch });
      await context.addInitScript(fixture => {
        if (!localStorage.getItem("anicca_workspace_active_v1")) localStorage.setItem("anicca_workspace_v2", JSON.stringify(fixture));
        localStorage.setItem("anicca:seed-guide:v1", "done");
      }, thoughtFlowFixture);
      const page = await context.newPage(); setActivePage(page); page.setDefaultTimeout(30_000);
      const result = { name: spec.name, passed: false, states: [], calls: [], errors: [] }; results.push(result);
      page.on("pageerror", error => result.errors.push(error.message));
      let release, held;
      await page.route("**/api/inquiry", async route => {
        const body = route.request().postDataJSON(); result.calls.push({ requestId: body.requestId, controlled: true });
        await held;
        await route.fulfill({ json: thoughtFlowResponseFor("/api/inquiry", body, result.calls.length) });
      });
      const note = async (name, screenshot = false) => {
        await frame(page); const value = { name, ...await state(page) }; result.states.push(value);
        if (screenshot) await page.screenshot({ path: path.join(outputDir, `reading-${spec.name}-${name}.png`) });
        return value;
      };
      const close = async () => {
        const back = page.getByRole("button", { name: "返回种子，收起阅读", exact: true });
        if (await back.isVisible()) await back.click();
        await page.locator("#dialogue-reading-drawer").waitFor({ state: "hidden" });
      };
      const open = async () => {
        await close(); await waitForSeedLayout(page);
        const root = page.getByTestId("dialogue-stage-node-root");
        if (!await root.count()) {
          await page.getByRole("button", { name: "演化全景", exact: true }).click();
          const overview = page.getByTestId("evolution-overview");
          const text = thoughtFlowFixture.graph.nodes.root.text.slice(0, 18);
          await overview.getByRole("textbox", { name: "搜索想法或极性" }).fill(text);
          await overview.getByRole("button").filter({ hasText: text }).click();
          await overview.getByRole("button", { name: "进入种子", exact: true }).click();
        } else await root.locator("[data-seed-caption]").click();
        await page.waitForFunction(() => document.querySelector('#dialogue-reading-drawer[data-open="true"]')
          && getComputedStyle(document.querySelector("#dialogue-reading-drawer")).opacity === "1");
      };
      const moreAction = async name => {
        await page.getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("button", { name, exact: true }).click();
      };
      try {
        const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
        assert.equal(response.status(), 200); assert(await page.title());
        for (const action of ["idle", "programmatic", "scroll", "keyboard", "edit"]) {
          await open();
          await page.getByRole("button", { name: "选一句追问", exact: true }).click();
          await page.getByLabel("选择要追问的原句").getByRole("button").nth(1).click();
          await page.getByRole("button", { name: "追问前提", exact: true }).click();
          await page.getByRole("textbox", { name: "输入", exact: true }).fill("这些开放的角落依赖什么共同条件？");
          held = new Promise(resolve => { release = resolve; }); const count = result.calls.length;
          await page.getByRole("button", { name: "追问", exact: true }).click();
          await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-composer"]')?.getAttribute("aria-busy") === "true");
          while (result.calls.length === count) await frame(page);
          await note(`${action}-pending`);
          if (action === "scroll") {
            if (spec.touch) {
              const session = await context.newCDPSession(page);
              await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 580 }] });
              for (let step = 1; step <= 10; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 580 - step * 30 }] });
              await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            } else {
              const r = await page.getByTestId("dialogue-panel").boundingBox();
              await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.wheel(0, 650);
            }
            await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-panel"]').scrollTop > 100);
            await settleScroll(page);
          } else if (action === "keyboard") {
            await page.locator("#conversation-panel-heading").focus(); await page.keyboard.press("PageDown"); await settleScroll(page);
          } else if (action === "programmatic") {
            await page.getByTestId("dialogue-panel").evaluate(el => { el.scrollTop = 420; el.dispatchEvent(new Event("scroll")); });
          } else if (action === "edit") await page.getByRole("textbox", { name: "输入", exact: true }).fill("等待时先保留下一条问题");
          const before = await note(`${action}-before-response`, action === "scroll");
          const position = ["scroll", "keyboard"].includes(action) ? await anchor(page) : null;
          if (position) before.anchor = position;
          release();
          await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-composer"]')?.getAttribute("aria-busy") === "false");
          const after = await note(`${action}-after-response`, action === "scroll");
          if (["scroll", "keyboard", "edit"].includes(action)) {
            assert.equal(after.heading, before.heading); assert(after.reading && after.arrival);
            assert.deepEqual(after.focus, before.focus, "Completion keeps the reader's focus");
            if (position) {
              const restored = await anchor(page, position.offset);
              after.anchor = restored;
              assert(restored && Math.abs(restored.top - position.top) <= 2, `Reading line is preserved: ${JSON.stringify({ action, position, restored })}`);
            }
            if (action === "edit") assert.equal(after.draft, "等待时先保留下一条问题");
            await page.getByRole("button", { name: "阅读新回应", exact: true }).click();
            await page.waitForFunction(() => document.querySelector("#conversation-panel-heading")?.textContent === "协商的余地");
            assert.equal(await page.getByRole("button", { name: "阅读新回应", exact: true }).count(), 0);
            if (action === "edit") {
              assert.equal(await page.getByRole("textbox", { name: "输入", exact: true }).inputValue(), "等待时先保留下一条问题");
              await page.getByRole("textbox", { name: "输入", exact: true }).fill("");
              await page.getByRole("button", { name: "写新想法", exact: true }).click();
            }
          } else assert.equal(after.heading, "协商的余地", "Idle and programmatic restoration retain automatic follow");
        }
        await open();
        for (const [width, height] of [[spec.width, spec.height], ...(spec.touch ? [[320, 568], [844, 390]] : [[768, 1024]])]) {
          await page.setViewportSize({ width, height }); await frame(page);
          for (const [label, top] of [["middle", 650], ["bottom", 100_000]]) {
            await page.getByTestId("dialogue-panel").evaluate((el, top) => { el.scrollTop = top; el.dispatchEvent(new Event("scroll")); }, top);
            const value = await note(`return-${width}-${height}-${label}`, true);
            assert(value.back?.visible && value.back.hittable && value.back.height >= 44, "Return stays visible and hittable while reading");
          }
        }
        await page.setViewportSize({ width: spec.width, height: spec.height }); await frame(page);
        await page.getByTestId("dialogue-panel").evaluate(el => { el.scrollTop = 650; el.dispatchEvent(new Event("scroll")); });
        await close(); await open(); assert.equal((await state(page)).scrollTop, 650);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForFunction(() => document.querySelector('#dialogue-reading-drawer[data-open="true"]'));
        assert.equal((await note("reading-refresh", true)).scrollTop, 650);
        const original = await state(page);
        await moreAction("新建工作区"); const existing = await note("workspace-b-created"); await close();
        await moreAction(original.workspaceTitle); await moreAction("重命名工作区");
        await page.getByRole("textbox", { name: "工作区名称", exact: true }).fill("A 尚未提交的标题");
        await moreAction(existing.workspaceTitle);
        assert.equal((await note("rename-existing-switch", true)).rename, undefined);
        await moreAction("重命名工作区");
        assert.equal(await page.getByRole("textbox", { name: "工作区名称", exact: true }).inputValue(), existing.workspaceTitle);
        await page.getByRole("textbox", { name: "工作区名称", exact: true }).fill("B 的独立名称");
        await page.getByRole("button", { name: "保存工作区名称", exact: true }).click();
        await moreAction(original.workspaceTitle); await moreAction("重命名工作区");
        assert.equal(await page.getByRole("textbox", { name: "工作区名称", exact: true }).inputValue(), original.workspaceTitle);
        await page.getByRole("textbox", { name: "工作区名称", exact: true }).fill("A 仍未提交的标题");
        await moreAction("新建工作区");
        const created = await note("rename-new-workspace", true); assert.equal(created.rename, undefined);
        assert.equal(created.workspaceTitle, "未命名工作区");
        assert.deepEqual(result.errors, []); result.passed = true;
      } catch (error) {
        result.failure = String(error); await page.screenshot({ path: path.join(outputDir, `reading-${spec.name}-failure.png`) }).catch(() => {}); throw error;
      } finally { release?.(); await context.close(); setActivePage(null); }
    }
    return { name: "reading-continuity", results };
  } finally { await writeFile(path.join(outputDir, "reading-continuity.json"), `${JSON.stringify({ baseUrl, results }, null, 2)}\n`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = process.env.ANICCA_QA_OUTPUT || `/tmp/anicca-reading-continuity-${Date.now()}`;
  const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal"]
    : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"] });
  try {
    for (const [index, baseUrl] of (process.env.ANICCA_QA_URLS || "http://127.0.0.1:48842/Anicca").split(",").entries()) {
      const folder = path.join(outputDir, `${index}-${new URL(baseUrl).hostname}`);
      await runReadingContinuity(browser, { baseUrl, outputDir: folder, setActivePage() {} });
      console.log(JSON.stringify({ baseUrl, passed: true, evidence: folder }));
    }
  } finally { await browser.close(); }
}
