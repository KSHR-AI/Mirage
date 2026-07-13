#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { renderedPixelStats } from "./lib/png-stats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "http://127.0.0.1:3100";
const PLAYTEST_INSPECTION_EVENT = "mirage:inspection-pose";
const VALID_SCENARIOS = new Set([
  "all",
  "compact",
  "desktop",
  "narrow",
  "mobile",
  "opening",
  "route",
  "route-desktop",
  "route-mobile",
]);

function parseArguments(argv) {
  const options = {
    headed: false,
    out: undefined,
    scenario: "all",
    url: process.env.PLAYTEST_URL ?? DEFAULT_URL,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--headed") options.headed = true;
    else if (argument === "--url") options.url = argv[++index];
    else if (argument === "--out") options.out = argv[++index];
    else if (argument === "--scenario") options.scenario = argv[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.url) throw new Error("--url requires a value");
  if (!VALID_SCENARIOS.has(options.scenario)) {
    throw new Error(`Unknown scenario: ${options.scenario}`);
  }
  return options;
}

function usage() {
  return `Mirage autonomous playtest\n\nUsage:\n  pnpm playtest [options]\n\nOptions:\n  --url <url>         Target URL (default: ${DEFAULT_URL})\n  --scenario <name>   all, compact, desktop, narrow, mobile, opening, route, route-desktop, or route-mobile\n  --out <directory>   Artifact directory\n  --headed            Show Chromium while it plays\n`;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next dev server exited with code ${child.exitCode}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureTarget(url) {
  if (await reachable(url)) return undefined;
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Target is unreachable: ${url}`);
  }
  const port = parsed.port || "80";
  const nextBin = path.join(ROOT, "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", parsed.hostname, "--port", port],
    { cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] },
  );
  try {
    await waitForServer(url, child);
    return child;
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

function numberAttribute(element, name) {
  return element.getAttribute(name).then(Number);
}

function attributeSnapshot(element, names) {
  return element.evaluate(
    (node, requested) =>
      Object.fromEntries(
        requested.map((name) => [name, node.getAttribute(`data-${name}`)]),
      ),
    names,
  );
}

async function telemetry(shell) {
  const names = [
    "aiming",
    "boost",
    "brake",
    "camera-yaw",
    "camera-pitch",
    "camera-roll-target",
    "dropped-seconds",
    "frame-ms",
    "look-x",
    "look-y",
    "lateral-load",
    "longitudinal-load",
    "mode",
    "magazine",
    "phase",
    "player-x",
    "player-y",
    "player-yaw",
    "player-z",
    "pointer-locked",
    "quality",
    "slow-frame-ratio",
    "speed",
    "steer",
    "throttle",
    "tick",
    "vehicle-yaw",
    "vehicle-health",
  ];
  return attributeSnapshot(shell, names);
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

async function graphicsInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#afterlight-renderer");
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!context) return { renderer: "unavailable", software: true };
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug
      ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER);
    const label = String(renderer ?? "unknown");
    return {
      renderer: label,
      software: /swiftshader|software|llvmpipe/i.test(label),
    };
  });
}

function addPerformanceCheck(scenario, id, frameMs, budget) {
  if (scenario.graphics.software) {
    addCheck(
      scenario,
      `${id}-software-fallback`,
      scenario.telemetry.quality === "low",
      { frameMs, quality: scenario.telemetry.quality },
      "software renderer adapts to low quality",
    );
    return;
  }
  addCheck(
    scenario,
    id,
    frameMs > 0 && frameMs < budget,
    frameMs,
    `0..${budget} ms average`,
  );
}

function addCheck(scenario, id, passed, actual, expected) {
  scenario.checks.push({ actual, expected, id, passed });
  if (!passed)
    throw new Error(`${id}: expected ${expected}; received ${actual}`);
}

async function waitForAttribute(
  page,
  shell,
  name,
  predicate,
  timeout = 20_000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await shell.getAttribute(`data-${name}`);
    if (predicate(value)) return value;
    await page.waitForTimeout(16);
  }
  throw new Error(`Timed out waiting for data-${name}`);
}

function completeScenario(scenario) {
  scenario.checks.push({
    actual: "completed",
    expected: "journey completes",
    id: "journey-complete",
    passed: true,
  });
  scenario.passed = true;
}

function failScenario(scenario, error) {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  scenario.error = message;
  scenario.checks.push({
    actual: message.split("\n", 1)[0],
    expected: "journey completes",
    id: "journey-complete",
    passed: false,
  });
  scenario.passed = false;
}

async function waitForTick(page, shell, target) {
  return waitForAttribute(
    page,
    shell,
    "tick",
    (value) => Number(value) >= target,
  );
}

async function waitForDriveSample(
  page,
  shell,
  {
    minDistance = 0,
    minSpeed,
    minTurn,
    startX = 0,
    startYaw,
    startZ = 0,
    timeout = 20_000,
  },
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const sample = await attributeSnapshot(shell, [
      "boost",
      "camera-roll-target",
      "lateral-load",
      "longitudinal-load",
      "phase",
      "player-x",
      "player-z",
      "speed",
      "steer",
      "throttle",
      "tick",
      "vehicle-health",
      "vehicle-yaw",
    ]);
    const turn = Math.abs(angleDelta(startYaw, Number(sample["vehicle-yaw"])));
    const distance = Math.hypot(
      Number(sample["player-x"]) - startX,
      Number(sample["player-z"]) - startZ,
    );
    if (
      Number(sample.speed) >= minSpeed &&
      turn >= minTurn &&
      distance >= minDistance
    ) {
      return sample;
    }
    await page.waitForTimeout(16);
  }
  throw new Error(
    `Timed out waiting for vehicle speed ${minSpeed} and turn ${minTurn}`,
  );
}

async function waitForStablePaint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  });
}

async function capturePagePng(page, clip) {
  const session = await page.context().newCDPSession(page);
  try {
    let captureClip = clip;
    if (!captureClip) {
      const metrics = await session.send("Page.getLayoutMetrics");
      captureClip = {
        height: metrics.cssContentSize.height,
        width: metrics.cssContentSize.width,
        x: 0,
        y: 0,
      };
    }
    const capture = await session.send("Page.captureScreenshot", {
      captureBeyondViewport: true,
      clip: { ...captureClip, scale: 1 },
      format: "png",
      fromSurface: true,
    });
    return Buffer.from(capture.data, "base64");
  } finally {
    await session.detach();
  }
}

async function capture(scenario, page, outDir, name) {
  const fileName = `${scenario.id}-${name}.png`;
  const filePath = path.join(outDir, fileName);
  await waitForStablePaint(page);
  await writeFile(filePath, await capturePagePng(page));
  scenario.screenshots.push(fileName);
}

async function inspectCanvas(scenario, page, outDir, name) {
  const fileName = `${scenario.id}-${name}-canvas.png`;
  const checkPrefix = name === "start" ? "" : `${name}-`;
  const canvas = page.locator("canvas#afterlight-renderer");
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await waitForStablePaint(page);
  const bounds = await page.evaluate(() => {
    const element = document.querySelector("canvas#afterlight-renderer");
    if (!(element instanceof HTMLCanvasElement)) return undefined;
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.left,
      y: rect.top,
    };
  });
  if (!bounds) throw new Error("Afterlight canvas has no visible bounds");
  let bestCapture = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForStablePaint(page);
    const candidatePng = await capturePagePng(page, bounds);
    const candidateStats = renderedPixelStats(candidatePng);
    if (!bestCapture || candidateStats.litRatio > bestCapture.stats.litRatio) {
      bestCapture = { png: candidatePng, stats: candidateStats };
    }
    if (attempt < 2) await page.waitForTimeout(34);
  }
  if (!bestCapture) throw new Error("Afterlight canvas capture failed");
  const { png, stats } = bestCapture;
  await writeFile(path.join(outDir, fileName), png);
  scenario.screenshots.push(fileName);
  scenario.canvas = stats;
  addCheck(
    scenario,
    `${checkPrefix}canvas-lit`,
    stats.litRatio > 0.35,
    stats.litRatio,
    "> 0.35",
  );
  addCheck(
    scenario,
    `${checkPrefix}canvas-tonal-range`,
    stats.bucketCount > 4,
    stats.bucketCount,
    "> 4",
  );
}

async function startGame(page, scenario, outDir, pathname = "/") {
  await page.goto(pathname, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Start the job" }).click();
  const shell = page.getByTestId("afterlight-game");
  await shell.waitFor({ state: "visible", timeout: 30_000 });
  await waitForAttribute(
    page,
    shell,
    "scene-ready",
    (value) => value === "true",
    45_000,
  );
  addCheck(scenario, "scene-ready", true, "true", "true");
  await inspectCanvas(scenario, page, outDir, "start");
  const startTick = await numberAttribute(shell, "data-tick");
  await waitForTick(page, shell, startTick + 5);
  addCheck(
    scenario,
    "simulation-running",
    true,
    `tick ${startTick + 5}`,
    "tick advances",
  );
  return shell;
}

async function primeDeploymentAccess(page, baseURL) {
  const accessURL = process.env.PLAYTEST_ACCESS_URL;
  if (!accessURL) return;
  if (new URL(accessURL).origin !== new URL(baseURL).origin) {
    throw new Error(
      "PLAYTEST_ACCESS_URL must match the playtest target origin",
    );
  }
  await page.goto(accessURL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
}

async function routeInspectionScenario(
  browser,
  baseURL,
  outDir,
  headed,
  mobile,
) {
  const scenario = {
    checks: [],
    id: mobile ? "route-corridor-mobile" : "route-corridor-desktop",
    screenshots: [],
  };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    ...(mobile
      ? {
          deviceScaleFactor: 2.75,
          hasTouch: true,
          isMobile: true,
          viewport: { height: 844, width: 390 },
        }
      : { viewport: { height: 720, width: 1280 } }),
  });
  const page = await context.newPage();
  await primeDeploymentAccess(page, baseURL);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  await page.addInitScript((touchEnabled) => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    if (!touchEnabled) return;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }, mobile);

  try {
    await startGame(page, scenario, outDir, "/?inspect=route-block");
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.mirageInspectionPose === "route-block",
    );
    const inspectionPose = await page.evaluate(
      () => document.documentElement.dataset.mirageInspectionPose,
    );
    addCheck(
      scenario,
      "route-inspection-pose",
      inspectionPose === "route-block",
      inspectionPose,
      "route-block",
    );
    await page.waitForFunction(() => {
      const raw = document.documentElement.dataset.mirageAmbientCivilians;
      if (!raw) return false;
      const population = JSON.parse(raw);
      return population.observedMixed === true;
    });
    const ambientPopulation = await page.evaluate(() =>
      JSON.parse(
        document.documentElement.dataset.mirageAmbientCivilians ?? "null",
      ),
    );
    addCheck(
      scenario,
      "ambient-civilian-behavior-mix",
      ambientPopulation?.observedMixed === true,
      ambientPopulation,
      "observed walking and idle civilians together",
    );

    if (mobile) {
      const labels = [
        "Move",
        "Look",
        "Enter vehicle",
        "Fire",
        "Sprint",
        "Jump",
      ];
      const visible = {};
      for (const label of labels) {
        visible[label] = await page
          .getByRole("button", { name: label, exact: true })
          .isVisible();
      }
      addCheck(
        scenario,
        "route-touch-controls",
        Object.values(visible).every(Boolean),
        visible,
        "all visible",
      );
    }

    await capture(scenario, page, outDir, "corridor");
    const inspections = mobile
      ? [
          { capture: "hero-loadout", key: "hero-close" },
          { capture: "yard", key: "yard-opening" },
        ]
      : [
          { capture: "hero-loadout", key: "hero-close" },
          { capture: "hero-aim", key: "hero-aim" },
          { capture: "ambient-life", key: "ambient-life" },
          { capture: "sidewalk", key: "route-block-side" },
          { capture: "facade", key: "route-facade" },
          { capture: "corner", key: "signature-corner" },
          { capture: "yard", key: "yard-opening" },
          { capture: "vehicles", key: "vehicle-fleet" },
          { capture: "vehicles-side", key: "vehicle-fleet-side" },
        ];
    for (const inspection of inspections) {
      await page.evaluate(
        ({ eventName, key }) =>
          window.dispatchEvent(new CustomEvent(eventName, { detail: key })),
        { eventName: PLAYTEST_INSPECTION_EVENT, key: inspection.key },
      );
      await page.waitForFunction(
        (expected) =>
          document.documentElement.dataset.mirageInspectionPose === expected,
        inspection.key,
      );
      await page.waitForTimeout(300);
      const resolvedInspection = await page.evaluate(
        () => document.documentElement.dataset.mirageInspectionPose,
      );
      addCheck(
        scenario,
        `${inspection.key}-inspection-pose`,
        resolvedInspection === inspection.key,
        resolvedInspection,
        inspection.key,
      );
      if (inspection.key === "hero-close") {
        const loadout = await page.evaluate(() =>
          JSON.parse(
            document.documentElement.dataset.mirageAgentLoadout ?? "null",
          ),
        );
        addCheck(
          scenario,
          "hero-loadout-visible",
          loadout?.visible === true && loadout?.meshCount > 0,
          loadout,
          "visible animated loadout mesh",
        );
        addCheck(
          scenario,
          "hero-loadout-tactical-palette",
          loadout?.colors?.includes("#173b40") === true,
          loadout?.colors,
          "includes #173b40",
        );
      }
      if (inspection.key === "hero-aim") {
        await page.waitForFunction(
          () => document.documentElement.dataset.mirageAgentAnimation === "aim",
        );
        const { action, animation } = await page.evaluate(() => ({
          action: JSON.parse(
            document.documentElement.dataset.mirageAgentAction ?? "null",
          ),
          animation:
            document.documentElement.dataset.mirageAgentAnimation ?? null,
        }));
        addCheck(
          scenario,
          "hero-aim-animation",
          animation === "aim",
          animation,
          "aim",
        );
        addCheck(
          scenario,
          "hero-aim-action-running",
          action?.running === true && action?.scheduled === true,
          action,
          "running scheduled action",
        );
      }
      await capture(scenario, page, outDir, inspection.capture);
      await inspectCanvas(scenario, page, outDir, inspection.capture);
    }
    addCheck(scenario, "runtime-errors", errors.length === 0, errors, "none");
    completeScenario(scenario);
  } catch (error) {
    failScenario(scenario, error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    scenario.browserErrors = errors;
    scenario.durationMs = Date.now() - startedAt;
    if (!headed) await context.close();
  }
  return scenario;
}

async function openingCinematicScenario(
  browser,
  baseURL,
  outDir,
  headed,
  mobile,
) {
  const scenario = {
    checks: [],
    id: mobile ? "opening-cinematic-mobile" : "opening-cinematic-desktop",
    screenshots: [],
  };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    ...(mobile
      ? {
          deviceScaleFactor: 2.75,
          hasTouch: true,
          isMobile: true,
          viewport: { height: 844, width: 390 },
        }
      : { viewport: { height: 720, width: 1280 } }),
  });
  const page = await context.newPage();
  await primeDeploymentAccess(page, baseURL);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  await page.addInitScript((touchEnabled) => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    if (!touchEnabled) return;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }, mobile);

  try {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const shell = page.getByTestId("afterlight-game");
    await page.getByRole("button", { name: "Start the job" }).click();
    await shell.waitFor({ state: "visible", timeout: 30_000 });
    await waitForAttribute(
      page,
      shell,
      "opening-assets-ready",
      (value) => value === "true",
      30_000,
    );
    addCheck(
      scenario,
      "opening-assets-ready",
      true,
      "true",
      "true before entry",
    );
    await waitForAttribute(
      page,
      shell,
      "opening-cinematic",
      (value) => value === "true",
      5_000,
    );
    await page.waitForTimeout(220);
    const openingBeforeInput = await shell.getAttribute(
      "data-opening-cinematic",
    );
    addCheck(
      scenario,
      "opening-cinematic-active",
      openingBeforeInput === "true",
      openingBeforeInput,
      "true",
    );
    await capture(scenario, page, outDir, "opening");
    await inspectCanvas(scenario, page, outDir, "opening");

    if (mobile) {
      const sprint = page.getByRole("button", { name: "Sprint", exact: true });
      await sprint.dispatchEvent("pointerdown", {
        bubbles: true,
        isPrimary: true,
        pointerId: 41,
        pointerType: "touch",
      });
      await page.waitForTimeout(40);
      await sprint.dispatchEvent("pointerup", {
        bubbles: true,
        isPrimary: true,
        pointerId: 41,
        pointerType: "touch",
      });
    } else {
      await page.keyboard.press("w");
    }
    await waitForAttribute(
      page,
      shell,
      "opening-cinematic",
      (value) => value === "false",
      5_000,
    );
    addCheck(
      scenario,
      "opening-input-cancel",
      true,
      "false",
      "false after first input",
    );
    if (mobile) {
      const touchControls = await page
        .locator('[aria-label="Touch game controls"]')
        .isVisible();
      addCheck(
        scenario,
        "opening-touch-controls",
        touchControls,
        touchControls,
        "visible",
      );
    }
    addCheck(scenario, "runtime-errors", errors.length === 0, errors, "none");
    completeScenario(scenario);
  } catch (error) {
    failScenario(scenario, error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    scenario.browserErrors = errors;
    scenario.durationMs = Date.now() - startedAt;
    if (!headed) await context.close();
  }
  return scenario;
}

async function desktopScenario(browser, baseURL, outDir, headed) {
  const scenario = { checks: [], id: "desktop-foot-car", screenshots: [] };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    viewport: { height: 720, width: 1280 },
  });
  const page = await context.newPage();
  await primeDeploymentAccess(page, baseURL);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    let pointerLockElement = null;
    Object.defineProperty(Document.prototype, "pointerLockElement", {
      configurable: true,
      get: () => pointerLockElement,
    });
    Object.defineProperty(HTMLElement.prototype, "requestPointerLock", {
      configurable: true,
      value() {
        pointerLockElement = document.querySelector(".game-input-surface");
        document.dispatchEvent(new Event("pointerlockchange"));
      },
    });
    Object.defineProperty(Document.prototype, "exitPointerLock", {
      configurable: true,
      value() {
        pointerLockElement = null;
        document.dispatchEvent(new Event("pointerlockchange"));
      },
    });
  });

  try {
    const shell = await startGame(page, scenario, outDir);
    const input = page.locator(".game-input-surface");
    await input.click({ force: true, position: { x: 640, y: 360 } });
    if ((await shell.getAttribute("data-pointer-locked")) !== "true") {
      await input.evaluate((element) => element.requestPointerLock());
    }
    await waitForAttribute(
      page,
      shell,
      "pointer-locked",
      (value) => value === "true",
    );

    const yawBefore = await numberAttribute(shell, "data-camera-yaw");
    await input.dispatchEvent("pointermove", {
      movementX: 140,
      movementY: -20,
      pointerId: 1,
      pointerType: "mouse",
    });
    const yawAfter = Number(
      await waitForAttribute(
        page,
        shell,
        "camera-yaw",
        (value) => Number(value) !== yawBefore,
      ),
    );
    addCheck(
      scenario,
      "mouse-look",
      yawAfter !== yawBefore,
      { yawAfter, yawBefore },
      "yaw changes",
    );

    const startX = await numberAttribute(shell, "data-player-x");
    const startZ = await numberAttribute(shell, "data-player-z");
    const startTick = await numberAttribute(shell, "data-tick");
    await page.keyboard.down("w");
    await waitForTick(page, shell, startTick + 60);
    await page.keyboard.up("w");
    const endX = await numberAttribute(shell, "data-player-x");
    const endZ = await numberAttribute(shell, "data-player-z");
    const distance = Math.hypot(endX - startX, endZ - startZ);
    addCheck(
      scenario,
      "walk-distance",
      distance > 3 && distance < 5.2,
      distance,
      "3..5.2 meters",
    );
    const forward =
      (endX - startX) * Math.sin(yawAfter) +
      (endZ - startZ) * Math.cos(yawAfter);
    const lateral =
      (endX - startX) * Math.cos(yawAfter) -
      (endZ - startZ) * Math.sin(yawAfter);
    addCheck(
      scenario,
      "camera-relative-walk",
      forward > 3 && Math.abs(lateral) < 0.5,
      { forward, lateral },
      "forward > 3 and |lateral| < 0.5",
    );

    const returnTick = await numberAttribute(shell, "data-tick");
    await page.keyboard.down("s");
    await waitForTick(page, shell, returnTick + 60);
    await page.keyboard.up("s");
    await page.keyboard.press("e");
    await waitForAttribute(page, shell, "mode", (value) => value === "car");
    addCheck(scenario, "vehicle-entry", true, "car", "car");

    const driveStart = await attributeSnapshot(shell, [
      "player-x",
      "player-z",
      "tick",
      "vehicle-yaw",
    ]);
    const driveStartX = Number(driveStart["player-x"]);
    const driveStartZ = Number(driveStart["player-z"]);
    const driveStartTick = Number(driveStart.tick);
    const driveStartYaw = Number(driveStart["vehicle-yaw"]);
    await page.keyboard.down("s");
    await page.keyboard.down("d");
    const reverseSample = await waitForDriveSample(page, shell, {
      minDistance: 2.5,
      minSpeed: 12,
      minTurn: 0.05,
      startX: driveStartX,
      startYaw: driveStartYaw,
      startZ: driveStartZ,
    });
    await page.keyboard.down("Space");
    await page.keyboard.up("d");
    await page.keyboard.up("s");
    const reverseDistance = Math.hypot(
      Number(reverseSample["player-x"]) - driveStartX,
      Number(reverseSample["player-z"]) - driveStartZ,
    );
    const reverseTurn = Math.abs(
      angleDelta(driveStartYaw, Number(reverseSample["vehicle-yaw"])),
    );
    const reverseTicks = Math.max(
      1,
      Number(reverseSample.tick) - driveStartTick,
    );
    const reverseTurnRate = (reverseTurn * 60) / reverseTicks;
    addCheck(
      scenario,
      "vehicle-reverse",
      Number(reverseSample.throttle) < -0.9 && reverseDistance >= 2.5,
      {
        distance: reverseDistance,
        speed: Number(reverseSample.speed),
        throttle: Number(reverseSample.throttle),
      },
      "reverse throttle and >= 2.5 meters",
    );
    addCheck(
      scenario,
      "vehicle-steering-input",
      Number(reverseSample.steer) > 0.9,
      Number(reverseSample.steer),
      ">0.9",
    );
    addCheck(
      scenario,
      "vehicle-chassis-load",
      Math.abs(Number(reverseSample["lateral-load"])) > 0.2,
      Number(reverseSample["lateral-load"]),
      "absolute load > 0.2",
    );
    addCheck(
      scenario,
      "vehicle-camera-bank",
      Math.abs(Number(reverseSample["camera-roll-target"])) > 0.005,
      Number(reverseSample["camera-roll-target"]),
      "absolute bank > 0.005 radians",
    );
    await capture(scenario, page, outDir, "car-cornering");
    await inspectCanvas(scenario, page, outDir, "car-cornering");
    addCheck(
      scenario,
      "vehicle-turn-rate",
      reverseTurnRate > 0.03 && reverseTurnRate < 1.3,
      { angle: reverseTurn, rate: reverseTurnRate, ticks: reverseTicks },
      "0.03..1.3 radians per simulated second",
    );
    addCheck(
      scenario,
      "vehicle-reverse-course-stable",
      reverseSample.phase === "boost" &&
        Number(reverseSample["vehicle-health"]) >= 99,
      {
        health: Number(reverseSample["vehicle-health"]),
        phase: reverseSample.phase,
      },
      "boost phase and >= 99 integrity",
    );
    const reverseSpeedBeforeBrake = Number(reverseSample.speed);
    await waitForAttribute(
      page,
      shell,
      "speed",
      (value) => Number(value) < reverseSpeedBeforeBrake * 0.55,
    );
    const reverseBrakeSample = await attributeSnapshot(shell, [
      "brake",
      "longitudinal-load",
      "speed",
      "vehicle-health",
    ]);
    addCheck(
      scenario,
      "vehicle-brake-input",
      reverseBrakeSample.brake === "true",
      reverseBrakeSample.brake,
      "true",
    );
    addCheck(
      scenario,
      "vehicle-braking",
      Number(reverseBrakeSample.speed) < reverseSpeedBeforeBrake * 0.55,
      {
        speedAfterBrake: Number(reverseBrakeSample.speed),
        speedBeforeBrake: reverseSpeedBeforeBrake,
      },
      "speed falls by more than 45%",
    );
    addCheck(
      scenario,
      "vehicle-brake-load",
      Number(reverseBrakeSample["longitudinal-load"]) <= -0.99,
      Number(reverseBrakeSample["longitudinal-load"]),
      "<= -0.99",
    );
    await capture(scenario, page, outDir, "car-braking");
    await inspectCanvas(scenario, page, outDir, "car-braking");
    await waitForAttribute(page, shell, "speed", (value) => Number(value) < 1);
    await page.keyboard.up("Space");

    const handlingStart = await attributeSnapshot(shell, [
      "player-x",
      "player-z",
      "tick",
      "vehicle-yaw",
    ]);
    const handlingStartX = Number(handlingStart["player-x"]);
    const handlingStartZ = Number(handlingStart["player-z"]);
    const handlingStartYaw = Number(handlingStart["vehicle-yaw"]);
    await page.keyboard.down("w");
    await page.keyboard.down("Shift");
    const driveSample = await waitForDriveSample(page, shell, {
      minSpeed: 3,
      minTurn: 0,
      startYaw: handlingStartYaw,
    });
    await page.keyboard.down("Space");
    await page.keyboard.up("Shift");
    await page.keyboard.up("w");
    const cruiseSpeed = Number(driveSample.speed);
    addCheck(
      scenario,
      "vehicle-throttle",
      Number(driveSample.throttle) > 0.9 &&
        cruiseSpeed >= 3 &&
        cruiseSpeed < 70,
      cruiseSpeed,
      "forward throttle and 3..70 kph",
    );
    addCheck(
      scenario,
      "vehicle-boost-input",
      driveSample.boost === "true",
      driveSample.boost,
      "true",
    );

    addCheck(
      scenario,
      "vehicle-brake-precondition",
      cruiseSpeed >= 3,
      cruiseSpeed,
      ">= 3 kph",
    );
    addCheck(
      scenario,
      "vehicle-handling-phase-stable",
      driveSample.phase === "boost",
      driveSample.phase,
      "boost",
    );
    await waitForAttribute(
      page,
      shell,
      "speed",
      (value) => Number(value) < Math.max(1, cruiseSpeed * 0.55),
    );
    const brakeSample = await attributeSnapshot(shell, [
      "brake",
      "player-x",
      "player-z",
      "speed",
      "vehicle-health",
    ]);
    await page.keyboard.up("Space");

    const driveDistance = Math.hypot(
      Number(brakeSample["player-x"]) - handlingStartX,
      Number(brakeSample["player-z"]) - handlingStartZ,
    );
    addCheck(
      scenario,
      "vehicle-drive-distance",
      driveDistance > 0.05,
      driveDistance,
      "> 0.05 meters",
    );
    const vehicleHealth = Number(brakeSample["vehicle-health"]);
    addCheck(
      scenario,
      "vehicle-collision-free",
      vehicleHealth >= 99,
      vehicleHealth,
      ">= 99 integrity",
    );
    scenario.telemetry = await telemetry(shell);
    scenario.graphics = await graphicsInfo(page);
    const frameMs = Number(scenario.telemetry["frame-ms"]);
    addPerformanceCheck(scenario, "desktop-frame-budget", frameMs, 34);
    await capture(scenario, page, outDir, "car");
    addCheck(scenario, "runtime-errors", errors.length === 0, errors, "none");
    completeScenario(scenario);
  } catch (error) {
    failScenario(scenario, error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    scenario.browserErrors = errors;
    scenario.durationMs = Date.now() - startedAt;
    if (!headed) await context.close();
  }
  return scenario;
}

async function narrowScenario(browser, baseURL, outDir, headed) {
  const scenario = { checks: [], id: "narrow-desktop", screenshots: [] };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    viewport: { height: 825, width: 722 },
  });
  const page = await context.newPage();
  await primeDeploymentAccess(page, baseURL);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 8,
    });
  });
  try {
    const shell = await startGame(page, scenario, outDir);
    const touchCount = await page
      .locator('[aria-label="Touch game controls"]')
      .count();
    addCheck(
      scenario,
      "desktop-controls",
      touchCount === 0,
      touchCount,
      "0 touch overlays",
    );
    const input = page.locator(".game-input-surface");
    const yawBefore = await numberAttribute(shell, "data-camera-yaw");
    await input.dispatchEvent("pointerdown", {
      button: 0,
      clientX: 430,
      clientY: 410,
      pointerId: 77,
      pointerType: "mouse",
    });
    await input.dispatchEvent("pointermove", {
      clientX: 550,
      clientY: 410,
      movementX: 120,
      pointerId: 77,
      pointerType: "mouse",
    });
    await input.dispatchEvent("pointerup", {
      button: 0,
      clientX: 550,
      clientY: 410,
      pointerId: 77,
      pointerType: "mouse",
    });
    const yaw = Number(
      await waitForAttribute(
        page,
        shell,
        "camera-yaw",
        (value) => Number(value) !== yawBefore,
      ),
    );
    addCheck(
      scenario,
      "drag-look",
      yaw !== yawBefore,
      { yaw, yawBefore },
      "yaw changes",
    );

    const x = await numberAttribute(shell, "data-player-x");
    const z = await numberAttribute(shell, "data-player-z");
    const tick = await numberAttribute(shell, "data-tick");
    await page.keyboard.down("w");
    await waitForTick(page, shell, tick + 60);
    await page.keyboard.up("w");
    const dx = (await numberAttribute(shell, "data-player-x")) - x;
    const dz = (await numberAttribute(shell, "data-player-z")) - z;
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const lateral = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    addCheck(
      scenario,
      "camera-relative-walk",
      forward > 3 && Math.abs(lateral) < 0.5,
      { forward, lateral },
      "forward > 3 and |lateral| < 0.5",
    );
    scenario.telemetry = await telemetry(shell);
    scenario.graphics = await graphicsInfo(page);
    const frameMs = Number(scenario.telemetry["frame-ms"]);
    addPerformanceCheck(scenario, "narrow-frame-budget", frameMs, 42);
    await capture(scenario, page, outDir, "walk");
    addCheck(scenario, "runtime-errors", errors.length === 0, errors, "none");
    completeScenario(scenario);
  } catch (error) {
    failScenario(scenario, error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    scenario.browserErrors = errors;
    scenario.durationMs = Date.now() - startedAt;
    if (!headed) await context.close();
  }
  return scenario;
}

async function dispatchStick(page, label, phase, xScale, yScale) {
  await page.getByRole("button", { name: label, exact: true }).evaluate(
    (element, event) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new PointerEvent(event.phase, {
          bubbles: true,
          clientX: rect.left + rect.width * event.xScale,
          clientY: rect.top + rect.height * event.yScale,
          pointerId: event.label === "Move" ? 41 : 42,
          pointerType: "touch",
        }),
      );
    },
    { label, phase, xScale, yScale },
  );
}

async function mobileScenario(browser, baseURL, outDir, headed) {
  const scenario = { checks: [], id: "mobile-touch", screenshots: [] };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    deviceScaleFactor: 2.75,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  await primeDeploymentAccess(page, baseURL);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
  try {
    const shell = await startGame(page, scenario, outDir);
    const labels = ["Move", "Look", "Enter vehicle", "Fire", "Sprint", "Jump"];
    const visible = {};
    for (const label of labels) {
      visible[label] = await page
        .getByRole("button", { name: label, exact: true })
        .isVisible();
    }
    addCheck(
      scenario,
      "touch-controls",
      Object.values(visible).every(Boolean),
      visible,
      "all visible",
    );

    const x = await numberAttribute(shell, "data-player-x");
    const z = await numberAttribute(shell, "data-player-z");
    await dispatchStick(page, "Move", "pointerdown", 0.5, 0.08);
    await page.waitForFunction(
      ({ x, z }) => {
        const shell = document.querySelector('[data-testid="afterlight-game"]');
        if (!shell) return false;
        return (
          Math.hypot(
            Number(shell.getAttribute("data-player-x")) - x,
            Number(shell.getAttribute("data-player-z")) - z,
          ) > 0.5
        );
      },
      { x, z },
      { timeout: 20_000 },
    );
    await dispatchStick(page, "Move", "pointerup", 0.5, 0.08);
    const distance = Math.hypot(
      (await numberAttribute(shell, "data-player-x")) - x,
      (await numberAttribute(shell, "data-player-z")) - z,
    );
    addCheck(
      scenario,
      "touch-movement",
      distance > 0.5,
      distance,
      "> 0.5 meters",
    );

    const yawBefore = await numberAttribute(shell, "data-camera-yaw");
    await dispatchStick(page, "Look", "pointerdown", 0.92, 0.5);
    const yaw = Number(
      await waitForAttribute(
        page,
        shell,
        "camera-yaw",
        (value) => Number(value) !== yawBefore,
      ),
    );
    await dispatchStick(page, "Look", "pointerup", 0.92, 0.5);
    addCheck(
      scenario,
      "touch-look",
      yaw !== yawBefore,
      { yaw, yawBefore },
      "yaw changes",
    );

    await page
      .getByRole("button", { name: "Enter vehicle", exact: true })
      .click();
    await waitForAttribute(page, shell, "mode", (value) => value === "car");
    addCheck(scenario, "vehicle-entry", true, "car", "car");
    const vehicleLabels = ["Exit vehicle", "Boost", "Brake"];
    const vehicleControls = {};
    for (const label of vehicleLabels) {
      vehicleControls[label] = await page
        .getByRole("button", { name: label, exact: true })
        .isVisible();
    }
    addCheck(
      scenario,
      "touch-vehicle-controls",
      Object.values(vehicleControls).every(Boolean),
      vehicleControls,
      "all visible",
    );

    const vehicleStart = await attributeSnapshot(shell, [
      "player-x",
      "player-z",
      "tick",
      "vehicle-yaw",
    ]);
    const vehicleX = Number(vehicleStart["player-x"]);
    const vehicleZ = Number(vehicleStart["player-z"]);
    const vehicleYaw = Number(vehicleStart["vehicle-yaw"]);
    const driveTick = Number(vehicleStart.tick);
    await dispatchStick(page, "Move", "pointerdown", 0.78, 0.1);
    const driveSample = await waitForDriveSample(page, shell, {
      minSpeed: 8,
      minTurn: 0.015,
      startYaw: vehicleYaw,
    });
    await dispatchStick(page, "Move", "pointerup", 0.78, 0.1);
    await waitForAttribute(
      page,
      shell,
      "throttle",
      (value) => Math.abs(Number(value)) < 0.01,
    );
    const touchDriveSpeed = Number(driveSample.speed);
    const touchSteer = Number(driveSample.steer);
    const touchYaw = Number(driveSample["vehicle-yaw"]);
    const touchTurnEndTick = Number(driveSample.tick);
    const vehicleDistance = Math.hypot(
      Number(driveSample["player-x"]) - vehicleX,
      Number(driveSample["player-z"]) - vehicleZ,
    );
    const touchTurn = Math.abs(angleDelta(vehicleYaw, touchYaw));
    const touchTurnTicks = Math.max(1, touchTurnEndTick - driveTick);
    const touchTurnRate = (touchTurn * 60) / touchTurnTicks;
    addCheck(
      scenario,
      "touch-vehicle-drive",
      touchDriveSpeed >= 8 && vehicleDistance > 0.15,
      { distance: vehicleDistance, speed: touchDriveSpeed },
      "speed >= 8 kph and distance > 0.15 meters",
    );
    addCheck(
      scenario,
      "touch-vehicle-steering",
      touchSteer > 0.25 && touchTurnRate > 0.03 && touchTurnRate < 0.8,
      {
        angle: touchTurn,
        rate: touchTurnRate,
        steer: touchSteer,
        ticks: touchTurnTicks,
      },
      "steer > 0.25 and turn rate 0.03..0.8 radians per second",
    );

    addCheck(
      scenario,
      "touch-vehicle-course-stable",
      driveSample.phase === "boost" &&
        Number(driveSample["vehicle-health"]) >= 99,
      {
        health: Number(driveSample["vehicle-health"]),
        phase: driveSample.phase,
      },
      "boost phase and >= 99 integrity",
    );

    const brake = page.getByRole("button", { name: "Brake", exact: true });
    const touchBrakeStart = await attributeSnapshot(shell, ["speed"]);
    const touchSpeedBeforeBrake = Number(touchBrakeStart.speed);
    await brake.dispatchEvent("pointerdown", {
      pointerId: 52,
      pointerType: "touch",
    });
    await waitForAttribute(
      page,
      shell,
      "speed",
      (value) => Number(value) < touchSpeedBeforeBrake * 0.6,
    );
    const touchBrakeSample = await attributeSnapshot(shell, ["brake", "speed"]);
    await brake.dispatchEvent("pointerup", {
      pointerId: 52,
      pointerType: "touch",
    });
    const touchBrakeHeld = touchBrakeSample.brake;
    const touchBrakeSpeed = Number(touchBrakeSample.speed);
    addCheck(
      scenario,
      "touch-vehicle-brake",
      touchBrakeHeld === "true" &&
        touchSpeedBeforeBrake > 2 &&
        touchBrakeSpeed < touchSpeedBeforeBrake,
      {
        after: touchBrakeSpeed,
        before: touchSpeedBeforeBrake,
        held: touchBrakeHeld,
      },
      "held and speed decreases",
    );
    scenario.telemetry = await telemetry(shell);
    scenario.graphics = await graphicsInfo(page);
    const frameMs = Number(scenario.telemetry["frame-ms"]);
    addPerformanceCheck(scenario, "mobile-frame-budget", frameMs, 48);
    await capture(scenario, page, outDir, "car");
    addCheck(scenario, "runtime-errors", errors.length === 0, errors, "none");
    completeScenario(scenario);
  } catch (error) {
    failScenario(scenario, error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    scenario.browserErrors = errors;
    scenario.durationMs = Date.now() - startedAt;
    if (!headed) await context.close();
  }
  return scenario;
}

async function compactMobileScenario(browser, baseURL, outDir, headed) {
  const scenario = { checks: [], id: "compact-mobile", screenshots: [] };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 693, width: 320 },
  });
  const page = await context.newPage();
  await primeDeploymentAccess(page, baseURL);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });

  try {
    await startGame(page, scenario, outDir);
    const layout = await page.evaluate(() => {
      const hud = document.querySelector(
        '[aria-label="Afterlight mission HUD"]',
      );
      if (!(hud instanceof HTMLElement)) throw new Error("HUD unavailable");

      const rect = (element) => {
        if (!(element instanceof HTMLElement)) return undefined;
        const bounds = element.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          width: bounds.width,
        };
      };
      const topRail = hud.querySelector("header");
      const topRegions = topRail ? [...topRail.children].map(rect) : [];
      const mission = hud.querySelector('section[aria-live="polite"]');
      const lower = hud.querySelector("footer");
      const touchControls = document.querySelector(
        '[aria-label="Touch game controls"]',
      );
      const touchButtons = touchControls
        ? [...touchControls.querySelectorAll("button")]
            .map(rect)
            .filter(Boolean)
        : [];
      const visibleObjectives = mission
        ? [...mission.querySelectorAll("li")].filter((element) => {
            if (!(element instanceof HTMLElement)) return false;
            const bounds = element.getBoundingClientRect();
            return (
              getComputedStyle(element).display !== "none" && bounds.height > 0
            );
          }).length
        : 0;
      const optionalBadge = [...hud.querySelectorAll("small")].find(
        (element) => element.textContent?.trim() === "OPTIONAL",
      );
      const optionalCopy = optionalBadge?.parentElement;
      const optionalLabel = optionalCopy?.querySelector("span");
      const missionRect = rect(mission);
      const lowerRect = rect(lower);
      const touchRect = rect(touchControls);

      return {
        lower: lowerRect,
        lowerTouchGap:
          lowerRect && touchRect ? touchRect.top - lowerRect.bottom : -1,
        mission: missionRect,
        sceneBandRatio:
          missionRect && lowerRect
            ? (lowerRect.top - missionRect.bottom) / innerHeight
            : -1,
        objective: optionalLabel
          ? {
              clientHeight: optionalLabel.clientHeight,
              clientWidth: optionalLabel.clientWidth,
              scrollHeight: optionalLabel.scrollHeight,
              scrollWidth: optionalLabel.scrollWidth,
              text: optionalLabel.textContent?.trim(),
            }
          : undefined,
        topRegions,
        touchButtons,
        touchControls: touchRect,
        verticalGap:
          missionRect && lowerRect ? lowerRect.top - missionRect.bottom : -1,
        visibleObjectives,
        viewport: { height: innerHeight, width: innerWidth },
      };
    });

    const horizontalRects = [
      ...layout.topRegions,
      layout.mission,
      layout.lower,
      layout.touchControls,
      ...layout.touchButtons,
    ].filter(Boolean);
    const outside = horizontalRects.filter(
      (rect) => rect.left < -0.5 || rect.right > layout.viewport.width + 0.5,
    );
    addCheck(
      scenario,
      "compact-horizontal-fit",
      outside.length === 0,
      { outside, viewport: layout.viewport },
      "HUD regions remain inside the 320px viewport",
    );

    const topGaps = layout.topRegions
      .slice(0, -1)
      .map((region, index) => layout.topRegions[index + 1].left - region.right);
    addCheck(
      scenario,
      "compact-top-rail-spacing",
      layout.topRegions.length === 3 && topGaps.every((gap) => gap >= 2),
      topGaps,
      "three top-rail regions separated by at least 2px",
    );

    addCheck(
      scenario,
      "compact-objective-readable",
      Boolean(layout.objective) &&
        layout.objective.scrollWidth <= layout.objective.clientWidth + 1 &&
        layout.objective.scrollHeight <= layout.objective.clientHeight + 1,
      layout.objective,
      "optional objective renders without hidden text",
    );

    addCheck(
      scenario,
      "compact-hud-vertical-separation",
      layout.verticalGap >= 16,
      layout.verticalGap,
      ">= 16px between mission and lower HUD",
    );

    addCheck(
      scenario,
      "compact-scene-first-composition",
      Boolean(layout.mission) &&
        layout.mission.height <= 132 &&
        layout.mission.width <= layout.viewport.width * 0.8 &&
        layout.sceneBandRatio >= 0.4 &&
        layout.visibleObjectives >= 1 &&
        layout.visibleObjectives <= 2,
      {
        mission: layout.mission,
        sceneBandRatio: layout.sceneBandRatio,
        visibleObjectives: layout.visibleObjectives,
      },
      "mission panel stays compact and preserves >= 40% clear scene height",
    );

    const touchOverlaps = layout.touchButtons.flatMap((candidate, index) =>
      layout.touchButtons
        .slice(index + 1)
        .filter(
          (other) =>
            candidate.left < other.right &&
            candidate.right > other.left &&
            candidate.top < other.bottom &&
            candidate.bottom > other.top,
        ),
    );
    addCheck(
      scenario,
      "compact-touch-target-layout",
      layout.touchButtons.length === 8 &&
        layout.touchButtons.every(
          (target) => target.width >= 44 && target.height >= 44,
        ) &&
        touchOverlaps.length === 0 &&
        layout.touchControls?.height <= 104 &&
        layout.lower?.height <= 70 &&
        layout.lowerTouchGap >= 8,
      {
        lowerHeight: layout.lower?.height,
        lowerTouchGap: layout.lowerTouchGap,
        overlaps: touchOverlaps,
        targetSizes: layout.touchButtons.map(({ height, width }) => ({
          height,
          width,
        })),
        touchHeight: layout.touchControls?.height,
      },
      "eight non-overlapping 44px targets below a <= 70px instrument rail",
    );

    const touchLabels = [
      "Move",
      "Look",
      "Enter vehicle",
      "Fire",
      "Sprint",
      "Jump",
    ];
    const visible = {};
    for (const label of touchLabels) {
      visible[label] = await page
        .getByRole("button", { name: label, exact: true })
        .isVisible();
    }
    addCheck(
      scenario,
      "compact-touch-controls",
      Object.values(visible).every(Boolean),
      visible,
      "all compact touch controls visible",
    );

    await capture(scenario, page, outDir, "layout");
    addCheck(scenario, "runtime-errors", errors.length === 0, errors, "none");
    completeScenario(scenario);
  } catch (error) {
    failScenario(scenario, error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    scenario.browserErrors = errors;
    scenario.durationMs = Date.now() - startedAt;
    if (!headed) await context.close();
  }
  return scenario;
}

function markdownReport(report) {
  const lines = [
    `# Mirage Playtest: ${report.passed ? "PASS" : "FAIL"}`,
    "",
    `- Target: ${report.targetUrl}`,
    `- Commit: ${report.gitCommit}`,
    `- Duration: ${(report.durationMs / 1000).toFixed(1)}s`,
    `- Checks: ${report.summary.passed}/${report.summary.total} passed`,
    "",
  ];
  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.id}: ${scenario.passed ? "PASS" : "FAIL"}`, "");
    for (const check of scenario.checks) {
      lines.push(
        `- ${check.passed ? "PASS" : "FAIL"} \`${check.id}\`: ${JSON.stringify(check.actual)}`,
      );
    }
    if (scenario.error) lines.push("", "```text", scenario.error, "```");
    for (const screenshot of scenario.screenshots) {
      lines.push("", `![${scenario.id}](${screenshot})`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const target = new URL(options.url);
  if (
    options.scenario.startsWith("route") &&
    !["127.0.0.1", "localhost"].includes(target.hostname)
  ) {
    throw new Error("The route inspection scenario is development-only");
  }
  const outDir = path.resolve(
    ROOT,
    options.out ?? `.artifacts/playtest/${timestamp()}`,
  );
  await mkdir(outDir, { recursive: true });
  const startedAt = Date.now();
  const server = await ensureTarget(options.url);
  const browser = await chromium.launch({ headless: !options.headed });
  const scenarios = [];
  try {
    if (["all", "desktop"].includes(options.scenario))
      scenarios.push(
        await desktopScenario(browser, options.url, outDir, options.headed),
      );
    if (["all", "narrow"].includes(options.scenario))
      scenarios.push(
        await narrowScenario(browser, options.url, outDir, options.headed),
      );
    if (["all", "mobile"].includes(options.scenario))
      scenarios.push(
        await mobileScenario(browser, options.url, outDir, options.headed),
      );
    if (["all", "compact"].includes(options.scenario))
      scenarios.push(
        await compactMobileScenario(
          browser,
          options.url,
          outDir,
          options.headed,
        ),
      );
    if (["all", "opening"].includes(options.scenario)) {
      scenarios.push(
        await openingCinematicScenario(
          browser,
          options.url,
          outDir,
          options.headed,
          false,
        ),
      );
      scenarios.push(
        await openingCinematicScenario(
          browser,
          options.url,
          outDir,
          options.headed,
          true,
        ),
      );
    }
    if (["route", "route-desktop"].includes(options.scenario)) {
      scenarios.push(
        await routeInspectionScenario(
          browser,
          options.url,
          outDir,
          options.headed,
          false,
        ),
      );
    }
    if (["route", "route-mobile"].includes(options.scenario)) {
      scenarios.push(
        await routeInspectionScenario(
          browser,
          options.url,
          outDir,
          options.headed,
          true,
        ),
      );
    }
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }
  const checks = scenarios.flatMap((scenario) => scenario.checks);
  const passedChecks = checks.filter((check) => check.passed).length;
  const report = {
    durationMs: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
    gitCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim(),
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
    startedAt: new Date(startedAt).toISOString(),
    summary: {
      failed: checks.length - passedChecks,
      passed: passedChecks,
      total: checks.length,
    },
    targetUrl: options.url,
    version: 1,
  };
  await writeFile(
    path.join(outDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(path.join(outDir, "report.md"), markdownReport(report));
  process.stdout.write(
    `${report.passed ? "PASS" : "FAIL"} ${passedChecks}/${checks.length} checks\n${path.join(outDir, "report.md")}\n`,
  );
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
