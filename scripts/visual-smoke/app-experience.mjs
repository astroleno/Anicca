import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { thoughtFlowFixture } from "./thought-flow.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function snapshot(page) {
  return page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight ? document.elementFromPoint(x, y) : null;
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom,
        visibleHeight: Math.max(0, Math.min(r.bottom, visualViewport.height) - Math.max(r.y, 0)),
        hittable: Boolean(hit && (element === hit || element.contains(hit))) };
    };
    const panel = document.querySelector('[data-testid="dialogue-panel"]');
    return { url: location.href, width: innerWidth, height: visualViewport.height, scrollY,
      scrollWidth: document.documentElement.scrollWidth, shell: box('[data-testid="dialogue-shell"]'),
      input: box("#dialogue-input"), header: box("h1"),
      reading: document.querySelector("#dialogue-reading-drawer")?.dataset.open === "true",
      mode: panel?.dataset.mode, scrollTop: panel?.scrollTop,
      menu: document.querySelector('[data-testid="dialogue-more-button"]')?.getAttribute("aria-expanded") === "true",
      focusId: document.activeElement?.id, focusText: document.activeElement?.textContent?.trim() };
  });
}

function assertInputVisible(state) {
  assert(Math.abs(state.shell.height - state.height) < 1, `Shell fits the visual viewport: ${JSON.stringify(state)}`);
  assert(state.input.height >= 44 && state.input.visibleHeight >= state.input.height - 1 && state.input.hittable,
    `Input is visible and hittable before any autofocusing fill: ${JSON.stringify(state)}`);
  assert(state.header.y >= 0 && state.header.bottom <= state.height, "Header remains in the viewport");
  assert.equal(state.scrollY, 0, "Input does not rely on scrolling the entire scene");
  assert(state.scrollWidth <= state.width + 1, "No document horizontal overflow");
}

async function ready(page) {
  await page.getByTestId("dialogue-composer").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await settle(page);
}

async function resize(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(height => getComputedStyle(document.querySelector('[data-testid="dialogue-shell"]'))
    .getPropertyValue("--dialogue-viewport-height").trim() === `${height}px`, height);
  await settle(page);
}

