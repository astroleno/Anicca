import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSynthesisSnapshot } from "./synthesis-common-parent.mjs";
import { synthesisColorFixture } from "./synthesis-colors.mjs";
import { thoughtFlowResponseFor } from "./thought-flow.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

const regionName = name => `下一个想法从「${name}」展开`;
const fieldSelector = '[data-testid="dialogue-stage-field"]';

async function tapRegion(page, name, { overlapsSeed = false } = {}) {
  const field = page.getByTestId("dialogue-stage-field");
  const button = field.getByRole("button", { name: regionName(name) });
  const target = await button.evaluate((button, overlapsSeed) => {
    const range = document.createRange();
    range.selectNodeContents(button.querySelector("span"));
    const rect = range.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const firstHit = document.elementFromPoint(x, y)?.closest("button") === button;
    const field = button.closest("[data-johari]");
    let behind;
    if (overlapsSeed) {
      field.style.visibility = "hidden";
      behind = document.elementFromPoint(x, y)?.closest("[data-metaball-surface]")?.dataset.metaballSurface;
      field.style.removeProperty("visibility");
    }
    return { x, y, firstHit, behind };
  }, overlapsSeed);
  assert(target.firstHit, `${name} text center must hit its button`);
  if (overlapsSeed) assert(target.behind, `${name} must overlap a real seed hit area in this fixture`);
  await page.touchscreen.tap(target.x, target.y);
  await field.getByRole("button", { name: regionName(name), pressed: true }).waitFor();
  assert.equal(await field.getByRole("button", { pressed: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "返回种子，收起阅读" }).isVisible(), false);
  return { name, ...target };
}

function fixture() {
  const snapshot = synthesisColorFixture("ab");
  snapshot.focusedNodeId = "root";
  snapshot.seedInstances = {};
  for (const id of ["result", "branch-b", "c"]) delete snapshot.graph.nodes[id];
  for (const node of Object.values(snapshot.graph.nodes)) node.children = node.children.filter(id => snapshot.graph.nodes[id]);
  snapshot.thinkingSpace = { version: 1, axes: [
    { id: "johari-self", label: "自己", negative: "自己不知道", positive: "自己知道", placement: "x", evidence: "self-report" },
    { id: "johari-others", label: "他人", negative: "他人不知道", positive: "他人知道", placement: "y", evidence: "self-report" }
  ], focus: {} };
  return snapshot;
}

