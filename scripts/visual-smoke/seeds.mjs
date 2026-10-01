import assert from "node:assert/strict";
import path from "node:path";

// Exercise the seed workspace with intercepted APIs in an isolated browser context.
export async function runSeedViewport(browser, viewport, { baseUrl, outputDir, setActivePage }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1, hasTouch: Boolean(viewport.hasTouch), isMobile: Boolean(viewport.isMobile) });
  if (viewport.visualViewportHeight) await context.addInitScript(({ width, height }) => {
    const events = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: {
      width, height, offsetTop: 0, offsetLeft: 0, scale: 1,
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events)
    } });
  }, { width: viewport.width, height: viewport.visualViewportHeight });
  const page = await context.newPage();
  setActivePage(page);
  const issues = [], requests = [];
  page.on("pageerror", error => issues.push(error.message));
  page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
  let sequence = 0;
  await page.route("**/api/**", async route => {
    const endpoint = new URL(route.request().url()).pathname;
    if (!["/api/branches", "/api/synthesis"].includes(endpoint)) return route.abort();
    const input = route.request().postDataJSON();
    requests.push({ endpoint, input });
    const n = ++sequence;
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({ json: endpoint === "/api/branches" ? {
      requestId: input.requestId,
      thesis: { text: `从具体实践出发，验证第 ${n} 个想法。`, summary: "在实践中验证。", label: `尝试${n}`, stance: "正" },
      antithesis: { text: `重新检查第 ${n} 个想法中的前提。`, summary: "检查隐含前提。", label: `质疑${n}`, stance: "反" }
    } : { requestId: input.requestId,
      synthesis: { text: "把独立探索与公开交流连接起来，让反馈进入下一轮实践。", summary: "让反馈进入实践。", label: `新连接${n}`, stance: "合" } } });
  });
  const graph = () => page.evaluate(() => {
    const id = localStorage.getItem("anicca_workspace_active_v1");
    return JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${id}`)).graph;
  });
  const waitCount = count => page.waitForFunction(expected => {
    const id = localStorage.getItem("anicca_workspace_active_v1");
    const data = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${id}`) || "null");
    return Object.keys(data?.graph.nodes || {}).length === expected;
  }, count);
  const select = async id => {
    if (await page.getByRole("button", { name: "收起阅读面板" }).isVisible()) await close();
    await page.getByTestId(`dialogue-stage-node-${id}`).click();
    await page.getByRole("button", { name: "裂变", exact: true }).waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById("dialogue-reading-drawer")).opacity === "1");
    const card = await page.locator("#dialogue-reading-drawer").boundingBox();
    const composer = await page.getByTestId("dialogue-composer").boundingBox();
    const content = await page.getByTestId("dialogue-panel").boundingBox();
    assert(card && content && card.height > 80 && content.y >= card.y && content.y + content.height <= card.y + card.height + 1,
      "The reading card contains its visible content");
    assert(composer && card.y + card.height <= composer.y - 8, "Reading card leaves the composer accessible");
  };
  const close = () => page.getByRole("button", { name: "收起阅读面板" }).click();
  const combine = async (a, b) => {
    await select(a);
    await page.getByRole("button", { name: "组合", exact: true }).click();
    const snapshot = await graph();
    await page.getByTestId("dialogue-panel").getByRole("button", { name: `${snapshot.nodes[b].branchType || "想法"} ${snapshot.nodes[b].meta?.label || snapshot.nodes[b].text.slice(0, 14)}`, exact: true }).click();
  };
  try {
    await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guideClose = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guideClose.isVisible()) await guideClose.click();
    assert(new URL(page.url()).pathname === "/dialogue");
    assert(await page.title());
    await page.getByRole("textbox", { name: "输入", exact: true }).waitFor();
    let firstPositions;
    const positions = () => page.locator('[data-testid^="dialogue-stage-node-"]').evaluateAll(elements =>
      Object.fromEntries(elements.map(element => [element.dataset.metaballSurface, { left: element.style.left, top: element.style.top }])));
    for (const [index, text] of ["让独立创作与交流相互促进", "让城市的公共空间更适合停留"].entries()) {
      await page.getByRole("textbox", { name: "输入", exact: true }).fill(text);
      await page.getByRole("button", { name: "生成", exact: true }).click();
      await waitCount((index + 1) * 3);
      if (!index) firstPositions = await positions();
      else for (const [id, position] of Object.entries(firstPositions)) assert.deepEqual((await positions())[id], position, "Existing seeds keep their positions");
    }
    const original = await graph();
    assert.equal(original.entryIds.length, 2, "Writing again creates a separate idea");
    const positives = Object.values(original.nodes).filter(node => node.branchType === "正");
    await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-stage-track"]')?.dataset.metaballRenderer === "ready");
    // Capture the settled layout after newly generated seeds spring out of their origin.
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="dialogue-stage-node-"]')].every(element =>
      (element.style.translate || "0px 0px").split(/\s+/).every(value => Math.abs(parseFloat(value)) < 0.5)
    ));
    const layout = await page.evaluate(() => {
      const composer = document.querySelector('[data-testid="dialogue-composer"]').getBoundingClientRect();
      return { width: innerWidth, height: visualViewport.height, scrollWidth: document.documentElement.scrollWidth,
        composer: { x: composer.x, right: composer.right, bottom: composer.bottom } };
    });
    assert(layout.scrollWidth <= layout.width + 1, JSON.stringify(layout));
    assert(layout.composer.x >= 0 && layout.composer.right <= layout.width + 1 && layout.composer.bottom <= layout.height + 2, JSON.stringify(layout));
    assert(Math.abs((layout.composer.x + layout.composer.right) / 2 - layout.width / 2) < 2, "Composer remains centered after repeated input");
    const seedRects = await page.locator('[data-testid^="dialogue-stage-node-"]').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
    for (const rect of seedRects) assert(rect.left >= 0 && rect.right <= viewport.width && rect.top >= 0 && rect.bottom <= layout.height, JSON.stringify(rect));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
    const performance = viewport.name === "desktop" ? await measureIdle(page) : null;
    const uniformNames = await page.evaluate(() => {
      const gl = document.querySelector('[data-testid="dialogue-metaball-canvas"]').getContext("webgl2");
      const program = gl.getParameter(gl.CURRENT_PROGRAM);
      return Array.from({ length: gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) }, (_, index) => gl.getActiveUniform(program, index).name);
    });
    assert(!uniformNames.includes("mx") && !uniformNames.includes("my"), "No cursor ball remains in the shader");
    await combine(positives[0].id, positives[1].id);
    await waitCount(7);
    const merged = Object.values((await graph()).nodes).find(node => node.branchType === "合");
    assert.deepEqual(new Set(merged.meta.sourceNodeIds), new Set(positives.map(node => node.id)));
    const synthesisRequest = requests.find(request => request.endpoint === "/api/synthesis").input;
    assert.deepEqual(synthesisRequest.sources.map(source => source.stance), ["正", "正"]);
    await select(merged.id);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-seed.png`) });
    await page.getByRole("button", { name: "裂变", exact: true }).click();
    await waitCount(9);
    let current = await graph();
    assert.equal(current.nodes[merged.id].children.length, 2);
    assert(current.nodes[merged.id].children.every(id => current.nodes[id].kind === "assistant"));
    // Any original idea also splits without inserting another user node.
    if (await page.getByRole("button", { name: "收起阅读面板" }).isVisible()) await close();
    const root = original.entryIds[1];
    if (viewport.hasTouch) {
      await select(root);
      await page.getByRole("button", { name: "裂变", exact: true }).click();
    } else {
      const requestCount = requests.length;
      await page.getByTestId(`dialogue-stage-node-${root}`).dblclick();
      await page.waitForFunction(() => !document.getElementById("dialogue-reading-drawer"));
      await waitCount(11);
      assert.equal(requests.length, requestCount + 1, "Double click splits once");
    }
    await waitCount(11);
    current = await graph();
    assert.equal(current.entryIds.length, 2);
    assert.equal(current.nodes[root].children.length, 4);
    if (await page.getByRole("button", { name: "收起阅读面板" }).isVisible()) await close();
    // The recent stage is bounded; history still retains every seed.
    assert((await page.locator('[data-testid^="dialogue-stage-node-"]').count()) <= 8);
    await page.reload({ waitUntil: "networkidle" });
    await waitCount(11);
    assert.equal(Object.keys((await graph()).nodes).length, 11);
    assert.deepEqual(issues, []);
    return { name: viewport.name, passed: true, layout, performance, requests: requests.length,
      checks: ["new-ideas", "stable-existing-positions", "no-cursor-ball", "local-card-clear-of-composer", "cross-topic-same-stance-combination", "source-provenance", "synthesis-direct-split", "idea-direct-split", "bounded-stage", "reload", "console"] };
  } finally { await context.close(); }
}

export async function measureIdle(page) {
  return page.evaluate(async () => {
    const gl = document.querySelector('[data-testid="dialogue-metaball-canvas"]').getContext("webgl2");
    const draw = gl.drawArrays, rect = Element.prototype.getBoundingClientRect;
    let draws = 0, rectReads = 0;
    gl.drawArrays = function (...args) { draws++; return draw.apply(this, args); };
    Element.prototype.getBoundingClientRect = function (...args) { rectReads++; return rect.apply(this, args); };
    const times = [], start = performance.now();
    try { await new Promise(resolve => { const tick = now => { times.push(now); if (now - start >= 4000) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }); }
    finally { gl.drawArrays = draw; Element.prototype.getBoundingClientRect = rect; }
    const intervals = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
    return { durationMs: performance.now() - start, draws, rectReads, rafFrames: times.length, p95FrameMs: intervals[Math.floor(intervals.length * .95)] };
  });
}