// Fresh isolated workspaces; no provider calls or mutations to existing users.
export async function runAppExperience(browser, { baseUrl, outputDir, setActivePage }) {
  const results = [];
  await mkdir(outputDir, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
    const page = await context.newPage(); setActivePage(page); page.setDefaultTimeout(30_000);
    const result = { name: "input-boundaries", passed: false, states: [], errors: [] }; results.push(result);
    page.on("pageerror", error => result.errors.push(error.message));
    try {
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200); assert(await page.title()); await ready(page);
      for (const [width, height] of [[768, 1024], [680, 700], [681, 700], [980, 700], [981, 700], [844, 390], [844, 700], [320, 568]]) {
        await resize(page, width, height);
        const state = await snapshot(page); result.states.push({ name: `empty-${width}-${height}`, ...state }); assertInputVisible(state);
        if (width === 768 || (width === 844 && height === 390) || width === 320) {
          await page.screenshot({ path: path.join(outputDir, `app-input-${width}-${height}.png`) });
        }
      }
      const field = page.getByRole("textbox", { name: "输入", exact: true });
      const draft = "保留尚未完成的想法";
      await field.fill(draft); await settle(page);
      const typing = await snapshot(page); result.states.push({ name: "typing", ...typing }); assertInputVisible(typing);
      await page.touchscreen.tap(40, 36); await settle(page);
      const blurred = await snapshot(page); result.states.push({ name: "blurred", ...blurred }); assertInputVisible(blurred);
      await resize(page, 768, 1024);
      await page.reload({ waitUntil: "networkidle" }); await ready(page);
      await page.waitForFunction(draft => document.querySelector("#dialogue-input")?.value === draft, draft);
      const restored = await snapshot(page); result.states.push({ name: "draft-refresh", ...restored }); assertInputVisible(restored);
      assert.deepEqual(result.errors, []); result.passed = true;
    } catch (error) {
      result.failure = String(error); await page.screenshot({ path: path.join(outputDir, "app-input-failure.png") }).catch(() => {}); throw error;
    } finally { await context.close(); setActivePage(null); }

    for (const spec of [{ name: "desktop", width: 1440, height: 900, touch: false },
      { name: "mobile", width: 390, height: 844, touch: true }]) {
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: spec.touch, hasTouch: spec.touch });
      await context.addInitScript(fixture => {
        if (!localStorage.getItem("anicca_workspace_active_v1")) localStorage.setItem("anicca_workspace_v2", JSON.stringify(fixture));
        localStorage.setItem("anicca:seed-guide:v1", "done");
      }, thoughtFlowFixture);
      const page = await context.newPage(); setActivePage(page); page.setDefaultTimeout(30_000);
      const result = { name: `escape-${spec.name}`, passed: false, states: [], errors: [] }; results.push(result);
      page.on("pageerror", error => result.errors.push(error.message));
      const note = async name => { await settle(page); const state = await snapshot(page); result.states.push({ name, ...state }); return state; };
      const open = async () => {
        await waitForSeedLayout(page); await page.getByTestId("dialogue-stage-node-root").locator("[data-seed-caption]").click();
        await page.locator('#dialogue-reading-drawer[data-open="true"]').waitFor();
        await page.waitForFunction(() => getComputedStyle(document.querySelector("#dialogue-reading-drawer")).opacity === "1");
        await page.getByTestId("dialogue-panel").evaluate(panel => { panel.scrollTop = 650; panel.dispatchEvent(new Event("scroll")); });
        await settle(page);
      };
      try {
        await page.goto(baseUrl, { waitUntil: "networkidle" }); await ready(page); await open();
        const more = page.getByRole("button", { name: "更多", exact: true }); await more.click();
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "重命名工作区");
        await page.keyboard.press("Escape"); const menuClosed = await note("menu-only-closed");
        assert(menuClosed.reading && !menuClosed.menu); assert.equal(menuClosed.scrollTop, 650);
        assert.equal(menuClosed.focusText, "更多");
        await page.screenshot({ path: path.join(outputDir, `app-${spec.name}-after-menu-escape.png`) });
        await page.keyboard.press("Escape"); await page.locator("#dialogue-reading-drawer").waitFor({ state: "hidden" });

        for (const target of ["heading", "return", "radio"]) {
          await open();
          // Preserve the pre-choice reading anchor while testing the keyboard path.
          await page.getByRole("button", { name: "沿极性展开", exact: true }).evaluate(button => button.focus({ preventScroll: true }));
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.activeElement?.id === "conversation-panel-heading"
            && document.querySelector('[data-testid="dialogue-panel"]')?.dataset.mode === "polarity");
          if (target === "return") await page.getByRole("button", { name: "返回种子阅读", exact: true }).focus();
          if (target === "radio") await page.locator("#seed-polarity-picker input").first().focus();
          await page.keyboard.press("Escape"); const returned = await note(`polarity-${target}-closed`);
          assert(returned.reading && returned.mode === "read"); assert.equal(returned.scrollTop, 650);
          assert(returned.focusText?.includes("沿极性展开"));
          await page.keyboard.press("Escape"); await page.locator("#dialogue-reading-drawer").waitFor({ state: "hidden" });
          const closed = await note(`reading-after-${target}-closed`); assert.equal(closed.reading, false);
        }

        for (const label of ["换个角度", "演化全景"]) {
          await open(); await page.getByRole("button", { name: label, exact: true }).click();
          if (label === "换个角度") await page.getByRole("dialog").waitFor();
          else await page.getByTestId("evolution-overview").waitFor();
          await page.keyboard.press("Escape");
          const returned = await note(`${label}-closed`); assert(returned.reading); assert.equal(returned.scrollTop, 650);
          assert((await page.getByRole("button", { name: label, exact: true }).evaluate(button => button === document.activeElement)));
          await page.keyboard.press("Escape"); await page.locator("#dialogue-reading-drawer").waitFor({ state: "hidden" });
        }
        if (!spec.touch) {
          for (const [width, height] of [[680, 700], [681, 700], [768, 1024], [844, 700], [980, 700], [981, 700], [844, 390]]) {
            await resize(page, width, height); const resized = await note(`existing-window-${width}-${height}`); assertInputVisible(resized);
          }
          await resize(page, 844, 700);
          await page.reload({ waitUntil: "networkidle" }); await ready(page); const refreshed = await note("existing-refresh-844"); assertInputVisible(refreshed);
        }
        assert.deepEqual(result.errors, []); result.passed = true;
      } catch (error) {
        result.failure = String(error); await page.screenshot({ path: path.join(outputDir, `app-${spec.name}-failure.png`) }).catch(() => {}); throw error;
      } finally { await context.close(); setActivePage(null); }
    }
    return { name: "app-experience", results };
  } finally {
    await writeFile(path.join(outputDir, "app-experience.json"), `${JSON.stringify({ baseUrl, results }, null, 2)}\n`);
  }
}

async function main() {
  const urls = (process.env.ANICCA_QA_URLS || "http://127.0.0.1:48842/Anicca").split(",");
  const output = process.env.ANICCA_QA_OUTPUT || `/tmp/anicca-app-experience-${Date.now()}`;
  const browser = await chromium.launch({ headless: true,
  ...(process.env.DIALOGUE_SMOKE_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.DIALOGUE_SMOKE_BROWSER_EXECUTABLE_PATH } : {}), args: process.platform === "darwin" ? ["--use-angle=metal"]
    : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"] });
  try {
    for (const [index, baseUrl] of urls.entries()) {
      const outputDir = path.join(output, `${index}-${new URL(baseUrl).hostname}`);
      const result = await runAppExperience(browser, { baseUrl, outputDir, setActivePage() {} });
      console.log(JSON.stringify({ baseUrl, passed: result.results.every(item => item.passed), evidence: outputDir }));
    }
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
