"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CaretUpDown,
  Check,
  LinkSimple,
  MagnifyingGlass,
  Play,
  Scales,
  SlidersHorizontal,
  Table,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  INITIAL_RATING,
  ratingRanks,
  ratingSpread,
  type Rating,
} from "../arena/elo";
import { copyText } from "../gallery/clipboard";
import { ProviderMark } from "./ProviderMark";
import {
  BENCH_RUNS,
  HARNESSES,
  PROVIDERS,
  getEntryLabel,
  type BenchRun,
  type ProviderKey,
} from "./entries";
import styles from "./BenchBoard.module.css";

export type RunLink = { id: string; title: string };

export type ArenaStatus = "open" | "off" | "error";

type Ratings = Readonly<Record<string, Rating>>;

type Props = {
  /** Published runs by ID; leaderboard runs missing here are not linked. */
  runs: Readonly<Record<string, RunLink>>;
  /** Arena Elo by run ID. Runs without votes sit at the initial rating. */
  ratings: Ratings;
  totalVotes: number;
  arenaStatus: ArenaStatus;
};

/** One leaderboard row: a run, the pair that built it, and its title. */
type Row = BenchRun & { title: string; published: boolean };

const PROVIDER_KEYS = [
  ...new Set(BENCH_RUNS.map((run) => run.provider)),
] as ProviderKey[];

const ALL_IDS = BENCH_RUNS.map((run) => run.id);

function rowLabel(row: Row) {
  return `${getEntryLabel(row)} · ${row.title}`;
}

function ratingOf(ratings: Ratings, row: Row): Rating {
  return ratings[row.id] ?? { rating: INITIAL_RATING, votes: 0 };
}

/** Runs by Arena Elo, highest first; equal ratings sort by name. */
function rankByElo(ratings: Ratings, rows: readonly Row[]) {
  return [...rows].sort(
    (a, b) =>
      ratingOf(ratings, b).rating - ratingOf(ratings, a).rating ||
      rowLabel(a).localeCompare(rowLabel(b)),
  );
}

export function BenchBoard({ runs, ratings, totalVotes, arenaStatus }: Props) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(ALL_IDS),
  );
  const [providers, setProviders] = useState<ReadonlySet<ProviderKey>>(
    () => new Set(),
  );
  const [harnesses, setHarnesses] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [publicOnly, setPublicOnly] = useState(false);

  const allRows = useMemo<readonly Row[]>(
    () =>
      BENCH_RUNS.map((run) => ({
        ...run,
        title: runs[run.id]?.title ?? run.id,
        published: Boolean(runs[run.id]),
      })),
    [runs],
  );

  const filtered = useMemo(
    () =>
      allRows.filter(
        (entry) =>
          (providers.size === 0 || providers.has(entry.provider)) &&
          (harnesses.size === 0 || harnesses.has(entry.harness)) &&
          (!publicOnly || entry.access === "public-api"),
      ),
    [allRows, providers, harnesses, publicOnly],
  );

  const visible = useMemo(
    () =>
      rankByElo(
        ratings,
        filtered.filter((entry) => selected.has(entry.id)),
      ),
    [filtered, selected, ratings],
  );

  const filterCount = providers.size + harnesses.size + (publicOnly ? 1 : 0);

  const resetFilters = () => {
    setProviders(new Set());
    setHarnesses(new Set());
    setPublicOnly(false);
  };

  return (
    <>
      <section
        className={styles.card}
        id="leaderboard"
        aria-labelledby="index-title"
      >
        <div className={styles.cardHead}>
          <div className={styles.intro}>
            <h1 id="index-title">
              MirageML Bench Leaderboard
              <ArrowUpRight aria-hidden="true" className={styles.titleArrow} />
            </h1>
            <p>
              Each run is a model working inside a coding harness on one task:
              build GTA as a browser game, from an empty repository to a
              deployed build. Runs are ranked by Arena Elo, set only by people{" "}
              <Link href="/arena">playing two runs and voting</Link> for the
              better one.
            </p>
            <p className={styles.seedNote}>
              Every run starts at {INITIAL_RATING}.{" "}
              {arenaStatus === "open"
                ? `${totalVotes.toLocaleString("en-US")} vote${totalVotes === 1 ? "" : "s"} so far.`
                : arenaStatus === "error"
                  ? "The vote store is not responding right now."
                  : "Voting is not open yet."}
            </p>
            <div className={styles.arenaCta}>
              <Link href="/arena" className={styles.arenaButton}>
                <Scales aria-hidden="true" weight="bold" />
                Vote in the Arena
                <ArrowRight aria-hidden="true" weight="bold" />
              </Link>
              <span>Play two anonymous runs, pick the better one.</span>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.iconRow}>
              <CopyLinkButton />
              <a
                className={styles.iconButton}
                href="#table"
                aria-label="Jump to table"
              >
                <Table aria-hidden="true" />
              </a>
            </div>
            <div className={styles.selectorRow}>
              <EntryPicker
                rows={allRows}
                filtered={filtered}
                selected={selected}
                setSelected={setSelected}
              />
              <FilterMenu
                count={filterCount}
                providers={providers}
                setProviders={setProviders}
                harnesses={harnesses}
                setHarnesses={setHarnesses}
                publicOnly={publicOnly}
                setPublicOnly={setPublicOnly}
                reset={resetFilters}
              />
            </div>
          </div>
        </div>

        <div className={styles.legendRow}>
          <span className={styles.legend}>
            <i className={styles.checker} aria-hidden="true" />
            No publicly available API
          </span>
          <span className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" />
            MirageML Bench
          </span>
        </div>

        <BarChart entries={visible} ratings={ratings} />

        <div className={styles.cardFoot}>
          <span>Arena Elo from head-to-head votes</span>
          <span>
            Higher is better · {visible.length} of {allRows.length} runs
          </span>
        </div>

        <ScoreTable entries={visible} ratings={ratings} />
      </section>
    </>
  );
}