async function exercise(browser, { baseUrl, outputDir, setActivePage, onOrdinaryExit }, outcome, fallback = false) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1,
    hasTouch: true, isMobile: true, reducedMotion: "no-preference" });
  await loadSynthesisSnapshot(context, fixture());
  await context.addInitScript(fallback => {
    localStorage.setItem("anicca.dialogue.renderer.v1", "original");
    if (fallback) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        return /^(?:experimental-)?webgl2?$/.test(kind) ? null : getContext.call(this, kind, ...options);
      };
    }
  }, fallback);
  const page = await context.newPage();
  setActivePage?.(page);
  const errors = [], steps = [];
  page.on("pageerror", error => errors.push(error.message));
  const field = page.getByTestId("dialogue-stage-field");
  const regions = () => field.getByRole("button").evaluateAll(buttons => buttons.map(button => ({
    text: button.innerText, pressed: button.getAttribute("aria-pressed") === "true"
  })));
  const capture = async name => {
    if (outcome !== "success") return;
    await waitForSeedLayout(page, { captions: true });
    await page.screenshot({ path: path.join(outputDir, `johari-${fallback ? "flat-" : ""}synthesis-${name}.png`) });
  };
  const visible = async (name, selected) => {
    await field.and(page.locator(":not([data-hidden])")).waitFor();
    const value = await regions();
    assert.equal(value.length, 4);
    assert.deepEqual(value.filter(region => region.pressed).map(region => region.text), selected ? [selected] : []);
    steps.push({ name, regions: value });
    await capture(name);
  };
  const absent = async name => {
    await field.waitFor({ state: "detached" });
    assert.equal(await page.locator(`${fieldSelector} button`).count(), 0);
    steps.push({ name, regions: [] });
    await capture(name);
  };
  const closeReading = () => page.getByRole("button", { name: "返回种子，收起阅读", exact: true }).tap();
  const pressTabThrough = async wanted => {
    const labels = [];
    await page.getByTestId("dialogue-stage-track").focus();
    for (let i = 0; i < 36; i++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      labels.push(label);
      if (label === wanted) return labels;
      if (wanted === undefined) assert(!label?.includes("区」展开"));
    }
    assert.equal(wanted, undefined, `Tab did not reach ${wanted}: ${JSON.stringify(labels)}`);
    return labels;
  };
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await page.route("**/api/synthesis", async route => {
      const body = route.request().postDataJSON();
      await hold;
      if (outcome === "cancel") {
        await route.abort().catch(() => {});
        return;
      }
      if (outcome === "failure") {
        await route.fulfill({ status: 502, json: { requestId: body.requestId, error: "invalid_model_output" } });
        return;
      }
      const json = outcome === "deferred" ? { requestId: body.requestId, outcome: "deferred", deferred: {
        reason: "这两个方向仍缺少可以共享的具体关系。", question: "你希望它们围绕什么问题相遇？"
      } } : thoughtFlowResponseFor("/api/synthesis", body, 1);
      await route.fulfill({ json });
    });
    await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.tap();
    await page.locator(`[data-metaball-renderer="${fallback ? "fallback" : "ready"}"]`).waitFor();
    const selections = outcome === "success" ? ["盲区", "公开区", "隐藏区", "未知区"]
      : outcome === "failure" ? [] : ["盲区"];
    const pressed = [];
    for (const name of selections) pressed.push(await tapRegion(page, name));
    if (pressed.length) steps.push({ name: "real-text-centers", pressed });
    const selected = selections.at(-1);
    await visible("before", selected);
    await page.getByTestId("dialogue-stage-node-a").tap();
    await page.getByRole("button", { name: "组合", exact: true }).tap();
    const options = page.getByRole("group", { name: "选择组合对象", exact: true });
    const inReading = await field.getAttribute("data-hidden");
    assert.equal(inReading, "true");
    assert.equal(await field.locator("button").count(), 4, "Unsubmitted preview keeps ordinary reading rules");
    await options.getByRole("button", { name: /照料土地/ }).tap();
    await page.getByTestId("dialogue-stage-pending-synthesis").waitFor();
    await absent("pending");
    await page.evaluate(selector => {
      window.__johariInsertions = 0;
      window.__johariObserver = new MutationObserver(records => {
        for (const record of records) for (const added of record.addedNodes) {
          if (added instanceof Element && (added.matches(selector) || added.querySelector(selector))) window.__johariInsertions++;
        }
      });
      window.__johariObserver.observe(document.querySelector('[data-testid="dialogue-stage-track"]'), { subtree: true, childList: true });
    }, fieldSelector);
    if (outcome === "cancel") {
      await page.getByTestId("dialogue-composer").getByRole("button", { name: /取消|停止/ }).tap();
    }
    release();
    if (outcome === "success") {
      await page.getByTestId("dialogue-synthesis-context").waitFor();
      await absent("result");
      await page.waitForFunction(() => {
        const summary = document.querySelector('[data-testid="dialogue-synthesis-context"] > p');
        return summary?.getAnimations().some(animation => animation.playState === "finished") && Number(getComputedStyle(summary).opacity) < .02;
      });
      await absent("after-summary");
      const hiddenTabOrder = await pressTabThrough();
      steps.push({ name: "result-tab-order", labels: hiddenTabOrder });
      await page.getByRole("button", { name: "展开来源", exact: true }).tap();
      await page.getByTestId("dialogue-source-context").waitFor();
      await absent("expanded");
      await page.getByRole("button", { name: "收起来源", exact: true }).tap();
      await page.getByTestId("dialogue-synthesis-context").waitFor();
      await absent("collapsed");
      const insertions = await page.evaluate(() => {
        window.__johariObserver.disconnect();
        return window.__johariInsertions;
      });
      assert.equal(insertions, 0, "The field reappeared during a synthesis transition");
      await page.getByTestId("dialogue-stage-node-branch-a").tap();
      await page.getByTestId("dialogue-panel").waitFor();
      await closeReading();
    } else if (outcome === "deferred") {
      await page.getByTestId("deferred-encounter").waitFor();
      await closeReading();
    } else if (outcome === "failure") {
      await page.getByTestId("dialogue-composer").getByRole("button", { name: /重试/ }).waitFor();
    }
    await visible("exit", selected);
    if (outcome === "success") {
      if (!fallback) await onOrdinaryExit?.(page);
      const nextRegion = "公开区";
      const keyboardOrder = await pressTabThrough(regionName(nextRegion));
      await page.keyboard.press("Enter");
      await visible("keyboard-selected", nextRegion);
      const spaceOrder = await pressTabThrough(regionName("隐藏区"));
      await page.keyboard.press("Space");
      await visible("space-selected", "隐藏区");
      await pressTabThrough(regionName("隐藏区"));
      await page.keyboard.press("Space");
      await visible("space-reset");
      steps.push({ name: "ordinary-tab-order", labels: keyboardOrder, spaceLabels: spaceOrder });
    }
    assert.deepEqual(errors, []);
    return { outcome: fallback ? `flat-${outcome}` : outcome, steps, errors };
  } finally {
    release();
    await context.close();
  }
}

