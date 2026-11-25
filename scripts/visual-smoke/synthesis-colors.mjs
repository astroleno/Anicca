import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { crossTopicFixture, loadSynthesisSnapshot } from "./synthesis-common-parent.mjs";
import { waitForSeedLayout } from "./seeds.mjs";

const viewport = { width: 320, height: 568 };
const inkSelector = "[data-synthesis-marker], [data-common-parent-marker], [data-seed-caption] strong";

function fixtureFor(pair) {
  if (pair === "same-role-cross-topic") return crossTopicFixture;
  const snapshot = structuredClone(crossTopicFixture);
  const { nodes } = snapshot.graph;
  nodes.b.branchType = "反";
  nodes.b.parents = ["branch-a"];
  nodes["branch-a"].children.push("b", "c");
  nodes.c = { ...nodes.a, id: "c", parents: ["branch-a", "branch-b"], text: "统筹土地", meta: { label: "统筹土地" } };
  nodes["branch-b"].children = ["c"];
  // Give the second positive source a different generation without changing the common parent.
  nodes["branch-b"].parents = ["root", "branch-a"];
  nodes["branch-a"].children.push("branch-b");
  const sources = { ab: ["a", "b"], ac: ["a", "c"], ba: ["b", "a"] }[pair];
  nodes.result.parents = sources;
  nodes.result.meta = { label: "共同改写约定", sourceNodeIds: sources, sourceInstanceIds: sources.map(id => id === "a" ? "a-copy" : id) };
  nodes.result.text = "共同改写约定";
  return snapshot;
}

async function pixels(page, original, bare, geometry) {
  return page.evaluate(async ({ source, clean, geometry }) => {
    const read = async data => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const [front, ground] = await Promise.all([read(source), read(clean)]);
    const pixel = ({ data, width }, x, y) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
    const luminance = rgb => rgb.reduce((sum, value, i) => {
      const channel = value / 255;
      return sum + [0.2126, 0.7152, 0.0722][i] * (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    }, 0);
    const contrast = (fg, bg) => {
      const a = luminance(fg), b = luminance(bg);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    const sample = ([x, y]) => pixel(ground, Math.round(x), Math.round(y));
    return {
      fill: geometry.fillPoints.map(point => ({ point, rgb: sample(point) })),
      sourceFills: geometry.sourceGeometry.map(({ point, ...seed }) => ({ ...seed, point, rgb: sample(point) })),
      text: geometry.text.map(row => {
        const { left, top, right, bottom } = row.rect;
        const foreground = row.ink.match(/[\d.]+/g).slice(0, 3).map(Number);
        const glyphs = [];
        for (let y = Math.ceil(top); y < bottom; y++) for (let x = Math.ceil(left); x < right; x++) {
          const painted = pixel(front, x, y), background = pixel(ground, x, y);
          if (painted.some((channel, i) => Math.abs(channel - background[i]) >= 8)) {
            glyphs.push({ point: [x, y], painted, background, actualContrast: contrast(painted, background), inkContrast: contrast(foreground, background) });
          }
        }
        glyphs.sort((a, b) => b.actualContrast - a.actualContrast);
        return { ...row, glyphPixelCount: glyphs.length, strongest: glyphs[0], inkWorst: Math.min(...glyphs.map(item => item.inkContrast)) };
      })
    };
  }, { source: original.toString("base64"), clean: bare.toString("base64"), geometry });
}

async function capture(browser, { baseUrl, outputDir, setActivePage }, renderer, theme, pair) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  await loadSynthesisSnapshot(context, fixtureFor(pair));
  await context.addInitScript(({ renderer, theme }) => {
    localStorage.setItem("anicca.dialogue.appearance.v1", theme);
    localStorage.setItem("anicca.dialogue.renderer.v1", renderer === "webgpu" ? "tsl" : "original");
    if (renderer === "flat") {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        return /^(?:experimental-)?webgl2?$/.test(kind) ? null : getContext.call(this, kind, ...options);
      };
    }
  }, { renderer, theme });
  const page = await context.newPage();
  setActivePage?.(page);
  try {
    await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.tap();
    const canvas = page.getByTestId("dialogue-metaball-canvas");
    const stage = page.getByTestId("dialogue-stage-track");
    await stage.and(page.locator(`[data-theme="${theme}"][data-metaball-renderer="${renderer === "flat" ? "fallback" : "ready"}"]`)).waitFor();
    await waitForSeedLayout(page, { captions: true });
    await page.evaluate(() => document.fonts.ready);
    const backend = await canvas.getAttribute("data-renderer-backend");
    const expected = renderer === "flat" ? "unavailable" : renderer;
    assert.equal(backend, expected);
    const geometry = await page.evaluate(inkSelector => {
      const result = document.querySelector('[data-source-role="result"]');
      const rect = result.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const fillPoints = [[x, y - 23], [x - 24, y], [x + 24, y], [x, y + 23]];
      const text = Array.from(document.querySelectorAll(inkSelector), item => {
        const rect = item.getBoundingClientRect();
        const style = getComputedStyle(item);
        return { seed: item.closest("[data-metaball-surface]")?.dataset.metaballSurface, text: item.innerText,
          ink: style.color, font: { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight },
          visible: Boolean(rect.width && rect.height && style.visibility === "visible"), rect: rect.toJSON() };
      }).filter(item => item.visible);
      const sourceGeometry = Array.from(document.querySelectorAll('[data-source-role="source"]'), item => {
        const box = item.getBoundingClientRect();
        return { id: item.dataset.metaballSurface, concept: item.dataset.seedConcept, role: item.dataset.metaballRole,
          declared: item.dataset.seedSemanticColor.split(" ").map(Number), point: [box.x + box.width / 2, box.y + box.height / 2 - 12] };
      });
      return {
        fillPoints, text, sourceGeometry, declared: result.dataset.seedSemanticColor.split(" ").map(Number),
        projected: JSON.parse(document.querySelector('[data-testid="dialogue-metaball-canvas"]').dataset.spaceNodes || "[]"),
        sources: sourceGeometry.map(item => item.id)
      };
    }, inkSelector);
    assert.equal(geometry.sources.length, 2);
    const sourceColors = geometry.sourceGeometry.map(seed => seed.declared);
    geometry.declared.forEach((channel, index) => assert(Math.abs(channel - (sourceColors[0][index] + sourceColors[1][index]) / 2) < 1e-12));
    if (renderer !== "flat") {
      const rgb = id => geometry.projected.find(seed => seed.id === id).color;
      assert.deepEqual(rgb("result"), geometry.declared);
      for (const source of geometry.sourceGeometry) assert.deepEqual(rgb(source.id), source.declared);
    }
    const prefix = `synthesis-colors-${renderer}-${theme}-${pair}`;
    await page.evaluate(() => Object.defineProperty(document, "hidden", { configurable: true, get: () => true }));
    const screenshot = await page.screenshot({ path: path.join(outputDir, `${prefix}.png`) });
    const bare = await page.screenshot({ path: path.join(outputDir, `${prefix}-ink-hidden.png`), style: `${inkSelector} { visibility: hidden !important; }` });
    const measurements = await pixels(page, screenshot, bare, geometry);
    let projectedAttributeUpdate;
    if (renderer !== "flat" && theme === "light" && pair === "ab") {
      // The renderer must reread just this attribute on the same node without a remount.
      const update = [0.8, 0.6, 0.7];
      await page.evaluate(async channels => {
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('[data-source-role="result"]').dataset.seedSemanticColor = channels.join(" ");
      }, update);
      await page.waitForFunction(channels => {
        const canvas = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
        return JSON.parse(canvas.dataset.spaceNodes).some(node => node.id === "result" && node.color.every((value, i) => value === channels[i]));
      }, update);
      projectedAttributeUpdate = update;
    }
    return { renderer, backend, theme, pair, screenshot: `${prefix}.png`, projectedAttributeUpdate, ...geometry, ...measurements };
  } finally {
    await context.close();
  }
}

