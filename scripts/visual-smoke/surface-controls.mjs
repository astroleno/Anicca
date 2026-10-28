import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { thoughtFlowResponseFor } from "./thought-flow.mjs";
import { runLiquidSurface } from "./liquid-surface.mjs";

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function geometry(page) {
  return page.evaluate(() => {
    const visible = element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== "hidden"; };
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const navigation = document.querySelector('[data-testid="dialogue-navigation"]');
    const field = document.querySelector("#dialogue-input"), form = field.closest("form"), style = getComputedStyle(field);
    const panel = document.querySelector('[data-testid="dialogue-panel"]');
    return { width: innerWidth, navigation: box(navigation), controls: [...navigation.querySelectorAll("h1, button")].filter(visible).map(element => ({ text: element.textContent.trim(), ...box(element) })),
      input: { ...box(field), radius: style.borderRadius, outline: style.outlineStyle, fontSize: style.fontSize,
        lineBottom: box(field.closest("label")).bottom, actionsBottom: box(form.querySelector('button[type="submit"]').parentElement).bottom,
        formRadius: getComputedStyle(form).borderRadius, background: getComputedStyle(form).backgroundColor,
        underline: getComputedStyle(field.closest("label")).borderBottomWidth },
      reader: panel ? box(panel) : null,
      pending: [...document.querySelectorAll('[data-liquid-pending="true"]')].map(element => element.dataset.metaballSurface),
      backend: document.querySelector('[data-testid="dialogue-metaball-canvas"]')?.dataset.rendererBackend,
      overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}

function assertGeometry(state) {
  assert(!state.overflow);
  for (const [index, control] of state.controls.entries()) {
    assert(control.x >= 0 && control.right <= state.width, `Navigation fits: ${JSON.stringify(state)}`);
    for (const other of state.controls.slice(index + 1)) {
      assert(Math.min(control.right, other.right) - Math.max(control.x, other.x) <= 0 ||
        Math.min(control.bottom, other.bottom) - Math.max(control.y, other.y) <= 0, "Navigation controls do not overlap");
    }
  }
  assert.equal(state.input.radius, "0px"); assert.equal(state.input.formRadius, "0px");
  assert.equal(state.input.background, "rgba(0, 0, 0, 0)"); assert.equal(state.input.outline, "none");
  assert(parseFloat(state.input.underline) >= 1); assert(parseFloat(state.input.fontSize) >= 16);
  assert(Math.abs(state.input.lineBottom - state.input.actionsBottom) <= 1, "Input and actions share one baseline");
  if (state.reader) assert(state.reader.y >= state.navigation.bottom, "Reader stays below navigation");
}

export async function runSurfaceControls(browser, { baseUrl, outputDir, setActivePage }) {
  await mkdir(outputDir, { recursive: true }); const results = [];
  try {
    for (const spec of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
      for (const variant of ["original", "tsl", "tsl-webgl", ...(spec.name === "mobile" ? ["reduced-motion"] : [])]) {
        const reduced = variant === "reduced-motion", mode = reduced ? "original" : variant;
        const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.width < 500, isMobile: spec.width < 500, deviceScaleFactor: 1,
          reducedMotion: reduced ? "reduce" : "no-preference" });
        await context.addInitScript(mode => { localStorage.setItem("anicca.dialogue.renderer.v1", mode); localStorage.setItem("anicca:seed-guide:v1", "done"); }, mode);
        if (reduced) await context.addInitScript(() => {
          const locations = new WeakSet(), prototype = WebGL2RenderingContext.prototype;
          const locate = prototype.getUniformLocation, set = prototype.uniform1f;
          window.__surfaceTimes = [];
          prototype.getUniformLocation = function (program, name) {
            const location = locate.call(this, program, name);
            if (location && name === "time") locations.add(location);
            return location;
          };
          prototype.uniform1f = function (location, value) {
            if (location && locations.has(location)) window.__surfaceTimes.push(value);
            return set.call(this, location, value);
          };
        });
        const page = await context.newPage(); setActivePage(page); const errors = [], states = [];
        const result = { name: `${spec.name}-${variant}`, passed: false, errors, states }; results.push(result);
        page.on("pageerror", error => errors.push(error.message)); page.setDefaultTimeout(30_000);
        let release, calls = 0;
        await page.route("**/api/branches", async route => {
          const body = route.request().postDataJSON(), sequence = ++calls;
          await new Promise(resolve => { release = resolve; });
          if (sequence === 2) return route.fulfill({ status: 502, json: { error: "branches_failed", details: "provider_overloaded" } });
          return route.fulfill({ json: thoughtFlowResponseFor("/api/branches", body, sequence) });
        });
        const note = async name => { await settle(page); const state = { name, ...await geometry(page) }; states.push(state); assertGeometry(state); return state; };
        try {
          const response = await page.goto(baseUrl, { waitUntil: "networkidle" }); assert.equal(response.status(), 200); assert(await page.title());
          await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-metaball-canvas"]')?.dataset.rendererState === "ready");
          if (mode === "original") for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [980, 700], [981, 700], [844, 390], [1440, 900]]) {
            await page.setViewportSize({ width, height }); await note(`navigation-${width}-${height}`);
          }
          await page.setViewportSize({ width: spec.width, height: spec.height });
          const input = page.getByRole("textbox", { name: "输入", exact: true }); await input.fill("让花园的开放用途与共同维护一起生长");
          await note("line-input-focused"); await page.getByRole("button", { name: "生成", exact: true }).click();
          await page.getByTestId("dialogue-stage-pending-root").waitFor();
          const pending = await note("generation-surface"); assert(pending.pending.length >= 3);
          await page.waitForTimeout(250); await page.screenshot({ path: path.join(outputDir, `surface-${result.name}-pending.png`) });
          if (reduced) {
            await page.waitForTimeout(300);
            result.reducedTimes = await page.evaluate(() => window.__surfaceTimes);
            assert(result.reducedTimes.length > 0 && result.reducedTimes.every(time => time === 0),
              "Reduced-motion grain always receives a frozen shader clock, including redraws");
          }
          release(); await page.getByTestId("dialogue-stage-primary-actions").waitFor();
          assert.deepEqual((await note("complete")).pending, []);
          const stageActions = page.getByTestId("dialogue-stage-primary-actions");
          assert.equal(await stageActions.getByRole("group", { name: "种子基本操作" }).getByRole("button").count(), 3);
          await stageActions.getByRole("button", { name: "极性分裂", exact: true }).click();
          await page.getByRole("heading", { name: "沿极性展开" }).waitFor(); await note("direct-polarity");
          await page.keyboard.press("Escape"); await page.getByRole("button", { name: "返回种子，收起阅读" }).click();
          await input.fill("等待中继续写"); await page.getByRole("button", { name: "生成", exact: true }).click();
          await page.getByTestId("dialogue-stage-pending-thesis").waitFor(); await note("pending-failure");
          release(); await page.getByRole("button", { name: "重试上次" }).waitFor();
          assert.deepEqual((await note("failed")).pending, []);
          await page.getByRole("button", { name: "重试上次" }).click(); await page.getByTestId("dialogue-stage-pending-thesis").waitFor();
          await page.getByRole("button", { name: "取消", exact: true }).click(); release();
          assert.deepEqual((await note("cancelled")).pending, []);
          await page.screenshot({ path: path.join(outputDir, `surface-${result.name}-line.png`) });
          assert.deepEqual(errors, []); result.passed = true;
        } finally { release?.(); await context.close(); setActivePage(null); }
      }
    }
    return { name: "surface-controls", results };
  } finally { await writeFile(path.join(outputDir, "surface-controls.json"), `${JSON.stringify({ baseUrl, results }, null, 2)}\n`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal"] : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"] });
  try {
    for (const [index, baseUrl] of (process.env.ANICCA_QA_URLS || "http://127.0.0.1:48843/Anicca").split(",").entries()) {
      const result = await runSurfaceControls(browser, { baseUrl, outputDir: path.join(process.env.ANICCA_QA_OUTPUT || "/tmp/anicca-surface-controls", `${index}-${new URL(baseUrl).hostname}`), setActivePage() {} });
      console.log(JSON.stringify({ baseUrl, passed: result.results.every(item => item.passed) }));
    }
    await runLiquidSurface(browser, { outputDir: path.join(process.env.ANICCA_QA_OUTPUT || "/tmp/anicca-surface-controls", "liquid-regression"), setActivePage() {} });
  } finally { await browser.close(); }
}
