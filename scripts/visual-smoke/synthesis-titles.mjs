import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { crossTopicFixture, loadSynthesisSnapshot } from "./synthesis-common-parent.mjs";
import { synthesisColorFixture } from "./synthesis-colors.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

const names = { a: "安放雨声", b: "收拢群岛" };

function titleFixture({ long, single, swap }) {
  const fixture = structuredClone(crossTopicFixture);
  const { nodes } = fixture.graph;
  for (const [id, name] of Object.entries(names)) {
    nodes[id].meta.label = long && id === "a" ? "安放雨声直到海面重现熟悉的灯火" : name;
    nodes[id].text = nodes[id].meta.label;
  }
  if (single) nodes.result.meta.sourceNodeIds = ["unknown", "b"];
  if (swap) {
    nodes.result.meta.sourceNodeIds.reverse();
    nodes.result.meta.sourceInstanceIds.reverse();
  }
  return fixture;
}

async function measure(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="dialogue-stage-track"]');
    const canvas = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
    const canvasBounds = canvas.getBoundingClientRect();
    const liquid = stage.dataset.metaballRenderer === "ready";
    const published = JSON.parse(canvas.dataset.spaceNodes || "[]");
    const visible = element => Boolean(element?.offsetWidth && element.offsetHeight && getComputedStyle(element).visibility === "visible");
    const distance = (box, drop) => Math.hypot(
      Math.max(box.left - drop.x, 0, drop.x - box.right), Math.max(box.top - drop.y, 0, drop.y - box.bottom)
    ) - drop.r;
    const nodes = [...stage.querySelectorAll("[data-synthesis-tier]")].map(button => {
      const { x, y, width, height } = button.getBoundingClientRect();
      const id = button.dataset.metaballSurface;
      const node = published.find(item => item.id === id);
      const physical = liquid && node ? {
        x: canvasBounds.x + canvasBounds.width / 2 + node.center[0] * canvasBounds.height,
        y: canvasBounds.y + canvasBounds.height / 2 - node.center[1] * canvasBounds.height,
        r: node.radius * canvasBounds.height
      } : { x: x + width / 2, y: y + height / 2, r: width / 2 };
      const hit = button.querySelector("[data-seed-hit-area]").getBoundingClientRect();
      const caption = button.querySelector("[data-seed-caption]");
      const title = caption.querySelector("strong");
      return {
        id, role: button.dataset.synthesisTier, concept: button.dataset.seedConcept, instance: button.dataset.seedInstance,
        accessible: button.getAttribute("aria-label"), hit: hit.toJSON(), physical,
        caption: visible(caption) ? { text: title.innerText, box: caption.getBoundingClientRect().toJSON(),
          titleBox: title.getBoundingClientRect().toJSON(),
          line: parseFloat(getComputedStyle(title).lineHeight), truncated: title.scrollWidth > title.clientWidth } : null
      };
    });
    for (const item of nodes) if (item.caption) {
      item.caption.distances = Object.fromEntries(nodes.map(node => [node.id, distance(item.caption.box, node.physical)]));
      item.caption.titleDistances = Object.fromEntries(nodes.map(node => [node.id, distance(item.caption.titleBox, node.physical)]));
    }
    const stageBounds = stage.getBoundingClientRect();
    return { nodes, leads: [...stage.querySelectorAll("[data-seed-leader]")].filter(visible).length,
      safe: { left: stageBounds.left, right: stageBounds.right,
        top: stageBounds.top + Math.max(0, Number(stage.dataset.labelInsetTop)),
        bottom: stageBounds.bottom - Math.max(0, Number(stage.dataset.labelInsetBottom)) } };
  });
}

function assertGeometry(result, single) {
  assert.equal(result.nodes.length, 8);
  assert.equal(result.leads, 0);
  const captions = result.nodes.filter(node => node.caption);
  const sources = result.nodes.filter(node => node.role === "source");
  assert.equal(captions.length, single ? 2 : 3);
  assert.equal(sources.length, single ? 1 : 2);
  for (const source of sources) {
    const { box, distances, line, titleDistances, titleBox } = source.caption;
    assert(source.hit.width >= 43.9 && source.hit.height >= 43.9, `${source.id} touch target`);
    assert(titleDistances[source.id] <= line, `${source.id} title too far (${titleDistances[source.id]}px)`);
    for (const other of result.nodes) if (other.id !== source.id) {
      assert(titleDistances[source.id] + 3 < titleDistances[other.id], `${source.id} title reads as ${other.id}`);
    }
    for (const other of sources) if (other.id !== source.id && Math.abs(other.physical.x - source.physical.x) > 70) {
      const titleX = (titleBox.left + titleBox.right) / 2, midpoint = (source.physical.x + other.physical.x) / 2;
      assert((titleX - midpoint) * Math.sign(source.physical.x - other.physical.x) >= 16, `${source.id} title sits in the middle`);
    }
    assert(box.left >= result.safe.left && box.right <= result.safe.right && box.top >= result.safe.top && box.bottom <= result.safe.bottom);
    for (const distance of Object.values(distances)) assert(distance >= -.5, `${source.id} title overlays a liquid drop`);
    for (const other of captions) {
      if (other.id === source.id) continue;
      const adjacent = other.caption.box;
      assert(box.right <= adjacent.left || adjacent.right <= box.left || box.bottom <= adjacent.top || adjacent.bottom <= box.top);
    }
  }
}

