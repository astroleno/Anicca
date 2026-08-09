import { mkdir, access, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const buildIdPath = path.join(repoRoot, ".next", "BUILD_ID");
const finalOutputDir = path.join(repoRoot, "artifacts", "visual-smoke", "dialogue");
let outputDir = finalOutputDir;
let baseUrl = process.env.DIALOGUE_SMOKE_BASE_URL || "http://127.0.0.1:3211";
const baseUrlWasProvided = Boolean(process.env.DIALOGUE_SMOKE_BASE_URL);
const requestedServerMode = process.env.DIALOGUE_SMOKE_SERVER_MODE || "dev";
const serverReadyTimeoutMs = readTimeoutEnv("DIALOGUE_SMOKE_READY_TIMEOUT_MS", 120000);
const pageReadyTimeoutMs = readTimeoutEnv("DIALOGUE_SMOKE_PAGE_TIMEOUT_MS", 300000);
const portSearchLimit = Number.parseInt(process.env.DIALOGUE_SMOKE_PORT_SEARCH_LIMIT || "40", 10);

const viewports = [
  { name: "desktop", width: 1440, height: 980, fullPage: false },
  { name: "tablet", width: 1024, height: 900, fullPage: false },
  { name: "tablet-touch", width: 1024, height: 768, fullPage: false, hasTouch: true, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, fullPage: true },
  { name: "mobile-360", width: 360, height: 740, fullPage: true },
  { name: "mobile-320", width: 320, height: 740, fullPage: true },
  { name: "mobile-touch-390", width: 390, height: 844, fullPage: true, hasTouch: true, isMobile: true }
];

const seededWorkspace = {
  schemaVersion: "anicca-workspace-v2",
  workspaceSessionId: "ws_visual_smoke",
  focusedNodeId: "user_root_1",
  composerParentId: null,
  graph: {
    version: "anicca-dialectic-v2",
    entryIds: ["user_root_1"],
    nodes: {
      user_root_1: {
        id: "user_root_1",
        kind: "user",
        text: "这个方向还值不值得继续投入？",
        createdAt: "2026-04-24T03:00:00.000Z",
        parents: [],
        children: ["asst_thesis_1", "asst_antithesis_1"]
      },
      asst_thesis_1: {
        id: "asst_thesis_1",
        kind: "assistant",
        branchType: "正",
        text: "继续，但把范围切小。",
        createdAt: "2026-04-24T03:01:00.000Z",
        parents: ["user_root_1"],
        children: ["asst_synthesis_1", "user_followup_1"],
        meta: {
          label: "继续",
          summary: "先缩范围，再推进。"
        }
      },
      asst_antithesis_1: {
        id: "asst_antithesis_1",
        kind: "assistant",
        branchType: "反",
        text: "先停一下，别同时铺太开。",
        createdAt: "2026-04-24T03:02:00.000Z",
        parents: ["user_root_1"],
        children: ["asst_synthesis_1"],
        meta: {
          label: "暂停",
          summary: "把摊子收住，再判断。"
        }
      },
      asst_synthesis_1: {
        id: "asst_synthesis_1",
        kind: "assistant",
        branchType: "合",
        text: "保留主线，但拆开节奏。",
        createdAt: "2026-04-24T03:03:00.000Z",
        parents: ["asst_thesis_1", "asst_antithesis_1"],
        children: ["user_followup_2"],
        meta: {
          label: "收束",
          summary: "保留主线，拆开节奏。",
          sourceNodeIds: ["asst_thesis_1", "asst_antithesis_1"],
          lineageParentId: "user_root_1"
        }
      },
      user_followup_1: {
        id: "user_followup_1",
        kind: "user",
        text: "如果继续，最小可验证范围是什么？",
        createdAt: "2026-04-24T03:04:00.000Z",
        parents: ["asst_thesis_1"],
        children: []
      },
      user_followup_2: {
        id: "user_followup_2",
        kind: "user",
        text: "如果按这个节奏推进，第一周只做什么？",
        createdAt: "2026-04-24T03:05:00.000Z",
        parents: ["asst_synthesis_1"],
        children: []
      }
    },
    edges: {
      e1: { id: "e1", from: "user_root_1", to: "asst_thesis_1", reason: "正" },
      e2: { id: "e2", from: "user_root_1", to: "asst_antithesis_1", reason: "反" },
      e3: { id: "e3", from: "asst_thesis_1", to: "asst_synthesis_1", reason: "synthesis" },
      e4: { id: "e4", from: "asst_antithesis_1", to: "asst_synthesis_1", reason: "synthesis" },
      e5: { id: "e5", from: "asst_thesis_1", to: "user_followup_1", reason: "continue" },
      e6: { id: "e6", from: "asst_synthesis_1", to: "user_followup_2", reason: "continue" }
    }
  }
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readTimeoutEnv(name, fallbackMs) {
  const raw = process.env[name];
  if (!raw) {
    return fallbackMs;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive millisecond value, received ${raw}`);
  }

  return value;
}

function createWorkspaceWithoutSynthesis({ includeSecondRoot = false } = {}) {
  const workspace = cloneJson(seededWorkspace);
  workspace.workspaceSessionId = includeSecondRoot ? "ws_visual_flow_stale" : "ws_visual_flow";
  workspace.focusedNodeId = "user_root_1";
  workspace.graph.nodes.asst_thesis_1.children = ["user_followup_1"];
  workspace.graph.nodes.asst_antithesis_1.children = [];
  delete workspace.graph.nodes.asst_synthesis_1;
  delete workspace.graph.nodes.user_followup_2;
  delete workspace.graph.edges.e3;
  delete workspace.graph.edges.e4;
  delete workspace.graph.edges.e6;

  if (includeSecondRoot) {
    workspace.graph.entryIds.push("user_root_2");
    workspace.graph.nodes.user_root_2 = {
      id: "user_root_2",
      kind: "user",
      text: "另一个问题要不要先处理？",
      createdAt: "2026-04-24T03:10:00.000Z",
      parents: [],
      children: ["asst_thesis_2", "asst_antithesis_2"]
    };
    workspace.graph.nodes.asst_thesis_2 = {
      id: "asst_thesis_2",
      kind: "assistant",
      branchType: "正",
      text: "先处理，避免阻塞。",
      createdAt: "2026-04-24T03:11:00.000Z",
      parents: ["user_root_2"],
      children: [],
      meta: {
        label: "先处理",
        summary: "先把阻塞拿掉。"
      }
    };
    workspace.graph.nodes.asst_antithesis_2 = {
      id: "asst_antithesis_2",
      kind: "assistant",
      branchType: "反",
      text: "先不处理，保持主线。",
      createdAt: "2026-04-24T03:12:00.000Z",
      parents: ["user_root_2"],
      children: [],
      meta: {
        label: "先不动",
        summary: "别打断当前主线。"
      }
    };
    workspace.graph.edges.e7 = { id: "e7", from: "user_root_2", to: "asst_thesis_2", reason: "正" };
    workspace.graph.edges.e8 = { id: "e8", from: "user_root_2", to: "asst_antithesis_2", reason: "反" };
  }

  return workspace;
}

function createEmptyWorkspace() {
  const workspace = cloneJson(seededWorkspace);
  workspace.workspaceSessionId = "ws_visual_empty";
  workspace.focusedNodeId = null;
  workspace.graph.entryIds = [];
  workspace.graph.nodes = {};
  workspace.graph.edges = {};
  return workspace;
}

function createGrowthWorkspace(candidateLimit, { withWideStageLayout = false } = {}) {
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 4) {
    throw new Error(`Growth visual fixture requires candidateLimit 1-4, received ${candidateLimit}`);
  }

  const workspace = createEmptyWorkspace();
  const rootId = `growth_matrix_root_${candidateLimit}`;
  const responseIds = Array.from({ length: candidateLimit }, (_, index) => `growth_matrix_response_${candidateLimit}_${index + 1}`);
  const synthesisId = candidateLimit >= 2 ? `growth_matrix_synthesis_${candidateLimit}` : null;
  const childIds = synthesisId ? [...responseIds, synthesisId] : responseIds;

  workspace.workspaceSessionId = `ws_growth_matrix_${candidateLimit}`;
  workspace.focusedNodeId = rootId;
  workspace.graph.entryIds = [rootId];
  workspace.graph.nodes[rootId] = {
    id: rootId,
    kind: "user",
    text: `Growth layout matrix ${candidateLimit}`,
    createdAt: "2026-07-26T00:00:00.000Z",
    parents: [],
    children: childIds,
    meta: { growth: { eventId: `growth_matrix_${candidateLimit}`, memoryRefIds: [] } }
  };

  responseIds.forEach((id, index) => {
    workspace.graph.nodes[id] = {
      id,
      kind: "assistant",
      text: `画作视角 ${index + 1}`,
      createdAt: `2026-07-26T00:00:0${index + 1}.000Z`,
      parents: [rootId],
      children: synthesisId ? [synthesisId] : [],
      meta: {
        label: `视角 ${index + 1}`,
        summary: `Growth 视角 ${index + 1}`,
        growth: {
          eventId: `growth_matrix_${candidateLimit}`,
          operator: "expand",
          artworkId: `matrix_artwork_${index + 1}`,
          memoryRefIds: []
        }
      }
    };
  });

  if (synthesisId) {
    workspace.graph.nodes[synthesisId] = {
      id: synthesisId,
      kind: "assistant",
      text: "画作合并",
      createdAt: "2026-07-26T00:00:09.000Z",
      parents: [rootId, ...responseIds],
      children: [],
      meta: {
        label: "画作合并",
        summary: "合并 Growth 视角",
        sourceNodeIds: responseIds,
        growth: {
          eventId: `growth_matrix_${candidateLimit}`,
          operator: "merge_promote",
          sourceArtworkIds: responseIds,
          memoryRefIds: []
        }
      }
    };
  }

  childIds.forEach((childId, index) => {
    workspace.graph.edges[`growth_matrix_edge_${candidateLimit}_${index + 1}`] = {
      id: `growth_matrix_edge_${candidateLimit}_${index + 1}`,
      from: rootId,
      to: childId,
      reason: childId === synthesisId ? "growth:merge_promote" : "growth:expand"
    };
  });

  if (withWideStageLayout) {
    const columns = Math.ceil(childIds.length / 2);
    const nodePositions = {
      [rootId]: { x: 50, y: 40 }
    };
    childIds.forEach((childId, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const columnsInRow = row === 0 ? Math.min(columns, childIds.length) : childIds.length - columns;
      nodePositions[childId] = {
        x: columnsInRow <= 1 ? 50 : 20 + (60 / (columnsInRow - 1)) * column,
        y: row === 0 ? 65 : 86
      };
    });
    workspace.stageLayouts = {
      [`focus:${rootId}|target:root|trail:${rootId}`]: {
        pan: { x: 18, y: -12 },
        nodePositions
      }
    };
  }

  return workspace;
}

function createWorkspaceWithRetrievalMatch() {
  const workspace = cloneJson(seededWorkspace);
  workspace.workspaceSessionId = "ws_visual_retrieval_debug";
  workspace.focusedNodeId = "asst_thesis_1";
  workspace.graph.entryIds.push("user_related_1");
  workspace.graph.nodes.user_related_1 = {
    id: "user_related_1",
    kind: "user",
    text: "下一步怎么拆的参考",
    createdAt: "2026-04-24T03:20:00.000Z",
    parents: [],
    children: ["asst_related_thesis_1", "asst_related_antithesis_1"]
  };
  workspace.graph.nodes.asst_related_thesis_1 = {
    id: "asst_related_thesis_1",
    kind: "assistant",
    branchType: "正",
    text: "先列一张拆分清单。",
    createdAt: "2026-04-24T03:21:00.000Z",
    parents: ["user_related_1"],
    children: [],
    meta: {
      label: "拆分",
      summary: "拆分参考"
    }
  };
  workspace.graph.nodes.asst_related_antithesis_1 = {
    id: "asst_related_antithesis_1",
    kind: "assistant",
    branchType: "反",
    text: "先延后拆分。",
    createdAt: "2026-04-24T03:22:00.000Z",
    parents: ["user_related_1"],
    children: [],
    meta: {
      label: "延后",
      summary: "延后参考"
    }
  };
  workspace.graph.edges.e_related_1 = { id: "e_related_1", from: "user_related_1", to: "asst_related_thesis_1", reason: "正" };
  workspace.graph.edges.e_related_2 = { id: "e_related_2", from: "user_related_1", to: "asst_related_antithesis_1", reason: "反" };
  return workspace;
}

async function buildExists() {
  try {
    await access(buildIdPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveServerMode() {
  if (!["auto", "dev", "start"].includes(requestedServerMode)) {
    throw new Error(`Unsupported DIALOGUE_SMOKE_SERVER_MODE=${requestedServerMode}. Use auto, dev, or start.`);
  }

  if (requestedServerMode === "auto") {
    return (await buildExists()) ? "start" : "dev";
  }

  if (requestedServerMode === "start" && !(await buildExists())) {
    throw new Error("DIALOGUE_SMOKE_SERVER_MODE=start requires .next build output. Run `npm run build` first or use DIALOGUE_SMOKE_SERVER_MODE=dev.");
  }

  return requestedServerMode;
}

function getBaseUrlParts(value) {
  const url = new URL(value);
  if (url.protocol !== "http:") {
    throw new Error(`DIALOGUE_SMOKE_BASE_URL must use http:, received ${value}`);
  }
  if (!url.port) {
    throw new Error(`DIALOGUE_SMOKE_BASE_URL must include an explicit port, received ${value}`);
  }

  return {
    host: url.hostname,
    port: Number.parseInt(url.port, 10),
    origin: url.origin
  };
}

async function isPortAvailable(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error && ["EADDRINUSE", "EACCES"].includes(error.code)) {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function resolveBaseUrl() {
  const requested = getBaseUrlParts(baseUrl);

  if (baseUrlWasProvided) {
    if (!(await isPortAvailable(requested.host, requested.port))) {
      throw new Error(
        `Dialogue visual smoke port ${requested.host}:${requested.port} is already in use. ` +
          "Choose another DIALOGUE_SMOKE_BASE_URL or stop the existing process."
      );
    }
    baseUrl = requested.origin;
    return baseUrl;
  }

  const searchLimit = Number.isFinite(portSearchLimit) && portSearchLimit > 0 ? portSearchLimit : 40;
  for (let offset = 0; offset < searchLimit; offset += 1) {
    const port = requested.port + offset;
    if (await isPortAvailable(requested.host, port)) {
      const resolved = new URL(requested.origin);
      resolved.port = String(port);
      baseUrl = resolved.origin;
      return baseUrl;
    }
  }

  throw new Error(
    `No available dialogue visual smoke port found from ${requested.host}:${requested.port} ` +
      `through ${requested.host}:${requested.port + searchLimit - 1}.`
  );
}

async function prepareOutputDir() {
  const outputParentDir = path.dirname(finalOutputDir);
  await mkdir(outputParentDir, { recursive: true });
  outputDir = await mkdtemp(path.join(outputParentDir, ".dialogue-"));
  return outputDir;
}

async function publishOutputDir(tempOutputDir) {
  const previousOutputDir = `${finalOutputDir}.previous-${process.pid}`;
  await rm(previousOutputDir, { recursive: true, force: true });

  try {
    await rename(finalOutputDir, previousOutputDir);
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      throw error;
    }
  }

  try {
    await rename(tempOutputDir, finalOutputDir);
    await rm(previousOutputDir, { recursive: true, force: true });
    outputDir = finalOutputDir;
  } catch (error) {
    try {
      await access(finalOutputDir, fsConstants.F_OK);
    } catch {
      await rename(previousOutputDir, finalOutputDir).catch(() => {});
    }
    throw error;
  }
}

async function discardOutputDir(tempOutputDir) {
  if (tempOutputDir && tempOutputDir !== finalOutputDir) {
    await rm(tempOutputDir, { recursive: true, force: true });
  }
}

function rebaseArtifactPaths(value, tempOutputDir) {
  if (typeof value === "string") {
    return value.startsWith(tempOutputDir)
      ? `${path.relative(repoRoot, finalOutputDir)}${value.slice(tempOutputDir.length)}`
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rebaseArtifactPaths(item, tempOutputDir));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rebaseArtifactPaths(item, tempOutputDir)])
    );
  }

  return value;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatServerOutput(output) {
  return output ? `\n\nNext output:\n${output}` : "";
}

function serverExitedError(server, phase) {
  const exitInfo = server.getExitInfo();
  const spawnError = server.getSpawnError();
  if (spawnError) {
    return new Error(`Next server failed to start before ${phase}: ${spawnError.message}${formatServerOutput(server.getOutput())}`);
  }
  if (exitInfo) {
    return new Error(
      `Next server exited before ${phase} (code ${exitInfo.code ?? "null"}, signal ${exitInfo.signal ?? "null"}).` +
        formatServerOutput(server.getOutput())
    );
  }
  return null;
}

async function waitForNextReady(server, timeoutMs = serverReadyTimeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const earlyExit = serverExitedError(server, "it became ready");
    if (earlyExit) {
      throw earlyExit;
    }

    if (/ready in|started server|listening/i.test(server.getOutput())) {
      return;
    }

    await wait(250);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for Next server readiness.` +
      formatServerOutput(server.getOutput())
  );
}

async function waitForServer(url, server, timeoutMs = pageReadyTimeoutMs) {
  const startedAt = Date.now();
  let lastErrorMessage = "";

  while (Date.now() - startedAt < timeoutMs) {
    const earlyExit = serverExitedError(server, url);
    if (earlyExit) {
      throw earlyExit;
    }

    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
      lastErrorMessage = `HTTP ${response.status}`;
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
      // Retry until timeout.
    }

    await wait(500);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${url}` +
      (lastErrorMessage ? ` (last error: ${lastErrorMessage})` : "") +
      formatServerOutput(server.getOutput())
  );
}

function startNextServer(serverMode) {
  const { host, port } = getBaseUrlParts(baseUrl);
  const scriptName = serverMode === "start" ? "start" : "dev";
  const child = spawn(
    "npm",
    ["run", scriptName, "--", "--hostname", host, "--port", String(port)],
    {
      cwd: repoRoot,
      env: {
        ...process.env
      },
      stdio: "pipe"
    }
  );

  let stderr = "";
  let stdout = "";
  let exitInfo = null;
  let spawnError = null;
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  child.once("exit", (code, signal) => {
    exitInfo = { code, signal };
  });

  return {
    child,
    getOutput: () => `${stdout}\n${stderr}`.trim(),
    getExitInfo: () => exitInfo,
    getSpawnError: () => spawnError
  };
}

async function ensureNoHorizontalOverflow(page, viewportName) {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dialogue-shell"]');
    const doc = document.documentElement;
    const body = document.body;

    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      shellScrollWidth: shell instanceof HTMLElement ? shell.scrollWidth : null,
      shellClientWidth: shell instanceof HTMLElement ? shell.clientWidth : null
    };
  });

  const widthChecks = [
    metrics.docScrollWidth <= metrics.docClientWidth + 1,
    metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1,
    metrics.shellScrollWidth === null || metrics.shellScrollWidth <= metrics.shellClientWidth + 1
  ];

  if (widthChecks.includes(false)) {
    throw new Error(`Horizontal overflow detected on ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function assertRegionWidth(locator, viewportWidth, name) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} did not render`);
  }

  if (box.x < -1 || box.x + box.width > viewportWidth + 1) {
    throw new Error(`${name} overflowed horizontally: ${JSON.stringify(box)}`);
  }
}

async function assertRegionMinWidth(locator, minWidth, name) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} did not render`);
  }

  if (box.width < minWidth) {
    throw new Error(`${name} is too narrow: ${JSON.stringify(box)}`);
  }
}

