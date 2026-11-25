import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rgbToOklch, oklchPreview } from "./oklch-preview.mjs";
import { captureSynthesisColors } from "./synthesis-colors.mjs";

const pairs = [["ab", "正＋反"], ["ac", "正＋正"], ["gray", "正＋近灰"]];
const byteRgb = channels => channels.map(channel => Math.round(channel * 255));

async function renderBoard(browser, outputDir, theme, rows) {
  const context = await browser.newContext({ viewport: { width: 684, height: 1000 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const images = await Promise.all(rows.map(async row => ({
      name: row.name,
      entries: await Promise.all([row.current, row.alternative].map(async view => ({
        rgb: byteRgb(view.declared),
        source: (await readFile(path.join(outputDir, view.screenshot))).toString("base64")
      })))
    })));
    await page.setContent(`<!doctype html><html lang="zh-Hans"><head><meta charset="UTF-8">
    <style>
     body { margin:0; background:${theme === "dark" ? "#191620" : "#f8f7f9"}; color:${theme === "dark" ? "#f0e9f5" : "#302a42"};
       padding:14px; font:14px/1.3 "PingFang SC","Microsoft YaHei",sans-serif; }
     h1 {font-size:18px;margin:0 0 12px} h2 {font-size:14px;margin:12px 0 5px}
     .columns {display:grid;grid-template-columns:320px 320px;gap:16px}
     figure {margin:0;position:relative;height:269px;overflow:hidden}
     img {position:absolute;top:-111px;left:0;width:320px;height:568px;display:block}
     .heading {font-weight:600} small {font-size:12px;font-weight:400;margin-left:10px}
    </style></head><body>
    <h1>${theme === "dark" ? "暗色" : "亮色"}场景的合流底色</h1>
    <header class="columns heading"><span>当前等量 RGB</span><span>OKLCH 候选</span></header>
    ${images.map(row => `<h2>${row.name}</h2><div class="columns">
       ${row.entries.map(entry => `<div><small>底色 RGB (${entry.rgb.join(", ")})</small><figure><img src="data:image/png;base64,${entry.source}"></figure></div>`).join("")}
    </div>`).join("")}
    </body></html>`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    await page.screenshot({ path: path.join(outputDir, `synthesis-color-comparison-${theme}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

function checkIdenticalScenes(current, alternative) {
  assert.deepEqual(current.sources, alternative.sources);
  assert.deepEqual(current.sourceGeometry, alternative.sourceGeometry);
  assert.deepEqual(current.fillPoints, alternative.fillPoints);
  // Color is the only input that should change between the two screenshots.
  const shape = row => row.projected.map(({ id, center, radius, depth }) => ({ id, center, radius, depth }));
  assert.deepEqual(shape(current), shape(alternative));
  assert.deepEqual(current.sourceFills, alternative.sourceFills);
  const unchangedColors = row => row.projected.filter(item => item.id !== "result").map(item => item.color);
  assert.deepEqual(unchangedColors(current), unchangedColors(alternative));
}

export async function runSynthesisColorComparison(browser, options) {
  const results = [];
  for (const theme of ["light", "dark"]) {
    const rows = [];
    for (const [pair, name] of pairs) {
      const { current, alternative, candidate } = await captureSynthesisColors(browser, options, "original", theme, pair, oklchPreview);
      checkIdenticalScenes(current, alternative);
      const [a, b] = current.sourceGeometry.map(seed => seed.declared);
      assert.deepEqual(oklchPreview(b, a), candidate);
      const contrast = ({ text }) => Math.min(...text.map(item => item.strongest?.actualContrast ?? 0));
      rows.push({ theme, pair, name, current, alternative, candidate,
        sourceOklch: [rgbToOklch(a), rgbToOklch(b)],
        lightnessAndChroma: { current: rgbToOklch(current.declared), alternative: rgbToOklch(alternative.declared) },
        textContrast: { current: contrast(current), alternative: contrast(alternative), threshold: 4.5 } });
    }
    await renderBoard(browser, options.outputDir, theme, rows);
    results.push(...rows);
  }
  await writeFile(path.join(options.outputDir, "synthesis-color-comparison-measurements.json"), JSON.stringify(results, null, 2));
  return { name: "synthesis-color-comparison", passed: true, cases: results.length,
    candidatesBelowTextThreshold: results.filter(row => row.textContrast.alternative < row.textContrast.threshold).map(row => `${row.theme}-${row.pair}`) };
}
