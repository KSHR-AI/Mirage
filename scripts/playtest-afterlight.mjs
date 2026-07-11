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
const VALID_SCENARIOS = new Set(["all", "desktop", "narrow", "mobile"]);

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
  return `Mirage autonomous playtest\n\nUsage:\n  pnpm playtest [options]\n\nOptions:\n  --url <url>         Target URL (default: ${DEFAULT_URL})\n  --scenario <name>   all, desktop, narrow, or mobile\n  --out <directory>   Artifact directory\n  --headed            Show Chromium while it plays\n`;
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

async function telemetry(shell) {
  const names = [
    "aiming",
    "camera-yaw",
    "camera-pitch",
    "dropped-seconds",
    "frame-ms",
    "look-x",
    "look-y",
    "mode",
    "magazine",
    "player-x",
    "player-y",
    "player-yaw",
    "player-z",
    "pointer-locked",
    "quality",
    "slow-frame-ratio",
    "speed",
    "tick",
  ];
  const values = {};
  for (const name of names) {
    values[name] = await shell.getAttribute(`data-${name}`);
  }
  return values;
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
    await page.waitForTimeout(100);
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

async function capture(scenario, page, outDir, name) {
  const fileName = `${scenario.id}-${name}.png`;
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ fullPage: true, path: filePath });
  scenario.screenshots.push(fileName);
}

async function inspectCanvas(scenario, page, outDir, name) {
  const fileName = `${scenario.id}-${name}-canvas.png`;
  const canvas = page.locator("canvas#afterlight-renderer");
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  const png = await canvas.screenshot({ path: path.join(outDir, fileName) });
  const stats = renderedPixelStats(png);
  scenario.screenshots.push(fileName);
  scenario.canvas = stats;
  addCheck(
    scenario,
    "canvas-lit",
    stats.litRatio > 0.12,
    stats.litRatio,
    "> 0.12",
  );
  addCheck(
    scenario,
    "canvas-tonal-range",
    stats.bucketCount > 4,
    stats.bucketCount,
    "> 4",
  );
}

async function startGame(page, scenario, outDir) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Start the job" }).click();
  const shell = page.getByTestId("afterlight-game");
  await shell.waitFor({ state: "visible", timeout: 30_000 });
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

async function desktopScenario(browser, baseURL, outDir, headed) {
  const scenario = { checks: [], id: "desktop-foot-car", screenshots: [] };
  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL,
    viewport: { height: 720, width: 1280 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 8,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 8,
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

    await page.keyboard.down("w");
    const speed = Number(
      await waitForAttribute(
        page,
        shell,
        "speed",
        (value) => Number(value) > 1,
      ),
    );
    await page.keyboard.up("w");
    addCheck(scenario, "vehicle-throttle", speed > 1, speed, "> 1 kph");
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
