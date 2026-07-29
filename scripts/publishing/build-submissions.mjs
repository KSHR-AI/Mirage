#!/usr/bin/env node

import { buildValidationPlan } from "./builder.mjs";
import { parseOptions, resolvePathOption, runCli } from "./cli.mjs";
import { DEFAULT_BUILDER_IMAGE } from "./constants.mjs";
import { invariant } from "./errors.mjs";
import { readJson } from "./json.mjs";

await runCli(async () => {
  const options = parseOptions(process.argv.slice(2), {
    plan: { type: "string", required: true },
    "output-dir": { type: "string", required: true },
    "provenance-dir": { type: "string", required: true },
    "source-dir": { type: "string" },
    image: { type: "string", default: DEFAULT_BUILDER_IMAGE },
  });
  const testMode = process.env.MIRAGE_PUBLISH_TEST_MODE === "1";
  invariant(
    !options["source-dir"] || testMode,
    "--source-dir is disabled outside explicit test mode",
  );

  const planPath = resolvePathOption(options.plan);
  const { value: plan } = await readJson(planPath, "build plan");
  const result = await buildValidationPlan({
    plan,
    outputDirectory: resolvePathOption(options["output-dir"]),
    provenanceDirectory: resolvePathOption(options["provenance-dir"]),
    sourceDirectory: options["source-dir"]
      ? resolvePathOption(options["source-dir"])
      : undefined,
    builderImage: options.image,
    testMode,
  });
  process.stdout.write(
    `Built ${result.published.length} artifact(s); staged ${result.removals.removed.length} removal(s)\n`,
  );
});
