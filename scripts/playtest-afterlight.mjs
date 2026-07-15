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
  return `Mirage autonomous playtest\n\nUsage:\n  pnpm playtest [options]\n\nOptions:\n  --url <url>         Target URL (default: ${DEFAULT_URL})\n  --scenario <name>   all, desktop, or mobile\n  --out <directory>   Artifact directory\n  --headed            Show Chromium while it plays\n`;
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

function addCheck(scenario, id, passed, actual, expected) {
  scenario.checks.push({ actual, expected, id, passed });
  if (!passed) scenario.passed = false;
}

async function capture(scenario, page, outDir, name) {
  const fileName = `${scenario.id}-${name}.png`;
  await page.screenshot({ path: path.join(outDir, fileName) });
  scenario.screenshots.push(fileName);
}

async function inspectCanvas(scenario, page, outDir, name) {
  const canvas = page.locator("canvas#afterlight-renderer");
  await canvas.waitFor({ state: "visible", timeout: 45_000 });
  const fileName = `${scenario.id}-${name}-canvas.png`;
  const png = await canvas.screenshot({ path: path.join(outDir, fileName) });
  scenario.screenshots.push(fileName);
  const stats = renderedPixelStats(png);
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

async function startGame(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Play" }).click({ timeout: 90_000 });
  const game = page.getByTestId("afterlight-game");
  await game.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="afterlight-game"]')
        ?.getAttribute("data-scene-ready") === "true",
    undefined,
    { timeout: 45_000 },
  );
  return game;
}

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function desktopScenario(browser, url, outDir) {
  const scenario = {
    checks: [],
    id: "desktop-hot-ride",
    passed: true,
    screenshots: [],
  };
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    const game = await startGame(page, url);
    addCheck(
      scenario,
      "default-contract",
      (await game.getAttribute("data-contract")) === "hot-ride",
      await game.getAttribute("data-contract"),
      "hot-ride",
    );
    addCheck(
      scenario,
      "starts-in-car",
      (await game.getAttribute("data-mode")) === "car",
      await game.getAttribute("data-mode"),
      "car",
    );
    addCheck(
      scenario,
      "cinematic-skipped",
      (await game.getAttribute("data-opening-cinematic")) === "false",
      await game.getAttribute("data-opening-cinematic"),
      "false",
    );
    await inspectCanvas(scenario, page, outDir, "start");
    await capture(scenario, page, outDir, "start");

    await page.keyboard.press("e");
    addCheck(
      scenario,
      "cannot-strand-player",
      (await game.getAttribute("data-mode")) === "car",
      await game.getAttribute("data-mode"),
      "car",
    );

    const startZ = Number(await game.getAttribute("data-player-z"));
    await page.keyboard.down("w");
    await page.waitForFunction(
      (z) =>
        Number(
          document
            .querySelector('[data-testid="afterlight-game"]')
            ?.getAttribute("data-player-z"),
        ) <
        z - 8,
      startZ,
      { timeout: 20_000 },
    );
    addCheck(
      scenario,
      "forward-drive",
      Number(await game.getAttribute("data-player-z")) < startZ - 8,
      Number(await game.getAttribute("data-player-z")),
      `< ${startZ - 8}`,
    );
    await page.getByRole("heading", { name: "Car delivered." }).waitFor({
      state: "visible",
      timeout: 35_000,
    });
    await page.keyboard.up("w");
    addCheck(
      scenario,
      "mission-complete",
      true,
      "Car delivered.",
      "Car delivered.",
    );
    addCheck(
      scenario,
      "payout",
      await page
        .getByRole("dialog", { name: "Car delivered." })
        .getByText("$2,500")
        .isVisible(),
      "$2,500",
      "$2,500",
    );
    await capture(scenario, page, outDir, "complete");
  } catch (error) {
    scenario.passed = false;
    scenario.error =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    addCheck(scenario, "browser-errors", errors.length === 0, errors, []);
    await context.close();
  }
  return scenario;
}

async function mobileScenario(browser, url, outDir) {
  const scenario = {
    checks: [],
    id: "mobile-hot-ride",
    passed: true,
    screenshots: [],
  };
  const context = await browser.newContext({
    deviceScaleFactor: 2.75,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
  const errors = collectErrors(page);
  try {
    const game = await startGame(page, url);
    const controls = page.locator('[aria-label="Touch game controls"]');
    const labels = await controls
      .locator("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label")),
      );
    addCheck(
      scenario,
      "three-touch-controls",
      JSON.stringify(labels) === JSON.stringify(["Move", "Boost", "Brake"]),
      labels,
      ["Move", "Boost", "Brake"],
    );
    const overlapCount = await controls
      .locator("button")
      .evaluateAll((buttons) => {
        const boxes = buttons.map((button) => button.getBoundingClientRect());
        return boxes.flatMap((box, index) =>
          boxes
            .slice(index + 1)
            .filter(
              (other) =>
                box.left < other.right &&
                box.right > other.left &&
                box.top < other.bottom &&
                box.bottom > other.top,
            ),
        ).length;
      });
    addCheck(
      scenario,
      "touch-controls-do-not-overlap",
      overlapCount === 0,
      overlapCount,
      0,
    );
    await inspectCanvas(scenario, page, outDir, "start");
    await capture(scenario, page, outDir, "start");

    const startZ = Number(await game.getAttribute("data-player-z"));
    const move = page.getByRole("button", { name: "Move", exact: true });
    await move.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + 4,
          pointerId: 41,
          pointerType: "touch",
        }),
      );
    });
    await page.waitForFunction(
      (z) =>
        Number(
          document
            .querySelector('[data-testid="afterlight-game"]')
            ?.getAttribute("data-player-z"),
        ) <
        z - 4,
      startZ,
      { timeout: 20_000 },
    );
    await move.evaluate((element) => {
      element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 41,
          pointerType: "touch",
        }),
      );
    });
    addCheck(
      scenario,
      "touch-drive",
      Number(await game.getAttribute("data-player-z")) < startZ - 4,
      Number(await game.getAttribute("data-player-z")),
      `< ${startZ - 4}`,
    );
  } catch (error) {
    scenario.passed = false;
    scenario.error =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await capture(scenario, page, outDir, "failure").catch(() => undefined);
  } finally {
    addCheck(scenario, "browser-errors", errors.length === 0, errors, []);
    await context.close();
  }
  return scenario;
}

function markdownReport(report) {
  const lines = [
    `# Mirage Playtest: ${report.passed ? "PASS" : "FAIL"}`,
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
  const outDir = path.resolve(
    ROOT,
    options.out ?? `.artifacts/playtest/${timestamp()}`,
  );
  await mkdir(outDir, { recursive: true });
  const server = await ensureTarget(options.url);
  const browser = await chromium.launch({ headless: !options.headed });
  const scenarios = [];
  try {
    if (["all", "desktop"].includes(options.scenario)) {
      scenarios.push(await desktopScenario(browser, options.url, outDir));
    }
    if (["all", "mobile"].includes(options.scenario)) {
      scenarios.push(await mobileScenario(browser, options.url, outDir));
    }
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
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
    summary: {
      failed: checks.length - passedChecks,
      passed: passedChecks,
      total: checks.length,
    },
    targetUrl: options.url,
    version: 2,
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
