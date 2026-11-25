import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractSubmitPrompt } from "./submit-prompt";

/**
 * Reads the copyable prompt from the same file contributors see on GitHub, so
 * the site and the repository cannot drift apart. Returns null when the file
 * is missing or holds no prompt.
 */
export async function loadSubmitPrompt() {
  try {
    return extractSubmitPrompt(
      await readFile(
        path.join(process.cwd(), "submissions", "SUBMIT_PROMPT.md"),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}
