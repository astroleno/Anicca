import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { runJohariSynthesis } from "./johari-synthesis.mjs";
import { loadSynthesisSnapshot } from "./synthesis-common-parent.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

const viewport = { width: 320, height: 568 };
const stage = '[data-testid="dialogue-stage-track"]';
const backend = { original: "original", tsl: "webgpu", flat: "unavailable" };
const gap = (rect, drop) => Math.hypot(Math.max(0, rect.left - drop.x, drop.x - rect.right),
  Math.max(0, rect.top - drop.y, drop.y - rect.bottom)) - drop.radius;
const closeReading = page => page.getByRole("button", { name: "返回种子，收起阅读", exact: true }).click();

function readSnapshot(page) {
  return page.evaluate(() => {
    const id = localStorage.getItem("anicca_workspace_active_v1");
    return JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${id}`));
  });
}

function compactPositions(snapshot) {
  return snapshot.stageLayouts[`seeds:${snapshot.workspaceId}`].compact.nodePositions;
}

async function inspect(page, renderer, compact) {
  await page.locator(`${stage}[data-metaball-renderer="${renderer === "flat" ? "fallback" : "ready"}"]`).waitFor();
  await waitForSeedLayout(page, { captions: true });
  const view = await page.locator(stage).evaluate(track => {
    const rect = element => element.getBoundingClientRect().toJSON();
    const canvas = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
    const rendered = JSON.parse(canvas?.dataset.spaceNodes || "[]");
    const bounds = canvas && rect(canvas);
    return {
      backend: canvas?.dataset.rendererBackend,
      bounds: rect(track),
      drops: [...track.querySelectorAll("button[data-metaball-surface]")].map(element => {
        const id = element.dataset.metaballSurface, node = rendered.find(item => item.id === id);
        const body = rect(element), hit = rect(element.querySelector("[data-seed-hit-area]"));
        const centerHit = document.elementFromPoint(body.x + body.width / 2, body.y + body.height / 2)
          ?.closest("button") === element;
        const title = element.querySelector("[data-seed-caption] strong");
        const titleRect = rect(title), text = titleRect.width && getComputedStyle(title).visibility === "visible" ? titleRect : null;
        return { id, tier: element.dataset.ordinaryTier, left: parseFloat(element.style.left),
          top: parseFloat(element.style.top), depth: Number(element.dataset.spaceDepth),
          ...(node ? { x: bounds.x + bounds.width / 2 + node.center[0] * bounds.height,
            y: bounds.y + bounds.height / 2 - node.center[1] * bounds.height, radius: node.radius * bounds.height }
            : { x: body.x + body.width / 2, y: body.y + body.height / 2, radius: body.width / 2 }),
          hit: Math.min(hit.width, hit.height), centerHit, name: element.getAttribute("aria-label"),
          title: title.textContent, text, clipped: title.scrollWidth > title.offsetWidth,
          leader: !element.querySelector("[data-seed-leader]").hidden
        };
      })
    };
  });
  assert.equal(view.backend, backend[renderer]);
  for (const drop of view.drops) {
    assert(drop.hit >= 43.5, `${drop.id}: ${drop.hit}px target`);
    assert(drop.centerHit, `${drop.id}: projected center still hits its button`);
  }
  const titles = view.drops.filter(drop => drop.text);
  if (compact) {
    assert.equal(titles.length, view.drops.filter(drop => drop.tier !== "distant").length);
    assert(view.drops.every(drop => !drop.leader));
    assert(view.drops.filter(drop => drop.tier === "distant").every(drop => !drop.text));
  }
  for (const drop of titles) {
    const { text } = drop;
    const own = gap(text, drop), closest = Math.min(...view.drops.filter(other => other !== drop).map(other => gap(text, other)));
    drop.titleGap = own;
    drop.nearestOtherGap = closest;
    assert(own >= -1 && own <= text.height && own < closest,
      `${drop.id}: title distance ${own.toFixed(2)}px, next ${closest.toFixed(2)}px`);
    assert(text.left >= view.bounds.left && text.right <= view.bounds.right
      && text.top >= view.bounds.top && text.bottom <= view.bounds.bottom, `${drop.id} title inside stage`);
    assert(!titles.some(other => other !== drop && text.left < other.text.right && text.right > other.text.left
      && text.top < other.text.bottom && text.bottom > other.text.top), `${drop.id} title overlaps`);
  }
  return view;
}

function assertTiers(view, tiers) {
  for (const [id, tier] of Object.entries(tiers)) assert.equal(view.drops.find(drop => drop.id === id)?.tier, tier, id);
  const sizes = tier => view.drops.filter(drop => drop.tier === tier).map(drop => drop.radius);
  assert(Math.min(...sizes("focus")) > Math.max(...sizes("direct")) * 1.2);
  assert(Math.min(...sizes("direct")) > Math.max(...sizes("distant")) * 1.2);
}

async function capture(page, outputDir, name, anonymous = false) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  if (anonymous) {
    await page.locator(stage).screenshot({ path: path.join(outputDir, `${name}-anonymous.png`),
      style: `${stage} { filter: grayscale(1) !important }
        [data-seed-caption], [data-seed-leader], [data-ordinary-marker], [data-testid="dialogue-stage-field"] { visibility: hidden !important }` });
  }
}

async function openStage(context, baseUrl) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
  const guide = page.getByRole("button", { name: "关闭提示", exact: true });
  if (await guide.isVisible()) await guide.click();
  return page;
}

async function exerciseTitleAndPositions(browser, baseUrl, outputDir, fixture) {
  const settings = { viewport: { width: 390, height: 744 }, reducedMotion: "reduce" };
  const context = await browser.newContext(settings);
  const snapshot = structuredClone(fixture);
  const label = "把水边活动、用地边界和照料规则放在一起讨论的长标题";
  snapshot.graph.nodes["branch-a"].meta.label = label;
  snapshot.seedInstances = { "a-copy": { id: "a-copy", conceptId: "a", ordinal: 1,
    createdAt: snapshot.graph.nodes.a.createdAt } };
  const depth = { id: "duration", label: "时间", negative: "短期", positive: "长期", placement: "z", evidence: "content" };
  snapshot.thinkingSpace.axes.push(depth);
  snapshot.graph.nodes.a.meta.perspective = { axes: [{ ...depth, value: .6, source: "model" }] };
  delete compactPositions(snapshot).a;
  try {
    await loadSynthesisSnapshot(context, snapshot);
    await context.addInitScript(() => localStorage.setItem("anicca.dialogue.renderer.v1", "original"));
    const page = await openStage(context, baseUrl);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const start = await inspect(page, "original", true);
    const byId = (view, id) => view.drops.find(drop => drop.id === id);
    assert.equal(byId(start, "a-copy").tier, "distant");
    assert(byId(start, "a-copy").name.includes("分身 1"));
    assert(byId(start, "branch-a").clipped);
    assert(byId(start, "branch-a").name.includes(label));
    assert(Math.abs(byId(start, "a").depth - .276) < .001);
    await capture(page, outputDir, "ordinary-long-and-copy-390");
    const startPositions = compactPositions(await readSnapshot(page));
    await page.getByTestId("dialogue-stage-node-a-copy").click();
    await page.getByTestId("dialogue-panel").getByRole("heading", { name: "调整水边" }).waitFor();
    await closeReading(page);
    const refocused = await inspect(page, "original", true);
    assert.equal(byId(refocused, "a-copy").tier, "focus");
    assert.equal(byId(refocused, "a").tier, "distant");
    assert.deepEqual(compactPositions(await readSnapshot(page)), startPositions);

    const drop = byId(refocused, "a");
    await page.mouse.move(drop.x, drop.y);
    await page.mouse.down();
    await page.mouse.move(drop.x + 34, drop.y + 29, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(({ workspace, old }) => {
      const stored = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${workspace}`));
      const next = stored?.stageLayouts[`seeds:${workspace}`]?.compact?.nodePositions.a;
      return next && Math.hypot(next.x - old.x, next.y - old.y) > 3;
    }, { workspace: snapshot.workspaceId, old: startPositions.a });
    const movedSnapshot = await readSnapshot(page);
    const movedPositions = compactPositions(movedSnapshot);
    assert(Math.abs(movedPositions.a.z - startPositions.a.z) < .001);
    assert.deepEqual(movedPositions["branch-a"], startPositions["branch-a"]);
    assert.deepEqual(movedSnapshot.graph.nodes.a.meta.perspective, snapshot.graph.nodes.a.meta.perspective);

    // Start a context with the browser's persisted storage, without the fixture
    // seeding script that would replace a snapshot on navigation.
    const reloadedContext = await browser.newContext({ ...settings, storageState: await context.storageState() });
    try {
      const reloadedPage = await openStage(reloadedContext, baseUrl);
      await reloadedPage.reload({ waitUntil: "networkidle" });
      const reloaded = await inspect(reloadedPage, "original", true);
      assert.deepEqual(compactPositions(await readSnapshot(reloadedPage)), movedPositions);
      assert(Math.abs(byId(reloaded, "a").left - movedPositions.a.x) < .001);
      assert(Math.abs(byId(reloaded, "a").top - movedPositions.a.y) < .001);
      assert(Math.abs(byId(reloaded, "a").depth - movedPositions.a.z) < .001);
      assert.deepEqual(errors, []);
      return { start, refocused, beforeDrag: startPositions.a, afterDrag: movedPositions.a, reloaded };
    } finally {
      await reloadedContext.close();
    }
  } finally {
    await context.close();
  }
}

const chromiumOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ["--enable-unsafe-webgpu", ...process.platform === "darwin" ? ["--use-angle=metal"] : []]
};

const [baseUrl, outputDir] = process.argv.slice(2);
assert(baseUrl && outputDir, "Usage: node scripts/visual-smoke/ordinary-stage.mjs <base-url> <output-dir>");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch(chromiumOptions);
const evidence = {};
let snapshot;
try {
  await runJohariSynthesis(browser, { baseUrl, outputDir, onOrdinaryExit: async page => {
    await page.waitForFunction(() => {
      const id = localStorage.getItem("anicca_workspace_active_v1");
      const saved = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${id}`));
      return saved.focusedNodeId === "branch-a" && Object.values(saved.graph.nodes).some(node => node.branchType === "合");
    });
    snapshot = await readSnapshot(page);
    const result = Object.values(snapshot.graph.nodes).find(node => node.branchType === "合").id;
    evidence.exit = await inspect(page, "original", true);
    assertTiers(evidence.exit, { "branch-a": "focus", root: "direct", a: "direct", b: "direct", [result]: "distant" });
    await capture(page, outputDir, "ordinary-exit-320", true);
  }});
  assert(snapshot);
  const result = Object.values(snapshot.graph.nodes).find(node => node.branchType === "合").id;
  const tiers = { "branch-a": "focus", root: "direct", a: "direct", b: "direct", [result]: "distant" };

  for (const [renderer, width, height] of [["original", 390, 744], ["flat", 320, 568], ["tsl", 1440, 900]]) {
    const runner = renderer === "flat" ? await chromium.launch({ ...chromiumOptions,
      args: ["--disable-webgl", "--disable-webgpu"] }) : browser;
    const context = await runner.newContext({ viewport: { width, height }, hasTouch: width < 500,
      isMobile: width < 500, reducedMotion: "reduce" });
    try {
      await loadSynthesisSnapshot(context, snapshot);
      await context.addInitScript(mode => localStorage.setItem("anicca.dialogue.renderer.v1", mode), renderer === "flat" ? "original" : renderer);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
      const guide = page.getByRole("button", { name: "关闭提示", exact: true });
      if (await guide.isVisible()) await guide.click();
      const tag = `ordinary-${renderer}-${width}`;
      evidence[tag] = await inspect(page, renderer, width < 640);
      assertTiers(evidence[tag], tiers);
      await capture(page, outputDir, tag);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      if (runner !== browser) await runner.close();
    }
  }
  await writeFile(path.join(outputDir, "ordinary-stage-measurements.json"), JSON.stringify(evidence, null, 2));
  evidence.interactions = await exerciseTitleAndPositions(browser, baseUrl, outputDir, snapshot);
  await writeFile(path.join(outputDir, "ordinary-stage-measurements.json"), JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