async function assertRegionVisible(locator, viewportHeight, name) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} did not render`);
  }

  if (box.y < -1 || box.y + box.height > viewportHeight + 1) {
    throw new Error(`${name} was not fully visible: ${JSON.stringify(box)}`);
  }
}

async function ensureChoiceButtonsAccessibleAndTouchable(page, minTargetSize = 44) {
  const composer = page.getByTestId("dialogue-composer");
  const buttons = [
    composer.getByRole("button", { name: /继续推进正方/ }),
    composer.getByRole("button", { name: /暂缓判断反方/ }),
    composer.getByRole("button", { name: /合流记录/ })
  ];

  for (const [index, button] of buttons.entries()) {
    await button.waitFor();
    const box = await button.boundingBox();
    if (!box) {
      throw new Error(`Choice button ${index} did not render`);
    }
    if (box.width < minTargetSize || box.height < minTargetSize) {
      throw new Error(`Choice button ${index} is below touch target size: ${JSON.stringify(box)}`);
    }
  }
}

async function ensureMobileChoiceContextVisible(page, viewportWidth, viewportHeight) {
  const context = page.getByTestId("dialogue-decision-context");
  await context.waitFor();
  await context.filter({ hasText: "这个方向还值不值得继续投入？" }).waitFor();
  await context.filter({ hasText: "先缩范围，再推进。" }).waitFor();
  await context.filter({ hasText: "把摊子收住，再判断。" }).waitFor();
  await assertRegionWidth(context, viewportWidth, "mobile choice context");
  await assertRegionVisible(context, viewportHeight, "mobile choice context");

  const metrics = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="dialogue-composer"]');
    const contextElement = document.querySelector('[data-testid="dialogue-decision-context"]');
    if (!(composer instanceof HTMLElement) || !(contextElement instanceof HTMLElement)) {
      return null;
    }

    const composerRect = composer.getBoundingClientRect();
    const contextRect = contextElement.getBoundingClientRect();
    const actions = [...composer.querySelectorAll("button")].flatMap((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
        return [];
      }

      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right
      };
    });

    return {
      composer: {
        top: composerRect.top,
        bottom: composerRect.bottom,
        left: composerRect.left,
        right: composerRect.right
      },
      context: {
        top: contextRect.top,
        bottom: contextRect.bottom,
        left: contextRect.left,
        right: contextRect.right
      },
      actions
    };
  });

  if (!metrics) {
    throw new Error("Missing mobile choice context metrics");
  }

  const contextInsideComposer = (
    metrics.context.top >= metrics.composer.top - 1 &&
    metrics.context.bottom <= metrics.composer.bottom + 1 &&
    metrics.context.left >= metrics.composer.left - 1 &&
    metrics.context.right <= metrics.composer.right + 1
  );
  const actionsInsideComposer = metrics.actions.every((action) => (
    action.top >= metrics.composer.top - 1 &&
    action.bottom <= metrics.composer.bottom + 1 &&
    action.left >= metrics.composer.left - 1 &&
    action.right <= metrics.composer.right + 1
  ));

  if (!contextInsideComposer || !actionsInsideComposer) {
    throw new Error(`Mobile choice context and actions are not in the same tray: ${JSON.stringify(metrics)}`);
  }
}

async function ensureMobileComposerSingleColumn(page, viewportName) {
  const metrics = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="dialogue-composer"]');
    if (!(composer instanceof HTMLElement)) {
      return null;
    }

    if (composer.dataset.mode !== "compose") {
      return { mode: composer.dataset.mode };
    }

    const textarea = composer.querySelector("textarea");
    const submit = composer.querySelector('button[type="submit"]');
    if (!(textarea instanceof HTMLElement) || !(submit instanceof HTMLElement)) {
      return null;
    }

    const composerRect = composer.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const submitRect = submit.getBoundingClientRect();

    return {
      mode: composer.dataset.mode,
      composerWidth: composerRect.width,
      textarea: {
        top: textareaRect.top,
        bottom: textareaRect.bottom,
        width: textareaRect.width
      },
      submit: {
        top: submitRect.top,
        bottom: submitRect.bottom,
        width: submitRect.width
      }
    };
  });

  if (!metrics) {
    throw new Error(`Missing composer single-column metrics on ${viewportName}`);
  }

  if (metrics.mode !== "compose") {
    return;
  }

  const minWidth = metrics.composerWidth * 0.82;
  if (metrics.textarea.width < minWidth || metrics.submit.width < minWidth) {
    throw new Error(`Mobile composer controls are not full-width on ${viewportName}: ${JSON.stringify(metrics)}`);
  }

  if (metrics.submit.top < metrics.textarea.bottom + 4) {
    throw new Error(`Mobile composer controls are still side-by-side on ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function ensureEmptyRootPendingState(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, createEmptyWorkspace(), {
    viewport: { width: 1280, height: 900 }
  });

  await page.route("**/api/branches", async () => {
    await new Promise(() => {});
  });

  await page.getByRole("button", { name: /点此输入/ }).click();
  await page.getByLabel("输入").fill("这个方向还值得投入吗");
  await page.getByRole("button", { name: "开启新主题" }).click();
  await page.getByTestId("dialogue-stage-pending-branches").waitFor();
  await page.getByTestId("dialogue-stage-pending-branches").filter({ hasText: "这个方向还值得投入吗" }).waitFor();
  await page.getByTestId("dialogue-panel-pending-branches").filter({ hasText: "母题已进入舞台" }).waitFor();
  await page.getByTestId("dialogue-sidebar").filter({ hasText: "正在生成正与反" }).waitFor();
  const emptyStartAffordances = await page.getByRole("button", { name: /点此输入/ }).count();
  if (emptyStartAffordances > 0) {
    throw new Error("Empty start affordance is still visible while root branches are pending");
  }

  const screenshotPath = path.join(outputDir, "desktop-pending-empty-root.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  assertNoPageIssues(pageIssues, "empty root pending state");
  await context.close();

  return {
    name: "empty-root-pending-state",
    passed: true,
    screenshot: screenshotPath
  };
}

