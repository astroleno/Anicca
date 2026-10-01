import { mkdir, access, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { runSeedViewport } from "./seeds.mjs";
import { runCanvasLifecycle, runSeedRecoveryAndTouch } from "./soft-interactions.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const buildIdPath = path.join(repoRoot, process.env.ANICCA_NEXT_DIST_DIR || ".next", "BUILD_ID");
const nextCliPath = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const artifactRoot = path.resolve(
  process.env.DIALOGUE_SMOKE_ARTIFACT_ROOT || path.join(repoRoot, "artifacts", "visual-smoke")
);
const finalOutputDir = path.join(artifactRoot, "dialogue");
const failureOutputDir = path.join(artifactRoot, "dialogue-failure");
let outputDir = finalOutputDir;
let baseUrl = process.env.DIALOGUE_SMOKE_BASE_URL || "http://127.0.0.1:3211";
const baseUrlWasProvided = Boolean(process.env.DIALOGUE_SMOKE_BASE_URL);
const requestedServerMode = process.env.DIALOGUE_SMOKE_SERVER_MODE || "dev";
const browserExecutablePath = process.env.DIALOGUE_SMOKE_BROWSER_EXECUTABLE_PATH;
const serverReadyTimeoutMs = readTimeoutEnv("DIALOGUE_SMOKE_READY_TIMEOUT_MS", 120000);
const pageReadyTimeoutMs = readTimeoutEnv("DIALOGUE_SMOKE_PAGE_TIMEOUT_MS", 300000);
const totalTimeoutMs = readTimeoutEnv("DIALOGUE_SMOKE_TOTAL_TIMEOUT_MS", 30 * 60 * 1000);
const portSearchLimit = Number.parseInt(process.env.DIALOGUE_SMOKE_PORT_SEARCH_LIMIT || "40", 10);
const viewportNameFilter = new Set(
  (process.env.DIALOGUE_SMOKE_VIEWPORT_FILTER || "").split(",").map((name) => name.trim()).filter(Boolean)
);
const scenarioNameFilter = new Set(
  (process.env.DIALOGUE_SMOKE_SCENARIO_FILTER || "").split(",").map((name) => name.trim()).filter(Boolean)
);

function resolveHeadSha() {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }

  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

const runProgress = {
  headSha: resolveHeadSha(),
  runId: process.env.GITHUB_RUN_ID || "local",
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || "local",
  startedAt: new Date().toISOString(),
  currentStep: "startup",
  lastSuccessfulStep: null,
  lastViewport: null,
  lastScenario: null,
  failureWait: null,
  history: [],
  activePage: null
};

function recordProgress(event, step, details = {}) {
  const entry = {
    event,
    step,
    at: new Date().toISOString(),
    ...details
  };
  runProgress.history.push(entry);
  console.log(JSON.stringify({ visualSmoke: entry }));
}

function markStepSuccessful(step) {
  runProgress.currentStep = step;
  runProgress.lastSuccessfulStep = step;
  recordProgress("complete", step);
}

async function runStep(step, operation, { allowFailure = false } = {}) {
  const parentStep = runProgress.currentStep;
  if (step.startsWith("viewport:")) {
    runProgress.lastViewport = step.slice("viewport:".length);
  } else if (step.startsWith("interaction:")) {
    runProgress.lastScenario = step.slice("interaction:".length);
  }
  runProgress.currentStep = step;
  recordProgress("start", step);

  try {
    const result = await operation();
    runProgress.lastSuccessfulStep = step;
    recordProgress("complete", step);
    runProgress.currentStep = parentStep;
    return result;
  } catch (error) {
    const failedStep = runProgress.currentStep === step ? step : runProgress.currentStep;
    recordProgress(allowFailure ? "allowed-failure" : "failure", step, {
      failedStep,
      error: error instanceof Error ? error.message : String(error)
    });
    if (allowFailure) {
      runProgress.currentStep = parentStep;
      return undefined;
    }
    if (failedStep.startsWith("wait:")) {
      runProgress.failureWait = failedStep.slice("wait:".length);
    }
    if (runProgress.currentStep === step) {
      runProgress.currentStep = step;
    }
    throw error;
  }
}

function setActivePage(page) {
  runProgress.activePage = page;
}

async function waitForCondition(page, label, pageFunction, arg, options, runOptions) {
  return runStep(
    `wait:${label}`,
    () => page.waitForFunction(pageFunction, arg, options),
    runOptions
  );
}

async function withTotalTimeout(operation) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Visual smoke exceeded DIALOGUE_SMOKE_TOTAL_TIMEOUT_MS=${totalTimeoutMs} at ${runProgress.currentStep}`
        )
      );
    }, totalTimeoutMs);
    timeoutId.unref?.();
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const viewports = [
  { name: "desktop", width: 1440, height: 980, fullPage: false },
  { name: "tablet", width: 1024, height: 900, fullPage: false },
  { name: "tablet-touch", width: 1024, height: 768, fullPage: false, hasTouch: true, isMobile: true },
  { name: "mobile-430", width: 430, height: 932, fullPage: false, hasTouch: true, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, fullPage: true },
  {
    name: "mobile-keyboard-390",
    width: 390,
    height: 844,
    visualViewportHeight: 520,
    fullPage: false,
    hasTouch: true,
    isMobile: true
  },
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

async function publishFailureOutputDir(tempOutputDir) {
  await rm(failureOutputDir, { recursive: true, force: true });
  await rename(tempOutputDir, failureOutputDir);
  outputDir = failureOutputDir;
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || `${error.name}: ${error.message}`
    };
  }

  const message = String(error);
  return { name: "NonError", message, stack: message };
}

async function captureFailurePage(page, tempOutputDir) {
  const screenshotName = "failure-screenshot.png";
  const domName = "failure-dom.html";
  const stateName = "failure-page-state.json";
  let screenshot = null;
  let screenshotError = null;
  let domHtml = "<!-- No active browser page was available when the visual smoke failed. -->\n";
  let pageState = {
    available: false,
    reason: "No active browser page was available."
  };

  if (page && typeof page.isClosed === "function" && !page.isClosed()) {
    try {
      await page.screenshot({
        path: path.join(tempOutputDir, screenshotName),
        fullPage: false
      });
      screenshot = screenshotName;
    } catch (error) {
      screenshotError = serializeError(error);
    }

    try {
      const snapshot = await page.evaluate(() => {
        const track = document.querySelector('[data-testid="dialogue-stage-track"]');
        const canvas = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
        const composer = document.querySelector('[data-testid="dialogue-composer"]');
        const readingDrawer = document.querySelector("#dialogue-reading-drawer");
        const lineageDrawer = document.querySelector("#dialogue-lineage-drawer");
        const active = document.activeElement;
        const canvasRect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
        const measureElement = (element) => {
          if (!(element instanceof HTMLElement)) {
            return null;
          }
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            dataOpen: element.dataset.open || null,
            computedHeight: style.height,
            computedBottom: style.bottom,
            opacity: style.opacity,
            transform: style.transform
          };
        };

        return {
          domHtml: document.documentElement.outerHTML,
          state: {
            available: true,
            url: window.location.href,
            title: document.title,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            activeElement: active instanceof HTMLElement
              ? {
                  tagName: active.tagName,
                  id: active.id,
                  testId: active.dataset.testid || null,
                  text: active.textContent?.slice(0, 240) || ""
                }
              : null,
            renderer: {
              state: track instanceof HTMLElement ? track.dataset.metaballRenderer || null : null,
              fusedPairs: canvas instanceof HTMLElement ? canvas.dataset.fusedPairs || null : null,
              canvas: canvas instanceof HTMLCanvasElement && canvasRect
                ? {
                    width: canvasRect.width,
                    height: canvasRect.height,
                    backingWidth: canvas.width,
                    backingHeight: canvas.height,
                    display: getComputedStyle(canvas).display
                  }
                : null
            },
            layout: {
              composer: measureElement(composer),
              readingDrawer: measureElement(readingDrawer),
              lineageDrawer: measureElement(lineageDrawer)
            },
            stageNodes: [...document.querySelectorAll('[data-testid^="dialogue-stage-node-"]')]
              .map((node) => ({
                testId: node.getAttribute("data-testid"),
                pressed: node.getAttribute("aria-pressed"),
                disabled: node instanceof HTMLButtonElement ? node.disabled : null
              }))
          }
        };
      });
      domHtml = snapshot.domHtml;
      pageState = snapshot.state;
    } catch (error) {
      pageState = {
        available: false,
        reason: "Failed to collect browser page state.",
        error: serializeError(error)
      };
    }
  }

  await writeFile(path.join(tempOutputDir, domName), domHtml);
  await writeFile(path.join(tempOutputDir, stateName), JSON.stringify(pageState, null, 2));

  return {
    screenshot,
    screenshotError,
    dom: domName,
    pageState: stateName
  };
}

async function writeFailureEvidence(error, tempOutputDir, serverOutput) {
  const browserEvidence = await captureFailurePage(runProgress.activePage, tempOutputDir);
  const serverOutputName = serverOutput ? "failure-server-output.log" : null;
  if (serverOutputName) {
    await writeFile(path.join(tempOutputDir, serverOutputName), serverOutput);
  }

  const manifest = {
    status: "failure",
    generatedAt: new Date().toISOString(),
    startedAt: runProgress.startedAt,
    headSha: runProgress.headSha,
    runId: runProgress.runId,
    runAttempt: runProgress.runAttempt,
    currentStep: runProgress.currentStep,
    lastSuccessfulStep: runProgress.lastSuccessfulStep,
    lastViewport: runProgress.lastViewport,
    lastScenario: runProgress.lastScenario,
    failureWait: runProgress.failureWait,
    error: serializeError(error),
    browserEvidence,
    serverOutput: serverOutputName,
    history: runProgress.history
  };

  await writeFile(
    path.join(tempOutputDir, "failure-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}

function formatFatalError(error) {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
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
    process.execPath,
    [nextCliPath, scriptName, "--hostname", host, "--port", String(port)],
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

function waitForNextServerExit(server, timeoutMs) {
  if (!server?.child || server.getExitInfo()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const child = server.child;
    const onExit = () => {
      clearTimeout(timeoutId);
      resolve(true);
    };
    const timeoutId = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    timeoutId.unref?.();
    child.once("exit", onExit);
    if (server.getExitInfo()) {
      child.removeListener("exit", onExit);
      clearTimeout(timeoutId);
      resolve(true);
    }
  });
}

async function stopNextServer(server) {
  const child = server?.child;
  if (!child || server.getExitInfo()) {
    return;
  }

  child.kill("SIGTERM");
  if (await waitForNextServerExit(server, 5000)) {
    return;
  }

  child.kill("SIGKILL");
  if (!(await waitForNextServerExit(server, 5000))) {
    throw new Error("Next server did not exit after SIGTERM and SIGKILL");
  }
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
  setActivePage(page);
  const pageIssues = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      /hydration|did not match|server rendered|text content does not match/i.test(text)
    ) {
      pageIssues.push({
        type: `console:${message.type()}`,
        text,
        location: message.location()
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
  await page.getByRole("textbox", { name: "输入", exact: true }).waitFor();

  return { context, page, pageIssues };
}

async function assertMetaballStage(page, scenarioName, expectedState = "ready") {
  const track = page.getByTestId("dialogue-stage-track");
  const canvas = page.getByTestId("dialogue-metaball-canvas");
  await canvas.waitFor({ state: "attached" });
  await waitForCondition(
    page,
    `renderer:${scenarioName}:${expectedState}`,
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
      viewport: { width: window.innerWidth, height: window.innerHeight },
      track: { width: trackRect.width, height: trackRect.height },
      canvas: {
        width: canvasRect.width,
        height: canvasRect.height,
        backingWidth: canvasElement.width,
        backingHeight: canvasElement.height,
        display: canvasStyle.display,
        visibility: canvasStyle.visibility
      }
    };
  });

  if (!metrics) {
    throw new Error(`Missing metaball stage metrics during ${scenarioName}`);
  }

  if (expectedState === "ready") {
    const widthDelta = Math.abs(metrics.viewport.width - metrics.canvas.width);
    const heightDelta = Math.abs(metrics.viewport.height - metrics.canvas.height);
    if (widthDelta > 1 || heightDelta > 1) {
      throw new Error(`Metaball canvas does not cover the viewport during ${scenarioName}: ${JSON.stringify(metrics)}`);
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
  } else if (metrics.canvas.display !== "none" && metrics.canvas.visibility !== "hidden") {
    throw new Error(`Fallback canvas remains visible during ${scenarioName}: ${JSON.stringify(metrics)}`);
  }

  return metrics;
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

  await waitForCondition(
    page,
    "metaball-fusion:initially-separated",
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
    await waitForCondition(
      page,
      "metaball-fusion:enter-fused-state",
      ({ expectedPair }) =>
        (document.querySelector('[data-testid="dialogue-metaball-canvas"]')?.getAttribute("data-fused-pairs") || "")
          .split(",")
          .includes(expectedPair),
      { expectedPair: pair }
    );

    const fusedScreenshotPath = path.join(outputDir, "desktop-metaball-fused.png");
    await page.screenshot({ path: fusedScreenshotPath, fullPage: false });

    await page.mouse.move(originalCenter.x, originalCenter.y, { steps: 16 });
    await waitForCondition(
      page,
      "metaball-fusion:return-to-separated-state",
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

async function ensureActiveElement(page, expected) {
  await waitForCondition(
    page,
    `active-element:${expected.id || expected.testId || expected.text || "unknown"}`,
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

async function main() {
  let tempOutputDir = null;
  let outputPublished = false;
  let browser = null;
  let server = null;
  let serverMode = null;

  const shutdown = () => {
    const child = server?.child;
    if (child && !child.killed && !server.getExitInfo()) {
      child.kill("SIGTERM");
    }
  };

  try {
    await withTotalTimeout(async () => {
      tempOutputDir = await prepareOutputDir();
      markStepSuccessful("setup:prepare-output-dir");
      serverMode = await runStep("setup:resolve-server-mode", () => resolveServerMode());
      await runStep("setup:resolve-base-url", () => resolveBaseUrl());
      server = await runStep("setup:start-server", () => startNextServer(serverMode));

      process.on("exit", shutdown);
      process.on("SIGINT", () => {
        shutdown();
        process.exit(130);
      });
      process.on("SIGTERM", () => {
        shutdown();
        process.exit(143);
      });

      await runStep("setup:wait-next-ready", () => waitForNextReady(server));
      await runStep("setup:wait-dialogue-ready", () => waitForServer(`${baseUrl}/dialogue`, server));
      browser = await runStep("setup:launch-chromium", () => chromium.launch({
        headless: true,
        ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {})
      }));
      const results = [];

      for (const viewport of viewports) {
        if (viewportNameFilter.size && !viewportNameFilter.has(viewport.name)) {
          continue;
        }
        results.push(await runStep(`viewport:${viewport.name}`, () => runSeedViewport(browser, viewport, { baseUrl, outputDir, setActivePage })));
        setActivePage(null);
      }

      // These rendering checks are independent of the former branch-only interface.
      const interactionScenarios = [];
      for (const [name, scenario] of [["metaball-fusion-separation", ensureMetaballFusionAndSeparation], ["metaball-reduced-motion", ensureMetaballReducedMotion], ["metaball-webgl-fallback", ensureMetaballWebglFallback]]) {
        if (!scenarioNameFilter.size || scenarioNameFilter.has(name)) interactionScenarios.push(await runStep(`interaction:${name}`, () => scenario(browser)));
      }
      for (const [name, scenario] of [["seed-recovery-and-touch", runSeedRecoveryAndTouch], ["canvas-lifecycle", runCanvasLifecycle]]) {
        if (!scenarioNameFilter.size || scenarioNameFilter.has(name)) interactionScenarios.push(await runStep(`interaction:${name}`, () => scenario(browser, { baseUrl, outputDir, setActivePage })));
      }

      await runStep("teardown:close-browser", () => browser.close());
      browser = null;
      setActivePage(null);
      await runStep("teardown:stop-server", () => stopNextServer(server));
      const summary = rebaseArtifactPaths(
        {
          baseUrl,
          serverMode,
          generatedAt: new Date().toISOString(),
          headSha: runProgress.headSha,
          runId: runProgress.runId,
          runAttempt: runProgress.runAttempt,
          viewports: results,
          interactionScenarios
        },
        tempOutputDir
      );
      await runStep(
        "publish:write-summary",
        () => writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2))
      );
      await runStep("publish:success-artifact", () => publishOutputDir(tempOutputDir));
      outputPublished = true;
    });
  } catch (error) {
    const serverOutput = server?.getOutput() || "";
    if (!outputPublished && tempOutputDir) {
      try {
        await writeFailureEvidence(error, tempOutputDir, serverOutput);
        await publishFailureOutputDir(tempOutputDir);
        tempOutputDir = null;
      } catch (evidenceError) {
        console.error(`Failed to publish visual failure evidence:\n${formatFatalError(evidenceError)}`);
      }
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    await stopNextServer(server).catch((serverError) => {
      console.error(`Failed to stop visual smoke server:\n${formatFatalError(serverError)}`);
      shutdown();
    });
    if (serverOutput) {
      console.error(serverOutput);
    }
    throw error;
  }

  shutdown();
}

main().catch((error) => {
  console.error(formatFatalError(error));
  process.exit(1);
});
