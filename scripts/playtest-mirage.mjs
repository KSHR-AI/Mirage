#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { renderedPixelStats } from "./lib/png-stats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "http://127.0.0.1:3100";
const VALID_SCENARIOS = new Set(["all", "desktop", "mobile"]);
const GAME_SELECTOR = '[data-testid="mirage-game"]';
const CANVAS_SELECTOR = "#mirage-renderer canvas, canvas#mirage-renderer";

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

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
    else if (argument === "--help") options.help = true;
    else if (["--out", "--scenario", "--url"].includes(argument)) {
      const value = requiredValue(argv, index, argument);
      if (argument === "--out") options.out = value;
      else if (argument === "--scenario") options.scenario = value;
      else options.url = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!VALID_SCENARIOS.has(options.scenario)) {
    throw new Error(`Unknown scenario: ${options.scenario}`);
  }
  try {
    new URL(options.url);
  } catch {
    throw new Error(`Invalid target URL: ${options.url}`);
  }
  return options;
}

function usage() {
  return `Mirage: The Drop autonomous playtest

Usage:
  pnpm playtest [options]

Options:
  --url <url>         Target URL (default: ${DEFAULT_URL})
  --scenario <name>   all, desktop, or mobile
  --out <directory>   Artifact directory
  --headed            Show Chromium while it plays
`;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureTarget(url) {
  if (await reachable(url)) return undefined;
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Target is unreachable: ${url}`);
  }
  const nextBin = path.join(ROOT, "node_modules/next/dist/bin/next");
  const server = spawn(
    process.execPath,
    [
      nextBin,
      "dev",
      "--hostname",
      parsed.hostname,
      "--port",
      parsed.port || "80",
    ],
    { cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] },
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next dev server exited with code ${server.exitCode}`);
    }
    if (await reachable(url)) return server;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  server.kill("SIGTERM");
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

function addCheck(scenario, id, passed, actual, expected) {
  scenario.checks.push({ actual, expected, id, passed });
  if (!passed) scenario.passed = false;
}

function createScenario(id) {
  return {
    canvas: {},
    checks: [],
    id,
    passed: true,
    screenshots: [],
  };
}

async function capture(scenario, page, outDir, name) {
  const fileName = `${scenario.id}-${name}.png`;
  await page.screenshot({ path: path.join(outDir, fileName) });
  scenario.screenshots.push(fileName);
}

async function inspectCanvas(scenario, page, outDir, name) {
  const canvas = page.locator(CANVAS_SELECTOR).first();
  await canvas.waitFor({ state: "visible", timeout: 45_000 });
  const bounds = await canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Mirage renderer canvas is unavailable");
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Mirage renderer has invalid bounds: ${rect.toJSON()}`);
    }
    return {
      height: rect.height,
      width: rect.width,
      x: rect.left,
      y: rect.top,
    };
  });
  const session = await page.context().newCDPSession(page);
  let png;
  try {
    const result = await session.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      clip: { ...bounds, scale: 1 },
      format: "png",
      fromSurface: true,
    });
    png = Buffer.from(result.data, "base64");
  } finally {
    await session.detach();
  }
  const fileName = `${scenario.id}-${name}-canvas.png`;
  await writeFile(path.join(outDir, fileName), png);
  scenario.screenshots.push(fileName);
  const stats = renderedPixelStats(png);
  scenario.canvas[name] = stats;
  addCheck(
    scenario,
    `${name}-canvas-nonblank`,
    stats.litRatio > 0.12,
    stats.litRatio,
    "> 0.12",
  );
  addCheck(
    scenario,
    `${name}-canvas-tonal-range`,
    stats.bucketCount > 4,
    stats.bucketCount,
    "> 4",
  );
}

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const source = location.url
        ? ` (${location.url}:${location.lineNumber})`
        : "";
      errors.push(`console: ${message.text()}${source}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("crash", () => errors.push("page: renderer crashed"));
  return errors;
}

async function startGame(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const game = page.locator(GAME_SELECTOR);
  await game.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("data-scene-ready") ===
      "true",
    GAME_SELECTOR,
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Start run" }).click({
    timeout: 15_000,
  });
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("data-phase") === "pickup",
    GAME_SELECTOR,
    { timeout: 5_000 },
  );
  return game;
}