async function ensureMobileComposerDoesNotCoverLineage(page) {
  const metrics = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="dialogue-composer"]');
    const lineageButtons = [...document.querySelectorAll('[data-testid="dialogue-sidebar"] button')];
    if (!(composer instanceof HTMLElement) || lineageButtons.length === 0) {
      return null;
    }

    const composerRect = composer.getBoundingClientRect();
    const overlappingButton = lineageButtons.find((button) => {
      if (!(button instanceof HTMLElement)) {
        return false;
      }
      const lineageRect = button.getBoundingClientRect();
      return (
        lineageRect.left < composerRect.right &&
        lineageRect.right > composerRect.left &&
        lineageRect.top < composerRect.bottom &&
        lineageRect.bottom > composerRect.top
      );
    });
    const lineageRect = overlappingButton instanceof HTMLElement
      ? overlappingButton.getBoundingClientRect()
      : lineageButtons[0] instanceof HTMLElement
        ? lineageButtons[0].getBoundingClientRect()
        : null;

    return {
      overlaps: Boolean(overlappingButton),
      composer: {
        top: composerRect.top,
        bottom: composerRect.bottom,
        height: composerRect.height
      },
      lineage: {
        top: lineageRect?.top,
        bottom: lineageRect?.bottom,
        height: lineageRect?.height
      }
    };
  });

  if (!metrics) {
    throw new Error("Missing mobile composer or lineage metrics");
  }

  if (metrics.overlaps) {
    throw new Error(`Mobile composer overlaps lineage controls: ${JSON.stringify(metrics)}`);
  }
}

async function ensureMobileComposerDoesNotCoverPanelActions(page) {
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="dialogue-panel"]');
    if (panel instanceof HTMLElement) {
      panel.scrollIntoView({ block: "center", inline: "nearest" });
    }
  });
  await page.waitForTimeout(80);

  const metrics = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="dialogue-composer"]');
    const panel = document.querySelector('[data-testid="dialogue-panel"]');
    if (!(composer instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return null;
    }

    const composerRect = composer.getBoundingClientRect();
    const panelActions = [...panel.querySelectorAll("button")].filter((button) => button instanceof HTMLElement);
    const overlappingAction = panelActions.find((button) => {
      const actionRect = button.getBoundingClientRect();
      return (
        actionRect.left < composerRect.right &&
        actionRect.right > composerRect.left &&
        actionRect.top < composerRect.bottom &&
        actionRect.bottom > composerRect.top
      );
    });
    const actionRect = overlappingAction instanceof HTMLElement
      ? overlappingAction.getBoundingClientRect()
      : panelActions[0] instanceof HTMLElement
        ? panelActions[0].getBoundingClientRect()
        : null;

    return {
      overlaps: Boolean(overlappingAction),
      composer: {
        top: composerRect.top,
        bottom: composerRect.bottom,
        height: composerRect.height
      },
      action: {
        text: overlappingAction instanceof HTMLElement ? overlappingAction.textContent : panelActions[0]?.textContent,
        top: actionRect?.top,
        bottom: actionRect?.bottom,
        height: actionRect?.height
      }
    };
  });

  if (!metrics) {
    throw new Error("Missing mobile composer or panel action metrics");
  }

  if (metrics.overlaps) {
    throw new Error(`Mobile composer overlaps panel actions: ${JSON.stringify(metrics)}`);
  }
}

