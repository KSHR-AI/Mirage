import { describe, expect, it } from "vitest";
import {
  getPostIntentUrl,
  getRecordPath,
  getShareText,
  getShareUrl,
} from "./share";

const benchmark = {
  id: "night-drive-001",
  track: "benchmark",
  title: "Night Drive",
  model: "example-model",
} as const;

describe("run sharing", () => {
  it("shares the stable play route", () => {
    expect(getShareUrl("https://mirageml.com", benchmark)).toBe(
      "https://mirageml.com/play/night-drive-001",
    );
    expect(getRecordPath(benchmark)).toBe("/?run=night-drive-001");
  });

  it("names the benchmark question only for a benchmark run", () => {
    expect(getShareText(benchmark)).toBe(
      "Can a coding model build GTA in SF? example-model shipped Night Drive. Play it in your browser:",
    );
    expect(getShareText({ ...benchmark, track: "showcase" })).toBe(
      "Night Drive, a showcase by example-model on MirageML Bench. Play it in your browser:",
    );
  });

  it("does not attribute a run to an unrecorded model", () => {
    expect(
      getShareText({ ...benchmark, track: "showcase", model: "unknown" }),
    ).toBe(
      "Night Drive, a showcase on MirageML Bench. Play it in your browser:",
    );
    expect(getShareText({ ...benchmark, model: "unknown" })).not.toContain(
      "unknown",
    );
  });

  it("builds a post intent that carries the text and play URL", () => {
    const intent = new URL(getPostIntentUrl("https://mirageml.com", benchmark));
    expect(intent.origin + intent.pathname).toBe("https://x.com/intent/post");
    expect(intent.searchParams.get("url")).toBe(
      "https://mirageml.com/play/night-drive-001",
    );
    expect(intent.searchParams.get("text")).toBe(getShareText(benchmark));
  });
});