async function capture(browser, { baseUrl, outputDir, setActivePage }, spec) {
  const context = await browser.newContext({ viewport: { width: spec.width, height: spec.width === 320 ? 568 : 844 },
    deviceScaleFactor: 1, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const snapshot = spec.original ? synthesisColorFixture("ab") : titleFixture(spec);
  await loadSynthesisSnapshot(context, snapshot);
  await context.addInitScript(flat => {
    localStorage.setItem("anicca.dialogue.renderer.v1", "original");
    if (flat) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        return /^(?:experimental-)?webgl2?$/.test(kind) ? null : getContext.call(this, kind, ...options);
      };
    }
  }, spec.flat);
  const page = await context.newPage();
  setActivePage?.(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const stage = page.getByTestId("dialogue-stage-track");
  try {
    await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.tap();
    await stage.and(page.locator(`[data-metaball-renderer="${spec.flat ? "fallback" : "ready"}"]`)).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const frames = [], reads = [];
    for (const state of ["ordinary", "expanded", ...(spec.drag ? ["dragged"] : [])]) {
      if (state === "expanded") {
        await page.getByRole("button", { name: "展开来源", exact: true }).tap();
        await page.getByTestId("dialogue-source-context").waitFor();
      }
      if (state === "dragged") {
        const { x, y } = frames.at(-1).nodes.find(item => item.id === "a-copy").physical;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (x < spec.width / 2 ? -40 : 40), y + 23, { steps: 9 });
        await page.mouse.up();
        await page.waitForFunction(() => {
          const saved = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`));
          return Object.values(saved.stageLayouts || {}).some(layout => layout.synthesisPositions?.result?.compact?.["a-copy"]);
        });
      }
      await waitForSeedLayout(page, { captions: true });
      const result = await measure(page);
      const prefix = `synthesis-titles-${spec.name}-${state}`;
      await page.screenshot({ path: path.join(outputDir, `${prefix}.png`) });
      const blind = spec.blind && state !== "dragged" ? `${randomUUID()}.png` : undefined;
      if (blind) await page.screenshot({ path: path.join(outputDir, blind), style: `
        [data-stage-label-chrome], [data-stage-navigation-controls], [data-testid="dialogue-workspace-bar"],
        [data-testid="dialogue-composer"], [data-synthesis-marker], [data-common-parent-marker] { visibility: hidden !important; }
      ` });
      frames.push({ state, blind, screenshot: `${prefix}.png`, ...result });
    }
    for (const id of spec.single ? ["b"] : ["a-copy", "b"]) {
      await waitForSeedLayout(page, { captions: true });
      const { physical } = (await measure(page)).nodes.find(item => item.id === id);
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-metaball-surface]")?.dataset.metaballSurface, physical);
      assert.equal(hit, id);
      await page.touchscreen.tap(physical.x, physical.y);
      await page.getByTestId(`dialogue-stage-node-${id}`).and(page.locator('[data-reading-role="main"]')).waitFor();
      const heading = await page.getByTestId("dialogue-panel").getByRole("heading", { level: 2 }).innerText();
      assert.equal(heading, snapshot.graph.nodes[id === "a-copy" ? "a" : id].meta.label);
      reads.push({ id, heading, hit, point: physical });
      await page.getByRole("button", { name: "返回种子，收起阅读", exact: true }).tap();
      await page.getByTestId("dialogue-source-context").waitFor();
    }
    return { ...spec, frames, reads, errors };
  } finally {
    await context.close();
  }
}

export async function runSynthesisTitles(browser, options) {
  const flip = Boolean(randomInt(2));
  const specs = [
    { name: "320", width: 320, blind: true, swap: flip },
    { name: "320-long", width: 320, long: true, blind: true, swap: !flip, drag: true },
    { name: "390", width: 390 },
    { name: "320-flat", width: 320, flat: true },
    { name: "320-single", width: 320, single: true },
    { name: "320-original-ab", width: 320, original: true }
  ];
  const results = [];
  for (const spec of specs) {
    results.push(await capture(browser, options, spec));
    await writeFile(path.join(options.outputDir, "synthesis-title-measurements.json"), JSON.stringify(results, null, 2));
  }
  for (const result of results) {
    assert.deepEqual(result.errors, []);
    for (const frame of result.frames) {
      assertGeometry(frame, result.single);
      if (!result.long) {
        for (const node of frame.nodes.filter(node => node.role === "source")) assert(!node.caption.truncated, `${result.name} ${frame.state} clipped ${node.caption.text}`);
      }
      if (result.long) {
        const copy = frame.nodes.find(node => node.id === "a-copy");
        assert(copy.caption.truncated && copy.accessible.includes(copy.caption.text));
      }
    }
  }
  return { name: "synthesis-titles", passed: true, cases: results.length };
}
