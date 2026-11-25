import { describe, expect, it } from "vitest";
import {
  getPostIntentUrl,
  getRecordPath,
  getShareText,
  getShareUrl,
} from "./share";

const run = {
  id: "night-drive-001",
  title: "Night Drive",
  model: "example-model",
} as const;

describe("run sharing", () => {
  it("shares the stable play route", () => {
    expect(getShareUrl("https://mirageml.com", run)).toBe(
      "https://mirageml.com/play/night-drive-001",
    );
    expect(getRecordPath(run)).toBe("/?run=night-drive-001");
  });

  it("asks the benchmark question for every run", () => {
    expect(getShareText(run)).toBe(
      "Can a coding model build GTA in SF? example-model shipped Night Drive. Play it in your browser:",
    );
  });

  it("does not attribute a run to an unrecorded model", () => {
    expect(getShareText({ ...run, model: "unknown" })).toBe(
      "Can a coding model build GTA in SF? Play Night Drive in your browser:",
    );
  });

  it("builds a post intent that carries the text and play URL", () => {
    const intent = new URL(getPostIntentUrl("https://mirageml.com", run));
    expect(intent.origin + intent.pathname).toBe("https://x.com/intent/post");
    expect(intent.searchParams.get("url")).toBe(
      "https://mirageml.com/play/night-drive-001",
    );
    expect(intent.searchParams.get("text")).toBe(getShareText(run));
  });
});
