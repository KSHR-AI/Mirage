import { describe, expect, it } from "vitest";
import { loadSubmitPrompt } from "./load-submit-prompt";
import {
  extractSubmitPrompt,
  fillSubmitPrompt,
  normalizePlayUrl,
  PLAY_URL_PLACEHOLDER,
} from "./submit-prompt";

describe("agent submission prompt", () => {
  it("publishes the prompt committed in submissions/SUBMIT_PROMPT.md", async () => {
    const prompt = await loadSubmitPrompt();
    expect(prompt).toContain(`PLAY_URL=${PLAY_URL_PLACEHOLDER}`);
    expect(prompt).toContain("submissions/GAME_ID.json");
    expect(prompt).not.toContain("```");
  });

  it("returns null instead of a prompt without a link placeholder", () => {
    expect(extractSubmitPrompt("```text\nSubmit a game.\n```")).toBeNull();
    expect(extractSubmitPrompt("No fenced prompt.")).toBeNull();
  });

  it("inserts a link that meets the play-URL contract", () => {
    const prompt = `PLAY_URL=${PLAY_URL_PLACEHOLDER}\nPlay it.`;
    expect(fillSubmitPrompt(prompt, "  https://you.github.io/game/ ")).toBe(
      "PLAY_URL=https://you.github.io/game/\nPlay it.",
    );
  });

  it("inserts replacement-pattern characters in a link literally", () => {
    const prompt = `PLAY_URL=${PLAY_URL_PLACEHOLDER}\nPlay it.`;
    for (const link of [
      "https://example.com/$&/",
      "https://example.com/$'/",
      "https://example.com/$1/$$/",
    ]) {
      expect(fillSubmitPrompt(prompt, link), link).toBe(
        `PLAY_URL=${link}\nPlay it.`,
      );
    }
  });

  it("rejects links Mirage cannot accept", () => {
    for (const link of [
      "http://you.github.io/game/",
      "https://user:pass@example.com/",
      "https://example.com/game/?level=2",
      "https://example.com/game/#start",
      "https://localhost/game/",
      "you.github.io/game",
      "javascript:alert(1)",
    ]) {
      expect(normalizePlayUrl(link), link).toBeNull();
    }
  });
});
