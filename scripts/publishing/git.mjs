import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PublishingError } from "./errors.mjs";

const execFileAsync = promisify(execFile);

const gitEnvironment = { ...process.env };
for (const key of Object.keys(gitEnvironment)) {
  if (key.startsWith("GIT_")) delete gitEnvironment[key];
}
Object.assign(gitEnvironment, {
  GIT_ASKPASS: "/bin/false",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "Never",
});
delete gitEnvironment.GH_TOKEN;
delete gitEnvironment.GITHUB_TOKEN;
const SAFE_GIT_ENV = Object.freeze(gitEnvironment);

export async function runGit(args, options = {}) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: options.cwd,
      encoding:
        options.encoding === "buffer" ? null : (options.encoding ?? "utf8"),
      env: SAFE_GIT_ENV,
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      timeout: options.timeout ?? 2 * 60 * 1000,
    });
    return result.stdout;
  } catch (error) {
    const stderr =
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : Buffer.isBuffer(error.stderr)
          ? error.stderr.toString("utf8").trim()
          : "";
    throw new PublishingError(
      `Git command failed: git ${args.join(" ")}${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

export async function resolveCommit(reference, cwd = process.cwd()) {
  const commit = (
    await runGit(["rev-parse", "--verify", `${reference}^{commit}`], { cwd })
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new PublishingError(
      `Git reference did not resolve to a full SHA: ${reference}`,
    );
  }
  return commit;
}

export async function readGitFile(commit, filePath, cwd = process.cwd()) {
  return runGit(["show", `${commit}:${filePath}`], {
    cwd,
    maxBuffer: 5 * 1024 * 1024,
  });
}