async function ensureMobileRootNodeHasVisibleText(page) {
  const metrics = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="dialogue-stage-node-user_root_1"]');
    if (!(root instanceof HTMLElement)) {
      return null;
    }

    const textCandidates = [
      root.querySelector('[class*="stageNodeTextFull"]'),
      root.querySelector('[class*="stageNodeTextShort"]')
    ].filter((element) => element instanceof HTMLElement);
    const visibleText = textCandidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          text: element.textContent?.trim() || "",
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height
        };
      })
      .filter(
        (entry) =>
          entry.text &&
          entry.display !== "none" &&
          entry.visibility !== "hidden" &&
          entry.width > 0 &&
          entry.height > 0
      );

    return {
      rootText: root.textContent?.trim() || "",
      visibleText
    };
  });

  if (!metrics) {
    throw new Error("Missing mobile root node text metrics");
  }

  if (!metrics.visibleText.length) {
    throw new Error(`Mobile root node has no visible topic text: ${JSON.stringify(metrics)}`);
  }
}

async function ensureStageHintDoesNotOverlapWorkspace(page, scenarioName) {
  const metrics = await page.evaluate(() => {
    const hint = document.querySelector('[data-testid="dialogue-stage-hint"]');
    const workspace = document.querySelector('[data-testid="dialogue-workspace-bar"]');
    if (!(hint instanceof HTMLElement) || !(workspace instanceof HTMLElement)) {
      return null;
    }

    const hintRect = hint.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const overlaps = (
      hintRect.left < workspaceRect.right &&
      hintRect.right > workspaceRect.left &&
      hintRect.top < workspaceRect.bottom &&
      hintRect.bottom > workspaceRect.top
    );

    return {
      overlaps,
      hint: {
        left: hintRect.left,
        right: hintRect.right,
        top: hintRect.top,
        bottom: hintRect.bottom
      },
      workspace: {
        left: workspaceRect.left,
        right: workspaceRect.right,
        top: workspaceRect.top,
        bottom: workspaceRect.bottom
      }
    };
  });

  if (metrics?.overlaps) {
    throw new Error(`Stage relationship hint overlaps workspace chrome during ${scenarioName}: ${JSON.stringify(metrics)}`);
  }
}

