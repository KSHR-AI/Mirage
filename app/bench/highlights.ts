import { INITIAL_RATING, K_FACTOR } from "../arena/elo";
import type { ProviderKey } from "./entries";

/** One fact shown above the chart; never a grade. */
export type Highlight = {
  label: string;
  title: string;
  provider: ProviderKey | null;
  note: string;
};

export type HighlightRow = {
  title: string;
  provider: ProviderKey;
  /** The model + harness pair the run belongs to. */
  entryId: string;
  models: string;
  harness: string;
  rating: number;
  votes: number;
  rank: number;
  /** ISO build date, or null when the record gives none. */
  builtOn: string | null;
};

function plural(count: number, noun: string) {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
}

function joinList(items: readonly (string | number)[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function leader(rows: readonly HighlightRow[], totalVotes: number): Highlight {
  const top = Math.max(...rows.map((row) => row.rating));
  const leaders = rows.filter((row) => row.rating === top);
  if (leaders.length > 1) {
    return totalVotes === 0
      ? {
          label: "Leader",
          title: "No leader yet",
          provider: null,
          note: `All ${plural(rows.length, "run")} are tied at ${INITIAL_RATING} until the first vote.`,
        }
      : {
          label: "Leader",
          title: "Tied at the top",
          provider: null,
          note: `${plural(leaders.length, "run")} share ${top}.`,
        };
  }
  const next = Math.max(
    ...rows.filter((row) => row.rating < top).map((row) => row.rating),
  );
  return {
    label: "Leader",
    title: leaders[0].title,
    provider: leaders[0].provider,
    note: Number.isFinite(next)
      ? `${top} rating. ${plural(top - next, "point")} above rank 2.`
      : `${top} rating.`,
  };
}

function newest(
  rows: readonly HighlightRow[],
  formatDate: (date: string) => string,
): Highlight | null {
  const dated = rows.filter((row) => row.builtOn !== null);
  if (dated.length === 0) return null;
  const latest = dated.reduce((a, b) => (b.builtOn! > a.builtOn! ? b : a));
  return {
    label: "Newest run",
    title: latest.title,
    provider: latest.provider,
    note: `Built ${formatDate(latest.builtOn!)}. ${plural(latest.votes, "vote")} so far.`,
  };
}

/** The pair with the most runs, only when one pair clearly has the most. */
function mostRuns(rows: readonly HighlightRow[]): Highlight | null {
  const byEntry = new Map<string, HighlightRow[]>();
  for (const row of rows) {
    byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row]);
  }
  const groups = [...byEntry.values()].sort((a, b) => b.length - a.length);
  const [first, second] = groups;
  if (!first || first.length < 2 || second?.length === first.length) {
    return null;
  }
  const ranks = first.map((row) => row.rank).sort((a, b) => a - b);
  const standing = ranks.every((rank) => rank === ranks[0])
    ? `tied at rank ${ranks[0]}`
    : `ranked ${joinList(ranks)}`;
  return {
    label: "Most runs",
    title: first[0].models,
    provider: first[0].provider,
    note: `${plural(first.length, "run")} in ${first[0].harness}, ${standing}.`,
  };
}

/**
 * Up to three recorded facts about the board: who leads, the newest run, and
 * the pair with the most runs, or the vote count when no pair stands out.
 */
export function getHighlights(
  rows: readonly HighlightRow[],
  totalVotes: number,
  formatDate: (date: string) => string,
): Highlight[] {
  if (rows.length === 0) return [];
  const highlights: Highlight[] = [leader(rows, totalVotes)];
  const latest = newest(rows, formatDate);
  if (latest) highlights.push(latest);
  highlights.push(
    mostRuns(rows) ?? {
      label: "Votes",
      title: plural(totalVotes, "vote"),
      provider: null,
      note: `Each vote moves two ratings by up to ${K_FACTOR} points.`,
    },
  );
  return highlights;
}
