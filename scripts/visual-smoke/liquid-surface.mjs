import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const node = (id, center, radius, color, depth) => ({ id, center, radius, color, depth, emphasis: 1 });

// A light outlier at the internal overlap caused the reported white dashed seam.
// This fixed 800×600 scene excludes the true outer rim and the torus hole.
async function internalHighlight(buffer) {
  const pixels = await sharp(buffer).greyscale().raw().toBuffer(); let peak = 0;
  for (let y = 280; y < 410; y++) for (let x = 400; x < 545; x++) {
    const at = y * 800 + x, value = pixels[at]; if (value >= 242) continue;
    const nearby = [-801, -800, -799, -1, 1, 799, 800, 801].map(offset => pixels[at + offset]).sort((a, b) => a - b);
    peak = Math.max(peak, value - (nearby[3] + nearby[4]) / 2);
  }
  return peak;
}

/** Uses the actual renderer modules in an isolated, temporary Vite harness. */
export async function runLiquidSurface(browser, { outputDir, setActivePage }) {
  await mkdir(outputDir, { recursive: true }); const results = [];
  const folder = await realpath(await mkdtemp(path.join(tmpdir(), "anicca-liquid-")));
  const entry = `import {createDialogueMetaballRenderer} from ${JSON.stringify(`/@fs${root}/src/components/dialogue/liquid/renderer.ts`)};
import {createTslMetaballRenderer} from ${JSON.stringify(`/@fs${root}/src/components/dialogue/liquid/tslRenderer.ts`)};
const canvas=document.querySelector('canvas');let renderer;
window.start=async mode=>{renderer=mode==='original'?createDialogueMetaballRenderer(canvas,()=>{}):(await createTslMetaballRenderer(canvas,mode==='webgl',()=>{},new AbortController().signal)).renderer;renderer.resize(800,600,1);};
window.draw=(nodes,t,interaction)=>renderer.render(nodes,t,{ground:[248,247,249],...interaction});window.ready=true;`;
  const server = await createServer({ configFile: false, root: folder, logLevel: "error", resolve: { alias: { "@": path.join(root, "src") } },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [folder, root] } }, plugins: [{ name: "liquid-surface-harness", configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url === "/entry.js") { response.setHeader("Content-Type", "text/javascript"); response.end(entry); }
        else if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><body style="margin:0;background:rgb(248,247,249)"><canvas width="800" height="600"></canvas><script type="module" src="/entry.js"></script>'); }
        else next();
      });
    } }] });
  try {
    await server.listen(); const address = server.httpServer.address(); assert(address && typeof address !== "string");
    for (const mode of ["original", "webgl", "webgpu"]) {
      const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
      const page = await context.newPage(); setActivePage(page); const errors = [], frames = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${address.port}`); await page.waitForFunction(() => window.ready);
        // WebGPU is optional on CI hosts; force-WebGL and the app's fallback
        // checks remain mandatory. Compilation errors are never skipped.
        try { await page.evaluate(mode => window.start(mode), mode); }
        catch (error) {
          if (mode === "webgpu" && /WebGPU is not available|No GPU adapter|Failed to request adapter/.test(String(error))) {
            results.push({ mode, status: "unavailable", reason: String(error) }); continue;
          }
          throw error;
        }
        for (const scenario of ["pair", "third", "release"]) for (let index = 0; index < 12; index++) {
          const nodes = [node("a", [-.065 + (index - 5.5) * .006, -.04], .145, [.42, .51, .52], -.05),
            node("b", [.10, .07], .135, [.61, .56, .52], .03)];
          if (scenario === "third") nodes.push(node("c", [.13, -.04], .14, [.56, .51, .61], .15));
          await page.evaluate(({ nodes, index, scenario }) => window.draw(nodes, 10 + index / 30,
            scenario === "release" ? {} : { draggedId: "a", partnerId: "b" }), { nodes, index, scenario });
          const screenshot = await page.screenshot(), peak = scenario === "third" ? await internalHighlight(screenshot) : null;
          if (peak !== null) assert(peak < 12, `${mode} frame ${index} has an internal white seam: ${peak}`);
          frames.push({ scenario, index, internalHighlight: peak });
          if (index === 5 || (scenario === "third" && index === 10)) await writeFile(path.join(outputDir, `liquid-${mode}-${scenario}-${index}.png`), screenshot);
        }
        assert.deepEqual(errors, []); results.push({ mode, status: "passed", frames });
      } finally { await context.close(); setActivePage(null); }
    }
    return { name: "liquid-surface", results };
  } finally { await server.close(); await rm(folder, { recursive: true, force: true }); await writeFile(path.join(outputDir, "liquid-surface.json"), `${JSON.stringify({ results }, null, 2)}\n`); }
}
