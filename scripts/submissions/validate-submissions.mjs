#!/usr/bin/env node

import { parseOptions, resolvePathOption, runCli } from "./cli.mjs";
import { createValidationPlan } from "./plan.mjs";
import { writeJsonAtomic } from "./json.mjs";

await runCli(async () => {
  const options = parseOptions(process.argv.slice(2), {
    mode: { type: "string", required: true, choices: ["all", "changed"] },
    base: { type: "string" },
    head: { type: "string" },
    output: { type: "string" },
  });

  const plan = await createValidationPlan({
    mode: options.mode,
    base: options.base,
    head: options.head,
  });
  if (options.output) {
    const outputPath = resolvePathOption(options.output);
    await writeJsonAtomic(outputPath, plan);
    process.stdout.write(
      `Validated ${plan.submissions.length} submission(s) and ${plan.removed.length} removal(s); wrote ${outputPath}\n`,
    );
  } else {
    process.stdout.write(
      `Validated ${plan.submissions.length} submission(s) and ${plan.removed.length} removal(s)\n`,
    );
  }
});
