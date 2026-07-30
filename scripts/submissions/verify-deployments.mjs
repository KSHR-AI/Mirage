#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parseOptions, resolvePathOption, runCli } from "./cli.mjs";
import { validateSubmissionPlan } from "./plan.mjs";
import { verifySubmissionDeployment } from "./deployment.mjs";

await runCli(async () => {
  const options = parseOptions(process.argv.slice(2), {
    plan: { type: "string", required: true },
  });
  const planPath = resolvePathOption(options.plan);
  const plan = validateSubmissionPlan(
    JSON.parse(await readFile(planPath, "utf8")),
  );

  for (const entry of plan.submissions) {
    await verifySubmissionDeployment(entry.submission);
    process.stdout.write(
      `Verified ${entry.submission.id}: ${entry.submission.deployment.url}\n`,
    );
  }
});