async function readTelemetry(game) {
  const values = await game.evaluate((element) => {
    const attribute = (name) => element.getAttribute(`data-${name}`);
    const number = (name) => Number(attribute(name));
    return {
      boostPickups: number("boost-pickups"),
      cameraMode: attribute("camera-mode"),
      laneOffset: number("lane-offset"),
      mapBlocks: number("map-blocks"),
      phase: attribute("phase"),
      rampUsed: attribute("ramp-used") === "true",
      routeIndex: number("route-index"),
      routeDistance: number("route-distance"),
      routeProgress: number("route-progress"),
      score: number("score"),
      speed: number("player-speed"),
      targetX: number("target-x"),
      targetZ: number("target-z"),
      touch: attribute("touch") === "true",
      x: number("player-x"),
      yaw: number("player-yaw"),
      z: number("player-z"),
    };
  });
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`Invalid game telemetry ${key}: ${value}`);
    }
  }
  return values;
}

async function validateWorld(scenario, page, game, outDir) {
  const state = await readTelemetry(game);
  addCheck(
    scenario,
    "fixed-camera",
    state.cameraMode === "fixed-isometric",
    state.cameraMode,
    "fixed-isometric",
  );
  addCheck(
    scenario,
    "complete-map",
    state.mapBlocks === 36,
    state.mapBlocks,
    36,
  );
  addCheck(
    scenario,
    "minimap-visible",
    await page.getByRole("img", { name: "City minimap" }).isVisible(),
    "visible",
    "visible",
  );
  await inspectCanvas(scenario, page, outDir, "start");
}

async function holdKey(page, key, duration) {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(duration);
  } finally {
    await page.keyboard.up(key);
  }
}

async function holdKeyUntil(page, key, predicate, argument, timeout = 5_000) {
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(predicate, argument, { timeout });
  } finally {
    await page.keyboard.up(key);
  }
}

async function driveMission(page, game, timeout = 60_000) {
  const trace = [];
  let previousRoute = -1;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const state = await readTelemetry(game);
    if (state.routeIndex !== previousRoute) {
      trace.push({
        phase: state.phase,
        routeIndex: state.routeIndex,
        routeDistance: state.routeDistance,
      });
      previousRoute = state.routeIndex;
    }
    if (state.phase === "complete") return trace;
    await page.waitForTimeout(50);
  }
  throw new Error(
    `Mission did not complete in ${timeout}ms: ${JSON.stringify(trace)}`,
  );
}

