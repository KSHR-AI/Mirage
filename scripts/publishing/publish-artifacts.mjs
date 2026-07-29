#!/usr/bin/env node

import { publishArtifactBranch } from "./branch-publisher.mjs";
import { parseOptions, resolvePathOption, runCli } from "./cli.mjs";

await runCli(async () => {
  const options = parseOptions(process.argv.slice(2), {
    "input-dir": { type: "string", required: true },
    branch: { type: "string", required: true },
    repository: { type: "string", required: true },
    "workflow-artifact-digest": { type: "string", required: true },
    "source-workflow-sha": { type: "string", required: true },
    "disable-vercel-deployments": { type: "boolean", required: true },
  });
  const result = await publishArtifactBranch({
    inputDirectory: resolvePathOption(options["input-dir"]),
    branch: options.branch,
    repository: options.repository,
    workflowArtifactDigest: options["workflow-artifact-digest"],
    sourceWorkflowSha: options["source-workflow-sha"],
    disableVercelDeployments: options["disable-vercel-deployments"],
    token: process.env.GH_TOKEN,
  });
  process.stdout.write(
    `Published ${result.published.length} artifact(s); removed ${result.removed.length} registry record(s); ${result.committed ? `pushed ${result.commit}` : "branch already current"}\n`,
  );
});
