import { describe, expect, it } from "vitest";
import { getHighlights, type HighlightRow } from "./highlights";

const row = (over: Partial<HighlightRow>): HighlightRow => ({
  title: "Run",
  provider: "anthropic",
  entryId: "pair",
  models: "Model",
  harness: "Harness",
  rating: 1500,
  votes: 0,
  rank: 1,
  builtOn: null,
  ...over,
});

const iso = (date: string) => date;

describe("board highlights", () => {
  it("shows nothing for an empty board", () => {
    expect(getHighlights([], 0, iso)).toEqual([]);
  });

  it("names no leader before the first vote", () => {
    const [leader] = getHighlights(
      [row({ entryId: "a" }), row({ entryId: "b" })],
      0,
      iso,
    );
    expect(leader.title).toBe("No leader yet");
    expect(leader.note).toBe(
      "All 2 runs are tied at 1500 until the first vote.",
    );
  });

  it("names the leader and its margin over rank 2", () => {
    const [leader] = getHighlights(
      [
        row({ title: "First", rating: 1574, entryId: "a" }),
        row({ title: "Second", rating: 1532, rank: 2, entryId: "b" }),
      ],
      14,
      iso,
    );
    expect(leader).toMatchObject({
      title: "First",
      note: "1574 rating. 42 points above rank 2.",
    });
  });

  it("reports a tie at the top once votes exist", () => {
    const [leader] = getHighlights(
      [
        row({ rating: 1516, entryId: "a" }),
        row({ rating: 1516, entryId: "b" }),
        row({ rating: 1468, rank: 3, entryId: "c" }),
      ],
      3,
      iso,
    );
    expect(leader).toMatchObject({
      title: "Tied at the top",
      note: "2 runs share 1516.",
    });
  });

  it("picks the newest dated run and skips undated ones", () => {
    const highlights = getHighlights(
      [
        row({ title: "Old", builtOn: "2026-07-30", entryId: "a" }),
        row({ title: "New", builtOn: "2026-11-24", votes: 1, entryId: "b" }),
        row({ title: "Undated", entryId: "c" }),
      ],
      1,
      iso,
    );
    expect(highlights[1]).toMatchObject({
      label: "Newest run",
      title: "New",
      note: "Built 2026-11-24. 1 vote so far.",
    });
  });

  it("names the pair with the most runs only when it stands alone", () => {
    const pair = { entryId: "opus", models: "Opus", harness: "Claude Code" };
    const lone = getHighlights(
      [
        row({ ...pair, rank: 5 }),
        row({ ...pair, rank: 1 }),
        row({ entryId: "other" }),
      ],
      4,
      iso,
    );
    expect(lone.at(-1)).toMatchObject({
      label: "Most runs",
      title: "Opus",
      note: "2 runs in Claude Code, ranked 1 and 5.",
    });

    const tied = getHighlights(
      [row({ ...pair }), row({ ...pair }), row({ entryId: "other" })],
      0,
      iso,
    );
    expect(tied.at(-1)?.note).toBe("2 runs in Claude Code, tied at rank 1.");

    const even = getHighlights(
      [row({ entryId: "a" }), row({ entryId: "b" })],
      4,
      iso,
    );
    expect(even.at(-1)).toMatchObject({ label: "Votes", title: "4 votes" });
  });
});