function BarChart({
  entries,
  ratings,
}: {
  entries: readonly Row[];
  ratings: Ratings;
}) {
  if (entries.length === 0) {
    return (
      <p className={styles.emptyChart}>
        No runs match. Widen the filters or select more runs.
      </p>
    );
  }

  const values = entries.map((entry) => ratingOf(ratings, entry).rating);
  // Elo has no natural zero, so bars start from a floor below the lowest.
  const floor = Math.floor((Math.min(...values) - 100) / 100) * 100;
  const ceiling = Math.ceil((Math.max(...values) + 50) / 100) * 100;

  return (
    <div className={styles.chartScroll}>
      <div
        className={styles.chart}
        style={{ "--columns": entries.length } as React.CSSProperties}
      >
        <div className={styles.grid} aria-hidden="true">
          {[1, 0.75, 0.5, 0.25].map((line) => (
            <span key={line} style={{ bottom: `${line * 100}%` }} />
          ))}
        </div>
        <ol className={styles.columns} aria-label="Arena Elo by run">
          {entries.map((entry) => {
            const rating = ratingOf(ratings, entry);
            const value = rating.rating;
            const provider = PROVIDERS[entry.provider];
            return (
              <li key={entry.id} className={styles.column}>
                <a
                  href={`#row-${entry.id}`}
                  className={styles.barSlot}
                  aria-label={`${rowLabel(entry)}: ${value} Elo, ${rating.votes} vote${rating.votes === 1 ? "" : "s"}`}
                >
                  <span
                    className={styles.bar}
                    data-access={entry.access}
                    data-long-values
                    style={
                      {
                        "--pct": `${((value - floor) / (ceiling - floor)) * 100}%`,
                        "--bar": provider.color,
                      } as React.CSSProperties
                    }
                  >
                    <span className={styles.barValue}>{value}</span>
                  </span>
                  <span className={styles.tip} role="tooltip">
                    <strong>{entry.title}</strong>
                    <em>{getEntryLabel(entry)}</em>
                    <span className={styles.tipGrid}>
                      <span>Elo</span>
                      <b>
                        {rating.rating} ± {ratingSpread(rating.votes)}
                      </b>
                      <span>Votes</span>
                      <b>{rating.votes}</b>
                    </span>
                  </span>
                </a>
                <span className={styles.logo}>
                  <ProviderMark provider={entry.provider} size={20} />
                </span>
                <span className={styles.labelSlot}>
                  <span className={styles.label}>
                    {entry.model}
                    <br />
                    <span>{entry.harness}</span>
                    <br />
                    <em>{entry.title}</em>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function EntryPicker({
  rows,
  filtered,
  selected,
  setSelected,
}: {
  rows: readonly Row[];
  filtered: readonly Row[];
  selected: ReadonlySet<string>;
  setSelected: (next: ReadonlySet<string>) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [query, setQuery] = useState("");
  const shown = filtered.filter((entry) => selected.has(entry.id)).length;
  const ranked = [...rows].sort((a, b) =>
    rowLabel(a).localeCompare(rowLabel(b)),
  );
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? ranked.filter((entry) => rowLabel(entry).toLowerCase().includes(needle))
    : ranked;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className={styles.popoverHost} ref={ref}>
      <button
        type="button"
        className={styles.selector}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <span>
          {shown} of {rows.length} runs
        </span>
        <CaretUpDown aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label="Choose runs">
          <label className={styles.search}>
            <MagnifyingGlass aria-hidden="true" />
            <input
              type="search"
              placeholder="Search model, harness or run"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.presets}>
            <button type="button" onClick={() => setSelected(new Set(ALL_IDS))}>
              All
            </button>
            <button type="button" onClick={() => setSelected(new Set())}>
              None
            </button>
          </div>
          <ul className={styles.optionList}>
            {matches.map((entry) => (
              <li key={entry.id}>
                <label className={styles.option}>
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggle(entry.id)}
                  />
                  <ProviderMark provider={entry.provider} size={18} />
                  <span>
                    {entry.model}
                    <small>
                      {entry.harness} · {entry.title}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FilterMenu(props: {
  count: number;
  providers: ReadonlySet<ProviderKey>;
  setProviders: (next: ReadonlySet<ProviderKey>) => void;
  harnesses: ReadonlySet<string>;
  setHarnesses: (next: ReadonlySet<string>) => void;
  publicOnly: boolean;
  setPublicOnly: (next: boolean) => void;
  reset: () => void;
}) {
  const { open, setOpen, ref } = usePopover();

  function toggle<T>(
    set: ReadonlySet<T>,
    value: T,
    apply: (next: ReadonlySet<T>) => void,
  ) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  return (
    <div className={styles.popoverHost} ref={ref}>
      <button
        type="button"
        className={styles.iconButton}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={props.count ? `Filters (${props.count} active)` : "Filters"}
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal aria-hidden="true" />
        {props.count ? (
          <span className={styles.badge}>{props.count}</span>
        ) : null}
      </button>
      {open ? (
        <div
          className={`${styles.popover} ${styles.filterPopover}`}
          role="dialog"
          aria-label="Filters"
        >
          <fieldset>
            <legend>Availability</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={props.publicOnly}
                onChange={(event) => props.setPublicOnly(event.target.checked)}
              />
              Publicly available API only
            </label>
          </fieldset>
          <fieldset>
            <legend>Model provider</legend>
            <div className={styles.chips}>
              {PROVIDER_KEYS.map((key) => (
                <label key={key} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={props.providers.has(key)}
                    onChange={() =>
                      toggle(props.providers, key, props.setProviders)
                    }
                  />
                  <ProviderMark provider={key} size={16} />
                  {PROVIDERS[key].name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Harness</legend>
            <div className={styles.chips}>
              {HARNESSES.map((harness) => (
                <label key={harness} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={props.harnesses.has(harness)}
                    onChange={() =>
                      toggle(props.harnesses, harness, props.setHarnesses)
                    }
                  />
                  {harness}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className={styles.reset} onClick={props.reset}>
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={copied ? "Link copied" : "Copy link to leaderboard"}
      onClick={async () => {
        const url = new URL("/#leaderboard", window.location.origin).toString();
        setCopied(await copyText(url));
      }}
    >
      {copied ? (
        <Check aria-hidden="true" />
      ) : (
        <LinkSimple aria-hidden="true" />
      )}
    </button>
  );
}

type SortKey = "elo" | "label" | "votes";

function ScoreTable({
  entries,
  ratings,
}: {
  entries: readonly Row[];
  ratings: Ratings;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "elo",
    dir: "desc",
  });

  const rankById = useMemo(() => ratingRanks(ALL_IDS, ratings), [ratings]);

  const rows = useMemo(() => {
    const value = (entry: Row): number | string => {
      if (sort.key === "label") return rowLabel(entry).toLowerCase();
      if (sort.key === "votes") return ratingOf(ratings, entry).votes;
      return ratingOf(ratings, entry).rating;
    };
    return [...entries].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order = left < right ? -1 : left > right ? 1 : 0;
      return (
        (sort.dir === "asc" ? order : -order) ||
        rowLabel(a).localeCompare(rowLabel(b))
      );
    });
  }, [entries, sort, ratings]);

  const header = (key: SortKey, label: string, title?: string) => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={
          active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
        }
        data-key={key}
      >
        <button
          type="button"
          title={title}
          onClick={() =>
            setSort({
              key,
              dir: active
                ? sort.dir === "asc"
                  ? "desc"
                  : "asc"
                : key === "label"
                  ? "asc"
                  : "desc",
            })
          }
        >
          {label}
          {active ? (
            sort.dir === "asc" ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )
          ) : null}
        </button>
      </th>
    );
  };

  return (
    <div className={styles.tableBlock} id="table">
      <p className={styles.tableNote}>
        Rank is across all {ALL_IDS.length} runs; runs with the same rating
        share a rank. Few votes means a rating can still move a lot.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.rankCell}>
                #
              </th>
              {header("label", "Model · Harness · Run")}
              {header("elo", "Elo", "Arena Elo from head-to-head votes")}
              {header("votes", "Votes")}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} id={`row-${entry.id}`}>
                <td className={styles.rankCell}>{rankById.get(entry.id)}</td>
                <th scope="row" className={styles.nameCell}>
                  <ProviderMark provider={entry.provider} size={20} />
                  <span>
                    {entry.model}
                    <small>
                      {entry.harness}
                      {entry.access === "no-public-api"
                        ? " · No public API"
                        : ""}
                    </small>
                    {entry.published ? (
                      <Link
                        href={`/runs/${entry.id}`}
                        className={styles.runLink}
                      >
                        <Play aria-hidden="true" weight="fill" />
                        {entry.title}
                      </Link>
                    ) : (
                      <small>{entry.title}</small>
                    )}
                  </span>
                </th>
                <td className={styles.num}>
                  <b>{ratingOf(ratings, entry).rating}</b>
                </td>
                <td className={styles.num}>{ratingOf(ratings, entry).votes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