async function desktopScenario(browser, url, outDir) {
  const scenario = createScenario("desktop-the-drop");
  const context = await browser.newContext({
    viewport: { height: 720, width: 1280 },
  });
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    let game = await startGame(page, url);
    await validateWorld(scenario, page, game, outDir);
    await capture(scenario, page, outDir, "start");

    const starting = await readTelemetry(game);
    await page.waitForFunction(
      ({ selector, startZ }) =>
        Number(
          document.querySelector(selector)?.getAttribute("data-player-z"),
        ) <
        startZ - 3,
      { selector: GAME_SELECTOR, startZ: starting.z },
      { timeout: 6_000 },
    );
    const beforeSteer = await readTelemetry(game);
    await holdKey(page, "d", 500);
    const afterSteer = await readTelemetry(game);
    const laneChange = afterSteer.laneOffset - beforeSteer.laneOffset;
    addCheck(
      scenario,
      "keyboard-steering",
      laneChange > 2.5,
      laneChange,
      "> 2.5 lane units",
    );

    const beforeBoost = await readTelemetry(game);
    await holdKeyUntil(
      page,
      "w",
      ({ selector, threshold }) =>
        Number(
          document.querySelector(selector)?.getAttribute("data-player-speed"),
        ) > threshold,
      {
        selector: GAME_SELECTOR,
        threshold: Math.max(15, beforeBoost.speed + 2),
      },
    );
    const afterBoost = await readTelemetry(game);
    addCheck(
      scenario,
      "keyboard-boost",
      afterBoost.speed > beforeBoost.speed + 1,
      { after: afterBoost.speed, before: beforeBoost.speed },
      "> before + 1",
    );
    await holdKeyUntil(
      page,
      "s",
      ({ selector, threshold }) =>
        Number(
          document.querySelector(selector)?.getAttribute("data-player-speed"),
        ) < threshold,
      { selector: GAME_SELECTOR, threshold: afterBoost.speed - 5 },
    );
    const afterBrake = await readTelemetry(game);
    addCheck(
      scenario,
      "keyboard-brake",
      afterBrake.speed < afterBoost.speed - 3,
      { after: afterBrake.speed, before: afterBoost.speed },
      "< before - 3",
    );
    await capture(scenario, page, outDir, "desktop-input");

    game = await startGame(page, url);
    const trace = await driveMission(page, game);
    const completed = await readTelemetry(game);
    addCheck(
      scenario,
      "full-route",
      JSON.stringify(trace.map((entry) => entry.routeIndex)) ===
        JSON.stringify([0, 1, 2, 3, 4, 5]),
      trace,
      [0, 1, 2, 3, 4, 5],
    );
    addCheck(
      scenario,
      "mission-complete",
      completed.phase === "complete",
      completed.phase,
      "complete",
    );
    addCheck(
      scenario,
      "ramp-traversed",
      completed.rampUsed,
      completed.rampUsed,
      true,
    );
    addCheck(
      scenario,
      "boost-route",
      completed.boostPickups >= 1,
      completed.boostPickups,
      ">= 1",
    );
    addCheck(
      scenario,
      "final-score",
      completed.score > 0,
      completed.score,
      "> 0",
    );

    const dialog = page.getByRole("dialog", { name: "The drop is clean." });
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const debrief = {
      collisions: await dialog.getByText("Collisions").isVisible(),
      delivery: await dialog
        .getByText("Pier 11 / Package delivered")
        .isVisible(),
      nearMisses: await dialog.getByText("Near misses").isVisible(),
      score: await dialog.getByText("Score", { exact: true }).isVisible(),
    };
    addCheck(
      scenario,
      "debrief",
      Object.values(debrief).every(Boolean),
      debrief,
      "all mission results visible",
    );
    await capture(scenario, page, outDir, "complete");

    await page.getByRole("button", { name: "Replay The Drop" }).click();
    await page.waitForFunction(
      (selector) => {
        const element = document.querySelector(selector);
        return (
          element?.getAttribute("data-phase") === "pickup" &&
          element.getAttribute("data-route-index") === "0"
        );
      },
      GAME_SELECTOR,
      { timeout: 5_000 },
    );
    const replay = await readTelemetry(game);
    const replayState = {
      boostPickups: replay.boostPickups,
      dialogVisible: await dialog.isVisible(),
      phase: replay.phase,
      rampUsed: replay.rampUsed,
      routeIndex: replay.routeIndex,
    };
    addCheck(
      scenario,
      "replay-reset",
      replay.phase === "pickup" &&
        replay.routeIndex === 0 &&
        !replay.rampUsed &&
        replay.boostPickups === 0 &&
        !replayState.dialogVisible,
      replayState,
      {
        boostPickups: 0,
        dialogVisible: false,
        phase: "pickup",
        rampUsed: false,
        routeIndex: 0,
      },
    );
    await capture(scenario, page, outDir, "replay");
  } catch (error) {
    scenario.passed = false;
    scenario.error =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    await page.waitForTimeout(100).catch(() => undefined);
    addCheck(scenario, "browser-errors", errors.length === 0, errors, []);
    await context.close();
  }
  return scenario;
}

async function dispatchTouch(button, type, pointerId, horizontal = 0.5) {
  await button.evaluate(
    (element, event) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new PointerEvent(event.type, {
          bubbles: true,
          buttons: event.type === "pointerdown" ? 1 : 0,
          clientX: rect.left + rect.width * event.horizontal,
          clientY: rect.top + rect.height / 2,
          isPrimary: true,
          pointerId: event.pointerId,
          pointerType: "touch",
        }),
      );
    },
    { horizontal, pointerId, type },
  );
}