async function ensureFocusedSidebarItemFullyVisible(page, viewportName) {
  const metrics = await page.evaluate(() => {
    const currentItem = document.querySelector(
      '[data-testid="dialogue-sidebar"] nav[aria-label="分支列表"] button[aria-current="true"]'
    );
    if (!(currentItem instanceof HTMLElement)) {
      return null;
    }

    const rect = currentItem.getBoundingClientRect();
    return {
      itemText: currentItem.textContent?.trim() || "",
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth
    };
  });

  if (!metrics) {
    return;
  }

  if (metrics.left < -1 || metrics.right > metrics.viewportWidth + 1) {
    throw new Error(`Focused sidebar item is clipped on ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function ensureVisibleSidebarItemsNotClipped(page, viewportName) {
  const clippedItems = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="dialogue-sidebar"] nav[aria-label="分支列表"] button')];
    return buttons.flatMap((button) => {
      if (!(button instanceof HTMLElement)) {
        return [];
      }

      const rect = button.getBoundingClientRect();
      const isVisibleInViewport = (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
      if (!isVisibleInViewport) {
        return [];
      }

      if (rect.left < -1 || rect.right > window.innerWidth + 1) {
        return [{
          text: button.textContent?.trim() || "",
          left: rect.left,
          right: rect.right,
          width: rect.width,
          viewportWidth: window.innerWidth
        }];
      }

      return [];
    });
  });

  if (clippedItems.length) {
    throw new Error(`Visible sidebar items are clipped on ${viewportName}: ${JSON.stringify(clippedItems)}`);
  }
}

async function getPageScrollMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dialogue-shell"]');
    const doc = document.documentElement;
    const body = document.body;
    const shellElement = shell instanceof HTMLElement ? shell : null;

    return {
      windowScrollY: window.scrollY,
      docScrollTop: doc.scrollTop,
      bodyScrollTop: body.scrollTop,
      shellScrollTop: shellElement?.scrollTop ?? null,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      shellScrollHeight: shellElement?.scrollHeight ?? null,
      shellClientHeight: shellElement?.clientHeight ?? null
    };
  });
}

async function resetPageScroll(page) {
  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dialogue-shell"]');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (shell instanceof HTMLElement) {
      shell.scrollTop = 0;
    }
  });
  await page.waitForTimeout(60);
  return getPageScrollMetrics(page);
}

async function ensureMobileCanScrollFromStage(page, viewportName) {
  const before = await resetPageScroll(page);
  const scrollableDistance = Math.max(
    before.docScrollHeight - before.docClientHeight,
    before.bodyScrollHeight - before.bodyClientHeight,
    before.shellScrollHeight && before.shellClientHeight
      ? before.shellScrollHeight - before.shellClientHeight
      : 0
  );

  if (scrollableDistance < 120) {
    throw new Error(`Mobile page does not expose enough vertical scroll on ${viewportName}: ${JSON.stringify(before)}`);
  }

  const stageViewport = page.getByTestId("dialogue-stage-viewport");
  const box = await stageViewport.boundingBox();
  if (!box) {
    throw new Error(`Missing stage viewport for mobile scroll check on ${viewportName}`);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 180));
  await page.mouse.wheel(0, 420);
  const beforePosition = Math.max(
    before.windowScrollY,
    before.docScrollTop,
    before.bodyScrollTop,
    before.shellScrollTop ?? 0
  );
  await page.waitForFunction(
    (initialPosition) => {
      const shell = document.querySelector('[data-testid="dialogue-shell"]');
      return Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
        shell instanceof HTMLElement ? shell.scrollTop : 0
      ) > initialPosition + 24;
    },
    beforePosition,
    { timeout: 2000 }
  ).catch(() => {});

  const after = await getPageScrollMetrics(page);
  const afterPosition = Math.max(
    after.windowScrollY,
    after.docScrollTop,
    after.bodyScrollTop,
    after.shellScrollTop ?? 0
  );

  if (afterPosition <= beforePosition + 24) {
    throw new Error(`Mobile page did not scroll from the stage area on ${viewportName}: ${JSON.stringify({ before, after })}`);
  }
}

async function ensureTouchViewportSemantics(page) {
  const metrics = await page.evaluate(() => {
    const stageViewport = document.querySelector('[data-testid="dialogue-stage-viewport"]');
    if (!(stageViewport instanceof HTMLElement)) {
      return null;
    }

    return {
      touchAction: getComputedStyle(stageViewport).touchAction,
      pageText: document.body.textContent || ""
    };
  });

  if (!metrics) {
    throw new Error("Missing touch viewport metrics");
  }

  if (metrics.touchAction !== "pan-y") {
    throw new Error(`Touch viewport should allow pan-y scrolling: ${JSON.stringify(metrics)}`);
  }

  if (metrics.pageText.includes("整理舞台")) {
    throw new Error(`Touch viewport still shows fine-pointer hint: ${JSON.stringify(metrics)}`);
  }
}

async function ensureTouchNodeTapSelects(page) {
  await page.getByTestId("dialogue-stage-node-asst_thesis_1").tap();
  await page.getByRole("heading", { name: "继续" }).waitFor();
  await page
    .locator('[data-testid="dialogue-sidebar"] button[aria-current="true"]')
    .filter({ hasText: "继续" })
    .waitFor();
  await page.getByTestId("dialogue-stage-node-user_root_1").tap();
  await page.getByRole("heading", { name: /这个方向/ }).waitFor();
  await page
    .locator('[data-testid="dialogue-sidebar"] button[aria-current="true"]')
    .filter({ hasText: "这个方向" })
    .waitFor();
}

async function createScenarioPage(
  browser,
  workspace,
  contextOptions = {},
  routePath = "/dialogue",
  initScripts = []
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    ...contextOptions
  });

  await context.addInitScript((snapshot) => {
    window.localStorage.setItem("anicca_workspace_v2", JSON.stringify(snapshot));
  }, workspace);

  for (const initScript of initScripts) {
    await context.addInitScript(initScript);
  }

  const page = await context.newPage();
  const pageIssues = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      /hydration|did not match|server rendered|text content does not match/i.test(text)
    ) {
      pageIssues.push({
        type: `console:${message.type()}`,
        text
      });
    }
  });
  page.on("pageerror", (error) => {
    pageIssues.push({
      type: "pageerror",
      text: error.message
    });
  });

  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle" });
  await page.getByTestId("dialogue-stage").waitFor();
  await page.getByTestId("dialogue-panel").waitFor();

  return { context, page, pageIssues };
}

async function assertMetaballStage(page, scenarioName, expectedState = "ready") {
  const track = page.getByTestId("dialogue-stage-track");
  const canvas = page.getByTestId("dialogue-metaball-canvas");
  await canvas.waitFor({ state: "attached" });
  await page.waitForFunction(
    ({ state }) =>
      document.querySelector('[data-testid="dialogue-stage-track"]')?.getAttribute("data-metaball-renderer") === state,
    { state: expectedState }
  );

  const svgCount = await track.locator("svg").count();
  if (svgCount !== 0) {
    throw new Error(`Stage SVG lines remain during ${scenarioName}: ${svgCount}`);
  }

  const metrics = await page.evaluate(() => {
    const trackElement = document.querySelector('[data-testid="dialogue-stage-track"]');
    const canvasElement = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
    if (!(trackElement instanceof HTMLElement) || !(canvasElement instanceof HTMLCanvasElement)) {
      return null;
    }

    const trackRect = trackElement.getBoundingClientRect();
    const canvasRect = canvasElement.getBoundingClientRect();
    const canvasStyle = getComputedStyle(canvasElement);
    return {
      state: trackElement.dataset.metaballRenderer,
      track: { width: trackRect.width, height: trackRect.height },
      canvas: {
        width: canvasRect.width,
        height: canvasRect.height,
        backingWidth: canvasElement.width,
        backingHeight: canvasElement.height,
        display: canvasStyle.display
      }
    };
  });

  if (!metrics) {
    throw new Error(`Missing metaball stage metrics during ${scenarioName}`);
  }

  if (expectedState === "ready") {
    const widthDelta = Math.abs(metrics.track.width - metrics.canvas.width);
    const heightDelta = Math.abs(metrics.track.height - metrics.canvas.height);
    if (widthDelta > 1 || heightDelta > 1) {
      throw new Error(`Metaball canvas does not cover its track during ${scenarioName}: ${JSON.stringify(metrics)}`);
    }

    const scaleCap = metrics.track.width <= 640 ? 0.9 : 1.25;
    const maxBackingWidth = Math.ceil(metrics.canvas.width * scaleCap) + 1;
    const maxBackingHeight = Math.ceil(metrics.canvas.height * scaleCap) + 1;
    if (
      metrics.canvas.backingWidth > maxBackingWidth ||
      metrics.canvas.backingHeight > maxBackingHeight
    ) {
      throw new Error(`Metaball backing buffer exceeds its DPR budget during ${scenarioName}: ${JSON.stringify(metrics)}`);
    }
  } else if (metrics.canvas.display !== "none") {
    throw new Error(`Fallback canvas remains visible during ${scenarioName}: ${JSON.stringify(metrics)}`);
  }

  return metrics;
}

async function assertStageNodesInteractive(stage, scenarioName) {
  const failures = await stage.locator('[data-testid^="dialogue-stage-node-"]').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (!(node instanceof HTMLButtonElement)) {
        return [{ testId: node.getAttribute("data-testid"), reason: "not-button" }];
      }
      const rect = node.getBoundingClientRect();
      if (node.disabled || node.tabIndex < 0 || rect.width < 44 || rect.height < 44) {
        return [{
          testId: node.dataset.testid,
          reason: "not-interactive",
          disabled: node.disabled,
          tabIndex: node.tabIndex,
          width: rect.width,
          height: rect.height
        }];
      }
      return [];
    })
  );

  if (failures.length) {
    throw new Error(`Stage nodes are not clickable and focusable during ${scenarioName}: ${JSON.stringify(failures)}`);
  }
}

async function readPersistedGraphCounts(page) {
  return page.evaluate(() => {
    const activeWorkspaceId = window.localStorage.getItem("anicca_workspace_active_v1");
    const raw = activeWorkspaceId
      ? window.localStorage.getItem(`anicca_workspace_snapshot_v1:${activeWorkspaceId}`)
      : window.localStorage.getItem("anicca_workspace_v2");
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    return {
      nodes: Object.keys(snapshot.graph?.nodes || {}).length,
      edges: Object.keys(snapshot.graph?.edges || {}).length
    };
  });
}

async function ensureMetaballFusionAndSeparation(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, seededWorkspace, {
    viewport: { width: 1440, height: 980 }
  });
  await assertMetaballStage(page, "metaball fusion and separation");
  const pair = "asst_thesis_1::user_root_1";
  const root = page.getByTestId("dialogue-stage-node-user_root_1");
  const thesis = page.getByTestId("dialogue-stage-node-asst_thesis_1");
  const rootBox = await root.boundingBox();
  const thesisBox = await thesis.boundingBox();
  if (!rootBox || !thesisBox) {
    throw new Error("Metaball fusion drag targets are not measurable");
  }

  await page.waitForFunction(
    ({ expectedPair }) =>
      !(document.querySelector('[data-testid="dialogue-metaball-canvas"]')?.getAttribute("data-fused-pairs") || "")
        .split(",")
        .includes(expectedPair),
    { expectedPair: pair }
  );
  const graphBefore = await readPersistedGraphCounts(page);
  if (!graphBefore) {
    throw new Error("Metaball fusion scenario could not read persisted graph counts before dragging");
  }
  const originalCenter = {
    x: thesisBox.x + thesisBox.width / 2,
    y: thesisBox.y + thesisBox.height / 2
  };
  const fusedCenter = {
    x: rootBox.x + rootBox.width / 2 - 112,
    y: rootBox.y + rootBox.height / 2
  };
  let pointerDown = false;

  try {
    await page.mouse.move(originalCenter.x, originalCenter.y);
    await page.mouse.down();
    pointerDown = true;
    await page.mouse.move(fusedCenter.x, fusedCenter.y, { steps: 16 });
    await page.waitForFunction(
      ({ expectedPair }) =>
        (document.querySelector('[data-testid="dialogue-metaball-canvas"]')?.getAttribute("data-fused-pairs") || "")
          .split(",")
          .includes(expectedPair),
      { expectedPair: pair }
    );

    const fusedScreenshotPath = path.join(outputDir, "desktop-metaball-fused.png");
    await page.screenshot({ path: fusedScreenshotPath, fullPage: false });

    await page.mouse.move(originalCenter.x, originalCenter.y, { steps: 16 });
    await page.waitForFunction(
      ({ expectedPair }) =>
        !(document.querySelector('[data-testid="dialogue-metaball-canvas"]')?.getAttribute("data-fused-pairs") || "")
          .split(",")
          .includes(expectedPair),
      { expectedPair: pair }
    );
    await page.mouse.up();
    pointerDown = false;

    const graphAfter = await readPersistedGraphCounts(page);
    if (!graphAfter) {
      throw new Error("Metaball fusion scenario could not read persisted graph counts after dragging");
    }
    if (JSON.stringify(graphAfter) !== JSON.stringify(graphBefore)) {
      throw new Error(`Metaball drag mutated graph counts: ${JSON.stringify({ graphBefore, graphAfter })}`);
    }
    assertNoPageIssues(pageIssues, "metaball fusion and separation");
    await context.close();

    return {
      name: "metaball-fusion-separation",
      passed: true,
      pair,
      graphBefore,
      graphAfter,
      screenshot: fusedScreenshotPath
    };
  } finally {
    if (pointerDown) {
      await page.mouse.up().catch(() => {});
    }
    await context.close().catch(() => {});
  }
}

async function ensureMetaballReducedMotion(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, seededWorkspace, {
    viewport: { width: 1440, height: 980 },
    reducedMotion: "reduce"
  });
  await assertMetaballStage(page, "reduced-motion metaball");
  await page.evaluate(() => document.fonts.ready);
  const stage = page.getByTestId("dialogue-stage");
  const first = await stage.screenshot();
  await page.waitForTimeout(500);
  const second = await stage.screenshot();
  if (!first.equals(second)) {
    throw new Error("Reduced-motion metaball stage changed across a 500ms interval");
  }

  const screenshotPath = path.join(outputDir, "desktop-metaball-reduced-motion.png");
  await stage.screenshot({ path: screenshotPath });
  assertNoPageIssues(pageIssues, "reduced-motion metaball");
  await context.close();
  return { name: "metaball-reduced-motion", passed: true, screenshot: screenshotPath };
}

async function ensureMetaballWebglFallback(browser) {
  const disableWebgl = () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId, options) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(String(contextId))) {
        return null;
      }
      return originalGetContext.call(this, contextId, options);
    };
  };
  const { context, page, pageIssues } = await createScenarioPage(
    browser,
    seededWorkspace,
    { viewport: { width: 1440, height: 980 } },
    "/dialogue",
    [disableWebgl]
  );
  await assertMetaballStage(page, "WebGL fallback", "fallback");
  const root = page.getByTestId("dialogue-stage-node-user_root_1");
  const fallbackMetrics = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: rect.width,
      height: rect.height,
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor
    };
  });
  if (
    fallbackMetrics.width < 44 ||
    fallbackMetrics.height < 44 ||
    (fallbackMetrics.backgroundImage === "none" && fallbackMetrics.backgroundColor === "rgba(0, 0, 0, 0)")
  ) {
    throw new Error(`CSS fallback blob is not visible: ${JSON.stringify(fallbackMetrics)}`);
  }

  const thesis = page.getByTestId("dialogue-stage-node-asst_thesis_1");
  await thesis.focus();
  await ensureActiveElement(page, { testId: "dialogue-stage-node-asst_thesis_1" });
  await thesis.click();
  await page.getByRole("heading", { name: "继续" }).waitFor();
  const screenshotPath = path.join(outputDir, "desktop-metaball-fallback.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  assertNoPageIssues(pageIssues, "WebGL fallback");
  await context.close();
  return { name: "metaball-webgl-fallback", passed: true, screenshot: screenshotPath };
}

function assertNoPageIssues(pageIssues, scenarioName) {
  if (pageIssues.length) {
    throw new Error(`Console or page errors detected during ${scenarioName}: ${JSON.stringify(pageIssues, null, 2)}`);
  }
}

async function collectVisibleStageNodeBoxes(stage, scenarioName, expectedNodeCount) {
  const viewportBox = await stage.getByTestId("dialogue-stage-viewport").boundingBox();
  if (!viewportBox) {
    throw new Error(`Growth stage viewport is not measurable on ${scenarioName}`);
  }

  const nodeBoxes = await stage.locator('[data-testid^="dialogue-stage-node-"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        testId: node.getAttribute("data-testid"),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    })
  );

  if (nodeBoxes.length !== expectedNodeCount) {
    throw new Error(`Growth stage node count mismatch on ${scenarioName}: ${JSON.stringify({ expectedNodeCount, nodeBoxes })}`);
  }

  for (const node of nodeBoxes) {
    const clipped =
      node.left < viewportBox.x ||
      node.right > viewportBox.x + viewportBox.width ||
      node.top < viewportBox.y ||
      node.bottom > viewportBox.y + viewportBox.height;
    if (clipped) {
      throw new Error(`Growth stage node is clipped on ${scenarioName}: ${JSON.stringify({ viewportBox, node })}`);
    }
  }

  for (let leftIndex = 0; leftIndex < nodeBoxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodeBoxes.length; rightIndex += 1) {
      const left = nodeBoxes[leftIndex];
      const right = nodeBoxes[rightIndex];
      const overlaps =
        left.left < right.right &&
        left.right > right.left &&
        left.top < right.bottom &&
        left.bottom > right.top;
      if (overlaps) {
        throw new Error(`Growth stage nodes overlap on ${scenarioName}: ${JSON.stringify({ left, right })}`);
      }
    }
  }

  return nodeBoxes;
}

function assertStageNodePositionsMatchBaseline(actualNodes, baselineNodes, scenarioName) {
  const baselineByTestId = new Map(baselineNodes.map((node) => [node.testId, node]));

  for (const actualNode of actualNodes) {
    const baselineNode = baselineByTestId.get(actualNode.testId);
    if (!baselineNode) {
      throw new Error(`Growth stage baseline is missing ${actualNode.testId} on ${scenarioName}`);
    }

    const leftDelta = Math.abs(actualNode.left - baselineNode.left);
    const topDelta = Math.abs(actualNode.top - baselineNode.top);
    if (leftDelta > 0.01 || topDelta > 0.01) {
      throw new Error(
        `Growth stage position diverged from the compact baseline on ${scenarioName}: ${JSON.stringify({
          testId: actualNode.testId,
          baseline: { left: baselineNode.left, top: baselineNode.top },
          actual: { left: actualNode.left, top: actualNode.top },
          leftDelta,
          topDelta
        })}`
      );
    }
  }
}

async function assertFlowStatusDoesNotCoverStageNodes(page, nodeBoxes, scenarioName) {
  const flowStatus = page.getByTestId("dialogue-flow-status");
  if (!await flowStatus.count()) {
    return;
  }

  const statusBox = await flowStatus.boundingBox();
  if (!statusBox) {
    return;
  }

  for (const node of nodeBoxes) {
    const overlaps =
      statusBox.x < node.right &&
      statusBox.x + statusBox.width > node.left &&
      statusBox.y < node.bottom &&
      statusBox.y + statusBox.height > node.top;
    if (overlaps) {
      throw new Error(`Growth flow status covers a stage node on ${scenarioName}: ${JSON.stringify({ statusBox, node })}`);
    }
  }
}

async function mockDeferredSynthesis(page) {
  let releaseResponse;
  const responseReady = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  let requestId = null;

  await page.route("**/api/synthesis", async (route) => {
    const body = route.request().postDataJSON();
    requestId = body.requestId;
    await responseReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId,
        synthesis: {
          text: "保留主线，但拆开节奏。",
          summary: "主线收束",
          label: "收束",
          stance: "合"
        }
      })
    });
  });

  return {
    release: () => releaseResponse(),
    getRequestId: () => requestId
  };
}

async function ensureActiveElement(page, expected) {
  await page.waitForFunction(
    (target) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return false;
      }
      return (
        active.id === target.id ||
        active.getAttribute("data-testid") === target.testId ||
        (target.text ? active.textContent?.includes(target.text) : false)
      );
    },
    expected
  );

  const active = await page.evaluate(() => ({
    id: document.activeElement?.id || "",
    testId: document.activeElement?.getAttribute("data-testid") || "",
    text: document.activeElement?.textContent || ""
  }));

  if (
    active.id !== expected.id &&
    active.testId !== expected.testId &&
    (expected.text ? !active.text.includes(expected.text) : true)
  ) {
    throw new Error(`Unexpected active element: ${JSON.stringify({ active, expected })}`);
  }
}

async function ensureSynthesisPendingFocusFlow(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, createWorkspaceWithoutSynthesis());
  const synthesis = await mockDeferredSynthesis(page);

  await page.getByTestId("dialogue-composer").getByRole("button", { name: /合流记录/ }).click();
  await page.getByRole("button", { name: "合流中..." }).waitFor();
  if (!synthesis.getRequestId()) {
    throw new Error("Synthesis request did not start during pending flow scenario");
  }
  synthesis.release();
  await page.getByRole("heading", { name: "一次正反合流" }).waitFor();
  await ensureActiveElement(page, { id: "conversation-panel-heading" });
  assertNoPageIssues(pageIssues, "synthesis pending focus flow");
  await context.close();

  return { name: "synthesis-pending-focus", passed: true };
}

async function ensureSynthesisStaleCompletionDoesNotStealFocus(browser) {
  const { context, page, pageIssues } = await createScenarioPage(
    browser,
    createWorkspaceWithoutSynthesis({ includeSecondRoot: true })
  );
  const synthesis = await mockDeferredSynthesis(page);

  await page.getByTestId("dialogue-composer").getByRole("button", { name: /合流记录/ }).click();
  await page.getByRole("button", { name: "合流中..." }).waitFor();
  await page.getByTestId("dialogue-sidebar").getByRole("button", { name: /另一个问题/ }).click();
  await page.getByRole("heading", { name: /另一个问题/ }).waitFor();
  synthesis.release();
  await page.getByTestId("dialogue-flow-status").waitFor();
  await page.getByTestId("dialogue-flow-status").filter({ hasText: "合流已生成：查看合流记录，或基于它继续追问。" }).waitFor();
  await page.getByRole("heading", { name: /另一个问题/ }).waitFor();
  assertNoPageIssues(pageIssues, "synthesis stale completion focus flow");
  await context.close();

  return { name: "synthesis-stale-completion", passed: true };
}

async function ensureRoundtableDrawerReturnsFocus(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, seededWorkspace);
  await page.route("**/api/roundtable", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: body.requestId,
        state: {
          topic: "roundtable topic",
          participants: [],
          rounds: [],
          currentQuestion: "q1",
          nextQuestion: "作为追问继续的问题",
          lastCoreTension: "核心张力",
          status: "active"
        }
      })
    });
  });

  await page.getByRole("button", { name: "召集圆桌讨论此节点" }).click();
  await page.getByTestId("dialogue-roundtable-drawer").waitFor();
  await ensureActiveElement(page, { testId: "dialogue-roundtable-drawer" });
  await page.keyboard.press("Escape");
  await page.getByTestId("dialogue-roundtable-drawer").waitFor({ state: "detached" });
  await ensureActiveElement(page, { text: "召集圆桌讨论此节点" });
  assertNoPageIssues(pageIssues, "roundtable drawer focus return");
  await context.close();

  return { name: "roundtable-drawer-focus-return", passed: true };
}

async function ensureNextStepChoiceDockLayout(browser) {
  const workspace = createWorkspaceWithoutSynthesis();
  const desktop = await createScenarioPage(browser, workspace, {
    viewport: { width: 1440, height: 980 }
  });
  const desktopComposer = desktop.page.getByTestId("dialogue-composer");
  await desktopComposer.waitFor();
  await desktopComposer.getByRole("button", { name: /继续推进正方/ }).waitFor();
  await desktopComposer.getByRole("button", { name: /暂缓判断反方/ }).waitFor();
  await desktopComposer.getByRole("button", { name: /合流记录/ }).waitFor();
  await ensureChoiceButtonsAccessibleAndTouchable(desktop.page, 38);
  const desktopMode = await desktopComposer.getAttribute("data-mode");
  if (desktopMode !== "choice") {
    throw new Error(`Desktop composer did not enter choice mode: ${desktopMode}`);
  }
  await assertRegionWidth(desktopComposer, 1440, "desktop choice composer");
  await ensureStageHintDoesNotOverlapWorkspace(desktop.page, "desktop choice dock");
  const desktopScreenshotPath = path.join(outputDir, "desktop-choice-dock.png");
  await desktop.page.screenshot({ path: desktopScreenshotPath, fullPage: false });
  assertNoPageIssues(desktop.pageIssues, "desktop choice dock layout");
  await desktop.context.close();

  const mobile = await createScenarioPage(browser, workspace, {
    viewport: { width: 320, height: 740 }
  });
  const mobileComposer = mobile.page.getByTestId("dialogue-composer");
  await mobileComposer.waitFor();
  const mobileMode = await mobileComposer.getAttribute("data-mode");
  if (mobileMode !== "choice") {
    throw new Error(`Mobile composer did not enter choice mode: ${mobileMode}`);
  }
  await assertRegionWidth(mobileComposer, 320, "mobile choice composer");
  await assertRegionVisible(mobileComposer, 740, "mobile choice composer initial");
  await ensureMobileChoiceContextVisible(mobile.page, 320, 740);
  await ensureChoiceButtonsAccessibleAndTouchable(mobile.page, 44);
  await ensureMobileRootNodeHasVisibleText(mobile.page);
  await ensureMobileComposerDoesNotCoverLineage(mobile.page);
  await ensureMobileComposerDoesNotCoverPanelActions(mobile.page);
  await ensureFocusedSidebarItemFullyVisible(mobile.page, "mobile choice dock");
  await ensureVisibleSidebarItemsNotClipped(mobile.page, "mobile choice dock");
  await mobileComposer.scrollIntoViewIfNeeded();
  await mobile.page.waitForTimeout(60);
  await assertRegionVisible(mobileComposer, 740, "mobile choice composer");
  const mobileScreenshotPath = path.join(outputDir, "mobile-320-choice-dock.png");
  await mobile.page.screenshot({ path: mobileScreenshotPath, fullPage: false });
  assertNoPageIssues(mobile.pageIssues, "mobile choice dock layout");
  await mobile.context.close();

  return {
    name: "next-step-choice-dock-layout",
    passed: true,
    screenshots: {
      desktop: desktopScreenshotPath,
      mobile: mobileScreenshotPath
    }
  };
}

async function ensureRetrievalDebugPreview(browser) {
  const hidden = await createScenarioPage(browser, createWorkspaceWithRetrievalMatch(), {
    viewport: { width: 1280, height: 900 }
  });
  const hiddenPreviewCount = await hidden.page.getByTestId("dialogue-retrieval-debug").count();
  if (hiddenPreviewCount !== 0) {
    throw new Error("Retrieval debug preview rendered without ?retrievalDebug=1");
  }
  assertNoPageIssues(hidden.pageIssues, "retrieval debug hidden by default");
  await hidden.context.close();

  const desktop = await createScenarioPage(
    browser,
    createWorkspaceWithRetrievalMatch(),
    {
      viewport: { width: 1280, height: 900 }
    },
    "/dialogue?retrievalDebug=1"
  );
  await desktop.page.getByLabel("输入").fill("下一步怎么拆");
  const desktopPreview = desktop.page.getByTestId("dialogue-retrieval-debug");
  await desktopPreview.filter({ hasText: "retrieval_context preview" }).waitFor();
  await desktopPreview.filter({ hasText: "拆分参考" }).waitFor();
  await desktopPreview.filter({ hasText: "coverage exclusion active" }).waitFor();
  await assertRegionWidth(desktopPreview, 1280, "desktop retrieval debug preview");
  const desktopScreenshotPath = path.join(outputDir, "desktop-retrieval-debug.png");
  await desktop.page.screenshot({ path: desktopScreenshotPath, fullPage: false });
  assertNoPageIssues(desktop.pageIssues, "retrieval debug content preview");
  await desktop.context.close();

  const empty = await createScenarioPage(
    browser,
    createEmptyWorkspace(),
    {
      viewport: { width: 1280, height: 900 }
    },
    "/dialogue?retrievalDebug=1"
  );
  const emptyPreview = empty.page.getByTestId("dialogue-retrieval-debug");
  await emptyPreview.filter({ hasText: "无可注入片段" }).waitFor();
  await emptyPreview.filter({ hasText: "(empty)" }).waitFor();
  await emptyPreview.filter({ hasText: "empty query" }).waitFor();
  assertNoPageIssues(empty.pageIssues, "retrieval debug empty preview");
  await empty.context.close();

  const mobile = await createScenarioPage(
    browser,
    createWorkspaceWithRetrievalMatch(),
    {
      viewport: { width: 360, height: 740 },
      hasTouch: true,
      isMobile: true
    },
    "/dialogue?retrievalDebug=1"
  );
  await mobile.page.getByLabel("输入").fill("下一步怎么拆");
  const mobilePreview = mobile.page.getByTestId("dialogue-retrieval-debug");
  await mobilePreview.filter({ hasText: "拆分参考" }).waitFor();
  await mobilePreview.scrollIntoViewIfNeeded();
  await mobile.page.waitForTimeout(60);
  await ensureNoHorizontalOverflow(mobile.page, "mobile retrieval debug preview");
  await assertRegionWidth(mobilePreview, 360, "mobile retrieval debug preview");
  const mobileScreenshotPath = path.join(outputDir, "mobile-360-retrieval-debug.png");
  await mobile.page.screenshot({ path: mobileScreenshotPath, fullPage: false });
  assertNoPageIssues(mobile.pageIssues, "mobile retrieval debug preview");
  await mobile.context.close();

  return {
    name: "retrieval-debug-preview",
    passed: true,
    screenshots: {
      desktop: desktopScreenshotPath,
      mobile: mobileScreenshotPath
    }
  };
}

async function ensureGrowthPerspectiveFlow(browser) {
  const scenarios = [
    { name: "desktop", viewport: { width: 1440, height: 980 }, fullPage: false },
    { name: "mobile-390", viewport: { width: 390, height: 844 }, fullPage: true },
    { name: "mobile-320", viewport: { width: 320, height: 740 }, fullPage: true }
  ];
  const screenshots = {};
  const composerScreenshots = {};
  const stageNodeChecks = {};

  for (const scenario of scenarios) {
    const { context, page, pageIssues } = await createScenarioPage(browser, createEmptyWorkspace(), {
      viewport: scenario.viewport,
      hasTouch: scenario.name.startsWith("mobile"),
      isMobile: scenario.name.startsWith("mobile")
    });
    const composer = page.getByTestId("dialogue-composer");
    await assertMetaballStage(page, `growth perspectives ${scenario.name}`);

    await page.getByRole("button", { name: /点此输入/ }).click();
    await composer.getByLabel("输入").fill("也许要换个角度继续推进？");
    const growthButton = composer.getByRole("button", { name: "画作视角" });
    await growthButton.waitFor();
    const growthButtonBox = await growthButton.boundingBox();
    if (!growthButtonBox || growthButtonBox.width < 44 || growthButtonBox.height < 44) {
      throw new Error(`Artwork perspective target is below 44px on ${scenario.name}: ${JSON.stringify(growthButtonBox)}`);
    }

    await growthButton.click();
    await page.getByRole("status").filter({ hasText: "画作视角已生成：只回应当前事件，不写长期记忆。" }).waitFor();
    await page.getByTestId("dialogue-sidebar").getByRole("button", { name: /画作合并/ }).waitFor();
    const stage = page.getByTestId("dialogue-stage");
    const growthNodeTestIds = await stage.locator('[data-testid^="dialogue-stage-node-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid")).filter((testId) => Boolean(testId))
    );
    if (growthNodeTestIds.length < 5) {
      throw new Error(`Growth stage did not render every local perspective on ${scenario.name}: ${JSON.stringify(growthNodeTestIds)}`);
    }
    const nodeBoxes = await collectVisibleStageNodeBoxes(stage, scenario.name, growthNodeTestIds.length);
    await assertFlowStatusDoesNotCoverStageNodes(page, nodeBoxes, scenario.name);
    stageNodeChecks[scenario.name] = {
      nodeCount: nodeBoxes.length,
      nodes: nodeBoxes
    };

    const rootTestId = growthNodeTestIds[0];
    for (const testId of growthNodeTestIds) {
      const node = page.getByTestId(testId);
      await node.evaluate((element) => {
        (element instanceof HTMLElement ? element : null)?.focus();
      });
      await page.waitForFunction((expectedTestId) =>
        document.activeElement?.getAttribute("data-testid") === expectedTestId,
      testId);
      await ensureActiveElement(page, { testId });
      await node.click();
      if (testId !== rootTestId) {
        await page.waitForFunction(([expectedRootTestId, expectedSelectedTestId]) => {
          const stageNodeTestIds = [...document.querySelectorAll('[data-testid^="dialogue-stage-node-"]')]
            .map((node) => node.getAttribute("data-testid"));
          return stageNodeTestIds.length === 2 &&
            stageNodeTestIds.includes(expectedRootTestId) &&
            stageNodeTestIds.includes(expectedSelectedTestId);
        }, [rootTestId, testId]);
        await page.getByTestId(rootTestId).click();
        await page.waitForFunction((expectedTestIds) =>
          expectedTestIds.every((expectedTestId) => document.querySelector(`[data-testid="${expectedTestId}"]`)),
        growthNodeTestIds);
      }
    }
    await ensureNoHorizontalOverflow(page, `growth ${scenario.name}`);
    await assertRegionWidth(composer, scenario.viewport.width, `growth composer ${scenario.name}`);

    const screenshotPath = path.join(outputDir, `${scenario.name}-growth-perspectives.png`);
    if (scenario.name.startsWith("mobile")) {
      await stage.scrollIntoViewIfNeeded();
      await page.waitForTimeout(60);
      await stage.screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: scenario.fullPage });
    }
    screenshots[scenario.name] = screenshotPath;

    if (scenario.name.startsWith("mobile")) {
      await composer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(60);
      await ensureMobileComposerSingleColumn(page, `growth ${scenario.name}`);
      await ensureMobileComposerDoesNotCoverLineage(page);
      await ensureMobileComposerDoesNotCoverPanelActions(page);
      const composerScreenshotPath = path.join(outputDir, `${scenario.name}-growth-composer.png`);
      await composer.screenshot({ path: composerScreenshotPath });
      composerScreenshots[scenario.name] = composerScreenshotPath;
    }
    assertNoPageIssues(pageIssues, `growth perspectives ${scenario.name}`);
    await context.close();
  }

  return {
    name: "growth-perspective-flow",
    passed: true,
    screenshots,
    composerScreenshots,
    stageNodeChecks
  };
}

async function ensureGrowthLayoutMatrix(browser) {
  const scenarios = [
    { name: "desktop", viewport: { width: 1440, height: 980 } },
    { name: "tablet", viewport: { width: 1024, height: 900 } },
    { name: "mobile-390", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    { name: "mobile-360", viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true },
    { name: "mobile-320", viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true }
  ];
  const stageNodeChecks = {};

  for (const candidateLimit of [1, 2, 3, 4]) {
    const expectedChildCount = candidateLimit + (candidateLimit >= 2 ? 1 : 0);

    for (const scenario of scenarios) {
      const scenarioName = `growth matrix candidateLimit=${candidateLimit} ${scenario.name}`;
      const { context, page, pageIssues } = await createScenarioPage(browser, createGrowthWorkspace(candidateLimit), {
        viewport: scenario.viewport,
        hasTouch: scenario.hasTouch,
        isMobile: scenario.isMobile
      });
      const stage = page.getByTestId("dialogue-stage");
      await assertMetaballStage(page, scenarioName);
      const nodeBoxes = await collectVisibleStageNodeBoxes(stage, scenarioName, expectedChildCount + 1);
      await assertStageNodesInteractive(stage, scenarioName);

      stageNodeChecks[`candidate-${candidateLimit}-${scenario.name}`] = {
        candidateLimit,
        nodeCount: nodeBoxes.length,
        nodes: nodeBoxes
      };

      assertNoPageIssues(pageIssues, scenarioName);
      await context.close();
    }
  }

  return {
    name: "growth-layout-matrix",
    passed: true,
    stageNodeChecks
  };
}

async function ensureGrowthWideLayoutCompatibility(browser) {
  const expectedNodeCount = 6;
  const baseline = await createScenarioPage(browser, createGrowthWorkspace(4), {
    viewport: { width: 320, height: 740 },
    hasTouch: true,
    isMobile: true
  });
  const baselineNodeBoxes = await collectVisibleStageNodeBoxes(
    baseline.page.getByTestId("dialogue-stage"),
    "Growth compact baseline on mobile-320",
    expectedNodeCount
  );
  assertNoPageIssues(baseline.pageIssues, "Growth compact baseline on mobile-320");
  await baseline.context.close();

  const imported = await createScenarioPage(browser, createGrowthWorkspace(4, { withWideStageLayout: true }), {
    viewport: { width: 320, height: 740 },
    hasTouch: true,
    isMobile: true
  });
  const importedStage = imported.page.getByTestId("dialogue-stage");
  const importedNodeBoxes = await collectVisibleStageNodeBoxes(
    importedStage,
    "Growth imported wide layout on mobile-320",
    expectedNodeCount
  );
  assertStageNodePositionsMatchBaseline(importedNodeBoxes, baselineNodeBoxes, "Growth imported wide layout on mobile-320");
  assertNoPageIssues(imported.pageIssues, "Growth imported wide layout on mobile-320");
  await imported.context.close();

  const dragged = await createScenarioPage(browser, createGrowthWorkspace(4), {
    viewport: { width: 1440, height: 980 }
  });
  const draggedStage = dragged.page.getByTestId("dialogue-stage");
  const dragTarget = draggedStage.locator('[data-testid^="dialogue-stage-node-"]').nth(1);
  const dragTargetBox = await dragTarget.boundingBox();
  if (!dragTargetBox) {
    throw new Error("Growth desktop drag target is not measurable");
  }
  await dragged.page.mouse.move(dragTargetBox.x + dragTargetBox.width / 2, dragTargetBox.y + dragTargetBox.height / 2);
  await dragged.page.mouse.down();
  await dragged.page.mouse.move(dragTargetBox.x + dragTargetBox.width / 2 + 36, dragTargetBox.y + dragTargetBox.height / 2 - 18);
  await dragged.page.mouse.up();
  await dragged.page.setViewportSize({ width: 320, height: 740 });
  await dragged.page.waitForFunction(() => window.matchMedia("(max-width: 980px)").matches);
  await dragged.page.waitForFunction(
    (expectedNodes) => expectedNodes.every((expectedNode) => {
      const element = document.querySelector(`[data-testid="${expectedNode.testId}"]`);
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.left - expectedNode.left) <= 0.01 && Math.abs(rect.top - expectedNode.top) <= 0.01;
    }),
    baselineNodeBoxes,
    { timeout: 3000 }
  );
  const draggedNodeBoxes = await collectVisibleStageNodeBoxes(
    draggedStage,
    "Growth desktop drag then mobile-320",
    expectedNodeCount
  );
  assertStageNodePositionsMatchBaseline(draggedNodeBoxes, baselineNodeBoxes, "Growth desktop drag then mobile-320");
  assertNoPageIssues(dragged.pageIssues, "Growth desktop drag then mobile-320");
  await dragged.context.close();

  return {
    name: "growth-wide-layout-compatibility",
    passed: true,
    stageNodeChecks: {
      "imported-wide-mobile-320": { nodeCount: importedNodeBoxes.length, nodes: importedNodeBoxes },
      "desktop-drag-mobile-320": { nodeCount: draggedNodeBoxes.length, nodes: draggedNodeBoxes }
    }
  };
}

async function runInteractionScenarios(browser) {
  return [
    await ensureMetaballFusionAndSeparation(browser),
    await ensureMetaballReducedMotion(browser),
    await ensureMetaballWebglFallback(browser),
    await ensureSynthesisPendingFocusFlow(browser),
    await ensureSynthesisStaleCompletionDoesNotStealFocus(browser),
    await ensureRoundtableDrawerReturnsFocus(browser),
    await ensureEmptyRootPendingState(browser),
    await ensureNextStepChoiceDockLayout(browser),
    await ensureRetrievalDebugPreview(browser),
    await ensureGrowthPerspectiveFlow(browser),
    await ensureGrowthLayoutMatrix(browser),
    await ensureGrowthWideLayoutCompatibility(browser)
  ];
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height
    },
    deviceScaleFactor: 1,
    hasTouch: Boolean(viewport.hasTouch),
    isMobile: Boolean(viewport.isMobile)
  });

  await context.addInitScript((snapshot) => {
    window.localStorage.setItem("anicca_workspace_v2", JSON.stringify(snapshot));
  }, seededWorkspace);

  if (viewport.hasTouch) {
    await context.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query.includes("pointer: coarse")) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() {
              return true;
            }
          };
        }

        return originalMatchMedia(query);
      };
    });
  }

  const page = await context.newPage();
  const pageIssues = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      /hydration|did not match|server rendered|text content does not match/i.test(text)
    ) {
      pageIssues.push({
        type: `console:${message.type()}`,
        text
      });
    }
  });
  page.on("pageerror", (error) => {
    pageIssues.push({
      type: "pageerror",
      text: error.message
    });
  });

  await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });

  const stage = page.getByTestId("dialogue-stage");
  const panel = page.getByTestId("dialogue-panel");
  const composer = page.getByTestId("dialogue-composer");
  const sidebar = page.getByTestId("dialogue-sidebar");
  const workspaceBar = page.getByTestId("dialogue-workspace-bar");

  await stage.waitFor();
  await panel.waitFor();
  await composer.waitFor();
  await sidebar.waitFor();
  await workspaceBar.waitFor();
  await assertMetaballStage(page, viewport.name);
  await assertStageNodesInteractive(stage, viewport.name);

  await ensureNoHorizontalOverflow(page, viewport.name);
  await assertRegionWidth(stage, viewport.width, `${viewport.name} stage`);
  await assertRegionWidth(panel, viewport.width, `${viewport.name} panel`);
  await assertRegionWidth(composer, viewport.width, `${viewport.name} composer`);
  await assertRegionWidth(workspaceBar, viewport.width, `${viewport.name} workspace bar`);
  await ensureStageHintDoesNotOverlapWorkspace(page, viewport.name);

  const captures = {};

  if (viewport.name.startsWith("mobile")) {
    const initialScrollMetrics = await resetPageScroll(page);
    const initialScreenshotPath = path.join(outputDir, `${viewport.name}-initial.png`);
    await page.screenshot({ path: initialScreenshotPath, fullPage: false });
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: false });
    captures.initial = {
      screenshotPath: initialScreenshotPath,
      scrollMetrics: initialScrollMetrics
    };

    await assertRegionMinWidth(
      workspaceBar,
      viewport.width - 28,
      `${viewport.name} workspace bar`
    );

    const mobileMetrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="dialogue-shell"]');
      if (!(shell instanceof HTMLElement)) {
        return null;
      }

      return {
        overflowY: getComputedStyle(shell).overflowY,
        scrollHeight: shell.scrollHeight,
        clientHeight: shell.clientHeight
      };
    });

    if (!mobileMetrics) {
      throw new Error("Missing shell metrics for mobile viewport");
    }

    if (mobileMetrics.overflowY === "hidden") {
      throw new Error(`Mobile shell is not scrollable: ${JSON.stringify(mobileMetrics)}`);
    }

    await ensureMobileComposerDoesNotCoverLineage(page);
    await ensureMobileComposerDoesNotCoverPanelActions(page);
    await ensureMobileRootNodeHasVisibleText(page);
    await ensureMobileComposerSingleColumn(page, viewport.name);
    await ensureFocusedSidebarItemFullyVisible(page, viewport.name);
    await ensureVisibleSidebarItemsNotClipped(page, viewport.name);
    await ensureMobileCanScrollFromStage(page, viewport.name);
  }

  if (viewport.hasTouch) {
    await ensureTouchViewportSemantics(page);
  }

  if (viewport.hasTouch) {
    await ensureTouchNodeTapSelects(page);
  }

  await composer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);

  if (pageIssues.length) {
    throw new Error(`Console or page errors detected on ${viewport.name}: ${JSON.stringify(pageIssues, null, 2)}`);
  }

  const screenshotPath = viewport.name.startsWith("mobile")
    ? path.join(outputDir, `${viewport.name}-initial.png`)
    : path.join(outputDir, `${viewport.name}.png`);
  if (viewport.name.startsWith("mobile")) {
    const composerScreenshotPath = path.join(outputDir, `${viewport.name}-composer.png`);
    const composerScrollMetrics = await getPageScrollMetrics(page);
    await page.screenshot({ path: composerScreenshotPath, fullPage: false });
    captures.composer = {
      screenshotPath: composerScreenshotPath,
      scrollMetrics: composerScrollMetrics
    };
  } else {
    await page.screenshot({ path: screenshotPath, fullPage: viewport.fullPage });
  }
  await context.close();

  return {
    name: viewport.name,
    viewport: {
      width: viewport.width,
      height: viewport.height
    },
    screenshotPath,
    ...(Object.keys(captures).length ? { captures } : {})
  };
}

async function main() {
  const serverMode = await resolveServerMode();
  await resolveBaseUrl();

  let tempOutputDir = null;
  let outputPublished = false;
  let browser = null;
  let server = null;

  const shutdown = () => {
    const child = server?.child;
    if (child && !child.killed && !server.getExitInfo()) {
      child.kill("SIGTERM");
    }
  };

  try {
    tempOutputDir = await prepareOutputDir();
    server = startNextServer(serverMode);

    process.on("exit", shutdown);
    process.on("SIGINT", () => {
      shutdown();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      shutdown();
      process.exit(143);
    });

    await waitForNextReady(server);
    await waitForServer(`${baseUrl}/dialogue`, server);
    browser = await chromium.launch({ headless: true });
    const results = [];

    for (const viewport of viewports) {
      results.push(await runViewport(browser, viewport));
    }

    const interactionScenarios = await runInteractionScenarios(browser);

    await browser.close();
    browser = null;
    const summary = rebaseArtifactPaths(
      {
        baseUrl,
        serverMode,
        generatedAt: new Date().toISOString(),
        viewports: results,
        interactionScenarios
      },
      tempOutputDir
    );
    await writeFile(
      path.join(outputDir, "summary.json"),
      JSON.stringify(summary, null, 2)
    );
    await publishOutputDir(tempOutputDir);
    outputPublished = true;
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    shutdown();
    if (!outputPublished && tempOutputDir) {
      await discardOutputDir(tempOutputDir);
    }
    const output = server?.getOutput() || "";
    if (output) {
      console.error(output);
    }
    throw error;
  }

  shutdown();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
