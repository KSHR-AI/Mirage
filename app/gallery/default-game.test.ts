import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_ID, getDefaultGameId } from "./default-game";

describe("gallery default game", () => {
  it("selects OPUS SANFRAN without changing registry order", () => {
    const games = [{ id: "bayline-heat" }, { id: DEFAULT_GAME_ID }];

    expect(getDefaultGameId(games)).toBe(DEFAULT_GAME_ID);
    expect(games.map((game) => game.id)).toEqual([
      "bayline-heat",
      DEFAULT_GAME_ID,
    ]);
  });

  it("falls back to the first published game when OPUS SANFRAN is absent", () => {
    expect(getDefaultGameId([{ id: "another-run" }])).toBe("another-run");
  });

  it("returns undefined for an empty registry", () => {
    expect(getDefaultGameId([])).toBeUndefined();
  });
});