export async function runSynthesisColors(browser, options) {
  const results = [];
  for (const renderer of ["original", "flat", "webgpu"]) {
    for (const theme of ["light", "dark"]) {
      for (const pair of ["ab", "ac"]) results.push(await capture(browser, options, renderer, theme, pair));
    }
  }
  for (const pair of ["ba", "same-role-cross-topic"]) results.push(await capture(browser, options, "original", "light", pair));
  await writeFile(path.join(options.outputDir, "synthesis-color-measurements.json"), JSON.stringify(results, null, 2));
  const find = (renderer, theme, pair) => results.find(row => row.renderer === renderer && row.theme === theme && row.pair === pair);
  const reference = find("original", "light", "ab");
  const swapped = find("original", "light", "ba");
  assert.deepEqual(swapped.declared, reference.declared);
  const warmth = row => row.fill.reduce((sum, { rgb }) => sum + rgb[0] - rgb[2], 0) / row.fill.length;
  assert(Math.abs(warmth(reference) - warmth(swapped)) <= 2, "Swapping the same sources should preserve the apparent focus color");
  for (const renderer of ["original", "flat", "webgpu"]) {
    for (const theme of ["light", "dark"]) {
      const ab = find(renderer, theme, "ab"), ac = find(renderer, theme, "ac");
      assert.deepEqual(ab.declared, reference.declared);
      assert.deepEqual(ac.declared, find("original", "light", "ac").declared);
      assert.notDeepEqual(ab.declared, ac.declared);
      assert(warmth(ac) - warmth(ab) >= 5, `${renderer} ${theme} did not visibly respond to the warmer source`);
    }
  }
  for (const theme of ["light", "dark"]) {
    const ab = find("flat", theme, "ab"), ac = find("flat", theme, "ac");
    const [a, b] = ab.sourceFills, [sameA, c] = ac.sourceFills;
    const heat = ({ rgb }) => rgb[0] - rgb[2];
    assert.deepEqual(a.rgb, sameA.rgb, `The retained flat source changed in ${theme}`);
    assert(heat(a) - heat(b) >= 10 && heat(c) - heat(b) >= 10, `The flat source hues are indistinguishable in ${theme}`);
  }
  for (const row of results) {
    const distant = row.pair === "same-role-cross-topic";
    assert.equal(row.text.filter(item => item.text === "起点").length, distant ? 0 : 1);
    assert.equal(row.text.filter(item => item.seed === "result" && item.text === "合").length, 1);
    assert.equal(row.text.length, distant ? 6 : 7);
    for (const item of row.text) {
      const label = `${row.renderer} ${row.theme} ${row.pair} ${item.text}`;
      assert(item.glyphPixelCount > 0 && item.strongest.actualContrast >= 4.5 && item.inkWorst >= 4.5, label);
    }
  }
  return { name: "synthesis-colors", passed: true, cases: results.length };
}