export async function runJohariSynthesis(browser, options) {
  const results = [];
  for (const outcome of ["success", "failure", "cancel", "deferred"]) {
    results.push(await exercise(browser, options, outcome));
    await writeFile(path.join(options.outputDir, "johari-synthesis-measurements.json"), JSON.stringify(results, null, 2));
  }
  results.push(await exercise(browser, options, "success", true));
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  try {
    const snapshot = synthesisColorFixture("ab");
    snapshot.thinkingSpace = fixture().thinkingSpace;
    snapshot.graph.nodes.result.kind = "merge";
    delete snapshot.graph.nodes.result.branchType;
    await loadSynthesisSnapshot(context, snapshot);
    const page = await context.newPage();
    options.setActivePage?.(page);
    await page.goto(`${options.baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.tap();
    await page.locator('[data-metaball-renderer="ready"][data-synthesis-stage="true"]').waitFor();
    await page.getByTestId("dialogue-stage-field").waitFor({ state: "detached" });
    await page.getByTestId("dialogue-stage-node-result").tap();
    await page.getByTestId("dialogue-panel").getByRole("heading", { name: "共同改写约定" }).waitFor();
    await page.getByTestId("dialogue-stage-field").waitFor({ state: "detached" });
    results.push({ outcome: "legacy", steps: [{ name: "result", regions: [] }, { name: "reading-result", regions: [] }] });
  } finally {
    await context.close();
  }
  const overlap = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1,
    hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  try {
    const snapshot = fixture();
    snapshot.focusedNodeId = "branch-a";
    snapshot.stageLayouts = { [`seeds:${snapshot.workspaceId}`]: {
      nodePositions: {}, pan: { x: 0, y: 0 }, compact: { pan: { x: 0, y: 0 }, nodePositions: {
        "branch-a": { x: 70, y: 25 }, root: { x: 18, y: 56 }, a: { x: 44, y: 47 }, b: { x: 73, y: 65 }
      } }
    } };
    await loadSynthesisSnapshot(overlap, snapshot);
    await overlap.addInitScript(() => localStorage.setItem("anicca.dialogue.renderer.v1", "original"));
    const page = await overlap.newPage();
    options.setActivePage?.(page);
    await page.goto(`${options.baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.tap();
    await page.locator('[data-metaball-renderer="ready"]').waitFor();
    await waitForSeedLayout(page, { captions: true });
    const target = await tapRegion(page, "未知区", { overlapsSeed: true });
    assert.equal(target.behind, "root");
    await page.screenshot({ path: path.join(options.outputDir, "johari-region-overlap.png") });
    const nearby = await page.getByTestId("dialogue-stage-node-root").evaluate(node => {
      const box = node.getBoundingClientRect();
      const x = box.x + box.width * .8, y = box.y + box.height * .5;
      return { x, y, firstHit: document.elementFromPoint(x, y)?.closest("button") === node };
    });
    assert(nearby.firstHit, "The seed remains reachable beside the overlapping region");
    await page.touchscreen.tap(nearby.x, nearby.y);
    await page.getByTestId("dialogue-panel").getByRole("heading", { name: "早期共同问题" }).waitFor();
    results.push({ outcome: "overlap", steps: [{ name: "real-unknown-tap", target }, { name: "nearby-seed-tap", nearby }] });
  } finally {
    await overlap.close();
  }
  await writeFile(path.join(options.outputDir, "johari-synthesis-measurements.json"), JSON.stringify(results, null, 2));
  return { name: "johari-synthesis", passed: true, cases: results.length };
}