async function mobileScenario(browser, url, outDir) {
  const scenario = createScenario("mobile-the-drop");
  const context = await browser.newContext({
    deviceScaleFactor: 2.75,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
  const errors = collectErrors(page);
  try {
    const game = await startGame(page, url);
    await validateWorld(scenario, page, game, outDir);
    const initial = await readTelemetry(game);
    addCheck(scenario, "touch-profile", initial.touch, initial.touch, true);

    const controls = page.locator('[aria-label="Touch game controls"] button');
    const labels = await controls.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
    addCheck(
      scenario,
      "touch-controls",
      JSON.stringify(labels) === JSON.stringify(["Steer", "Boost", "Brake"]),
      labels,
      ["Steer", "Boost", "Brake"],
    );
    const layout = await controls.evaluateAll((buttons) => {
      const rects = buttons.map((button) => button.getBoundingClientRect());
      const overlaps = rects.flatMap((rect, index) =>
        rects
          .slice(index + 1)
          .filter(
            (other) =>
              rect.left < other.right &&
              rect.right > other.left &&
              rect.top < other.bottom &&
              rect.bottom > other.top,
          ),
      );
      return {
        overlaps: overlaps.length,
        sizes: rects.map((rect) => ({
          height: rect.height,
          width: rect.width,
        })),
      };
    });
    addCheck(
      scenario,
      "touch-layout",
      layout.overlaps === 0 &&
        layout.sizes.length === 3 &&
        layout.sizes.every((size) => size.height >= 44 && size.width >= 44),
      layout,
      "three non-overlapping controls at least 44x44",
    );
    await capture(scenario, page, outDir, "start");

    const steer = page.getByRole("button", { name: "Steer" });
    const beforeSteer = await readTelemetry(game);
    await dispatchTouch(steer, "pointerdown", 41, 0.9);
    await page.waitForTimeout(800);
    await dispatchTouch(steer, "pointerup", 41, 0.9);
    const afterSteer = await readTelemetry(game);
    const laneChange = afterSteer.laneOffset - beforeSteer.laneOffset;
    addCheck(
      scenario,
      "touch-steering",
      laneChange > 3.5,
      laneChange,
      "> 3.5 lane units",
    );

    const boost = page.getByRole("button", { name: "Boost" });
    const beforeBoost = await readTelemetry(game);
    await dispatchTouch(boost, "pointerdown", 42);
    await page.waitForTimeout(700);
    const afterBoost = await readTelemetry(game);
    await dispatchTouch(boost, "pointerup", 42);
    addCheck(
      scenario,
      "touch-boost",
      afterBoost.speed > 15 && afterBoost.speed > beforeBoost.speed + 2,
      { after: afterBoost.speed, before: beforeBoost.speed },
      "> 15 and > before + 2",
    );

    const brake = page.getByRole("button", { name: "Brake" });
    await dispatchTouch(brake, "pointerdown", 43);
    await page.waitForTimeout(700);
    const afterBrake = await readTelemetry(game);
    await dispatchTouch(brake, "pointerup", 43);
    addCheck(
      scenario,
      "touch-brake",
      afterBrake.speed < afterBoost.speed - 5,
      { after: afterBrake.speed, before: afterBoost.speed },
      "< before - 5",
    );
    await capture(scenario, page, outDir, "touch-input");
  } catch (error) {
    scenario.passed = false;
    scenario.error =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    await page.waitForTimeout(100).catch(() => undefined);
    addCheck(scenario, "browser-errors", errors.length === 0, errors, []);
    await context.close();
  }
  return scenario;
}

function markdownReport(report) {
  const lines = [
    `# Mirage: The Drop Playtest: ${report.passed ? "PASS" : "FAIL"}`,
    "",
    `- Target: ${report.targetUrl}`,
    `- Commit: ${report.gitCommit}`,
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
  const startedAt = new Date().toISOString();
  const outDir = path.resolve(
    ROOT,
    options.out ?? `.artifacts/playtest/${timestamp()}`,
  );
  await mkdir(outDir, { recursive: true });
  const server = await ensureTarget(options.url);
  let browser;
  const scenarios = [];
  try {
    browser = await chromium.launch({ headless: !options.headed });
    if (["all", "desktop"].includes(options.scenario)) {
      scenarios.push(await desktopScenario(browser, options.url, outDir));
    }
    if (["all", "mobile"].includes(options.scenario)) {
      scenarios.push(await mobileScenario(browser, options.url, outDir));
    }
  } finally {
    await browser?.close();
    await stopServer(server);
  }
  const checks = scenarios.flatMap((scenario) => scenario.checks);
  const passedChecks = checks.filter((check) => check.passed).length;
  const report = {
    finishedAt: new Date().toISOString(),
    gitCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim(),
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
    startedAt,
    summary: {
      failed: checks.length - passedChecks,
      passed: passedChecks,
      total: checks.length,
    },
    targetUrl: options.url,
    version: 3,
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
