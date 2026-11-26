"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CaretUpDown,
  Check,
  LinkSimple,
  MagnifyingGlass,
  Play,
  SlidersHorizontal,
  Table,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  isProvisional,
  PROVISIONAL_VOTES,
  ratingSpread,
  type Rating,
} from "../arena/elo";
import { copyText } from "../gallery/clipboard";
import { ProviderMark } from "./ProviderMark";
import {
  ENTRIES,
  HARNESSES,
  INDEX_VERSION,
  METRICS,
  PROVIDERS,
  getEntryLabel,
  getScore,
  getScoreLabel,
  rankEntries,
  type Entry,
  type ProviderKey,
  type ScoreKey,
} from "./scores";
import styles from "./BenchBoard.module.css";

export type RunLink = { id: string; title: string };

export type ArenaStatus = "open" | "off" | "error";

type Ratings = Readonly<Record<string, Rating>>;

type Props = {
  /** Published runs by ID; scored runs missing here are not linked. */
  runs: Readonly<Record<string, RunLink>>;
  /** Arena Elo by entry ID. Entries without votes carry their seed. */
  ratings: Ratings;
  totalVotes: number;
  arenaStatus: ArenaStatus;
};

/** What the chart and table can rank by: Arena Elo or a seed score. */
type BoardKey = "elo" | ScoreKey;

const SCORE_TABS: readonly { key: BoardKey; label: string }[] = [
  { key: "elo", label: "Arena Elo" },
  { key: "index", label: "Seed index" },
  ...METRICS.map((metric) => ({ key: metric.key, label: metric.label })),
];

const PROVIDER_KEYS = [
  ...new Set(ENTRIES.map((entry) => entry.provider)),
] as ProviderKey[];

const ALL_IDS = ENTRIES.map((entry) => entry.id);

function ratingOf(ratings: Ratings, entry: Entry): Rating {
  return ratings[entry.id] ?? { rating: 0, votes: 0, seed: 0 };
}

function boardValue(ratings: Ratings, entry: Entry, key: BoardKey) {
  return key === "elo" ? ratingOf(ratings, entry).rating : getScore(entry, key);
}

function boardLabel(key: BoardKey) {
  return key === "elo" ? "Arena Elo" : getScoreLabel(key);
}

/** Entries ranked by `key`, highest first; ties fall back to the seed index. */
function rankBy(ratings: Ratings, entries: readonly Entry[], key: BoardKey) {
  return [...entries].sort(
    (a, b) =>
      boardValue(ratings, b, key) - boardValue(ratings, a, key) ||
      b.index - a.index,
  );
}

export function BenchBoard({ runs, ratings, totalVotes, arenaStatus }: Props) {
  const [metric, setMetric] = useState<BoardKey>("elo");
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

  const filtered = useMemo(
    () =>
      ENTRIES.filter(
        (entry) =>
          (providers.size === 0 || providers.has(entry.provider)) &&
          (harnesses.size === 0 || harnesses.has(entry.harness)) &&
          (!publicOnly || entry.access === "public-api"),
      ),
    [providers, harnesses, publicOnly],
  );

  const visible = useMemo(
    () =>
      rankBy(
        ratings,
        filtered.filter((entry) => selected.has(entry.id)),
        metric,
      ),
    [filtered, selected, metric, ratings],
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
              Each entry is a model running inside a coding harness on one task:
              build GTA in San Francisco as a browser game, from an empty
              repository to a deployed build. Pairs are ranked by Arena Elo, set
              by people <Link href="/arena">playing two runs and voting</Link>{" "}
              for the better one.
            </p>
            <p className={styles.seedNote}>
              Ratings start from maintainer seed scores (Index {INDEX_VERSION}:{" "}
              {METRICS.map((m) => m.label).join(", ")}) and move with every
              vote.{" "}
              {arenaStatus === "open"
                ? `${totalVotes.toLocaleString("en-US")} vote${totalVotes === 1 ? "" : "s"} so far.`
                : arenaStatus === "error"
                  ? "The vote store is not responding, so seed ratings are shown."
                  : "Voting is not open yet, so every rating is still its seed."}
            </p>
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

        <div className={styles.tabs} role="tablist" aria-label="Score shown">
          {SCORE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={metric === tab.key}
              className={styles.tab}
              onClick={() => setMetric(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.legendRow}>
          <span className={styles.legend}>
            <i className={styles.checker} aria-hidden="true" />
            No publicly available API
          </span>
          {metric === "elo" ? (
            <span className={styles.legend}>
              <i className={styles.provisionalSwatch} aria-hidden="true" />
              Provisional: fewer than {PROVISIONAL_VOTES} votes
            </span>
          ) : null}
          <span className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" />
            MirageML Bench
          </span>
        </div>

        <BarChart entries={visible} metric={metric} ratings={ratings} />

        <div className={styles.cardFoot}>
          <span>
            {metric === "elo"
              ? "Arena Elo: head-to-head votes, starting from seed scores"
              : `${getScoreLabel(metric)} (maintainer seed score)`}
          </span>
          <span>
            Higher is better · {visible.length} of {ENTRIES.length} model +
            harness pairs
          </span>
        </div>
      </section>

      <ScoreTable entries={visible} runs={runs} ratings={ratings} />
    </>
  );
}

function BarChart({
  entries,
  metric,
  ratings,
}: {
  entries: readonly Entry[];
  metric: BoardKey;
  ratings: Ratings;
}) {
  if (entries.length === 0) {
    return (
      <p className={styles.emptyChart}>
        No entries match. Widen the filters or select more entries.
      </p>
    );
  }

  const values = entries.map((entry) => boardValue(ratings, entry, metric));
  const top = Math.max(...values);
  // Elo has no natural zero, so its bars start from a floor below the lowest.
  const floor =
    metric === "elo" ? Math.floor((Math.min(...values) - 100) / 100) * 100 : 0;
  const ceiling =
    metric === "elo"
      ? Math.ceil((top + 50) / 100) * 100
      : Math.max(20, Math.ceil((top * 1.12) / 10) * 10);

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
        <ol
          className={styles.columns}
          aria-label={`${boardLabel(metric)} by model and harness`}
        >
          {entries.map((entry) => {
            const value = boardValue(ratings, entry, metric);
            const rating = ratingOf(ratings, entry);
            const provisional = metric === "elo" && isProvisional(rating);
            const provider = PROVIDERS[entry.provider];
            return (
              <li key={entry.id} className={styles.column}>
                <a
                  href={`#row-${entry.id}`}
                  className={styles.barSlot}
                  aria-label={`${getEntryLabel(entry)}: ${value}${provisional ? " (provisional)" : ""}`}
                >
                  <span
                    className={styles.bar}
                    data-access={entry.access}
                    data-provisional={provisional || undefined}
                    data-long-values={metric === "elo" || undefined}
                    style={
                      {
                        height: `${((value - floor) / (ceiling - floor)) * 100}%`,
                        "--bar": provider.color,
                      } as React.CSSProperties
                    }
                  >
                    <span className={styles.barValue}>{value}</span>
                  </span>
                  <span className={styles.tip} role="tooltip">
                    <strong>{entry.model}</strong>
                    <em>{entry.harness}</em>
                    <span className={styles.tipGrid}>
                      <span>Elo</span>
                      <b>
                        {rating.rating} ± {ratingSpread(rating.votes)}
                      </b>
                      <span>Votes</span>
                      <b>{rating.votes}</b>
                      <span>Seed index</span>
                      <b>{entry.index}</b>
                      {METRICS.map((m) => (
                        <span key={m.key} className={styles.tipPair}>
                          <span>{m.short}</span>
                          <b>{entry.scores[m.key]}</b>
                        </span>
                      ))}
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
  filtered,
  selected,
  setSelected,
}: {
  filtered: readonly Entry[];
  selected: ReadonlySet<string>;
  setSelected: (next: ReadonlySet<string>) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [query, setQuery] = useState("");
  const shown = filtered.filter((entry) => selected.has(entry.id)).length;
  const ranked = rankEntries(ENTRIES);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? ranked.filter((entry) =>
        getEntryLabel(entry).toLowerCase().includes(needle),
      )
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
          {shown} of {ENTRIES.length} pairs
        </span>
        <CaretUpDown aria-hidden="true" />
      </button>
      {open ? (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="Choose entries"
        >
          <label className={styles.search}>
            <MagnifyingGlass aria-hidden="true" />
            <input
              type="search"
              placeholder="Search model or harness"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.presets}>
            <button type="button" onClick={() => setSelected(new Set(ALL_IDS))}>
              All
            </button>
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(ranked.slice(0, 10).map((e) => e.id)))
              }
            >
              Top 10
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
                    <small>{entry.harness}</small>
                  </span>
                  <b>{entry.index}</b>
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

type SortKey = BoardKey | "label" | "votes" | "trials" | "buildHours";

function ScoreTable({
  entries,
  runs,
  ratings,
}: {
  entries: readonly Entry[];
  runs: Readonly<Record<string, RunLink>>;
  ratings: Ratings;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "elo",
    dir: "desc",
  });

  const rankById = useMemo(() => {
    const ranks = new Map<string, number>();
    rankBy(ratings, ENTRIES, "elo").forEach((entry, i) =>
      ranks.set(entry.id, i + 1),
    );
    return ranks;
  }, [ratings]);

  const rows = useMemo(() => {
    const value = (entry: Entry): number | string => {
      if (sort.key === "label") return getEntryLabel(entry).toLowerCase();
      if (sort.key === "trials") return entry.trials;
      if (sort.key === "buildHours") return entry.buildHours;
      if (sort.key === "votes") return ratingOf(ratings, entry).votes;
      return boardValue(ratings, entry, sort.key);
    };
    return [...entries].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order = left < right ? -1 : left > right ? 1 : 0;
      return sort.dir === "asc" ? order : -order;
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
    <section className={styles.card} id="table" aria-labelledby="table-title">
      <div className={styles.tableHead}>
        <h2 id="table-title">Model + harness comparison</h2>
        <p>
          Every pair the chart shows. Rank is by Arena Elo across all{" "}
          {ENTRIES.length} pairs; ± narrows as votes come in. The index and
          evaluation columns are maintainer seed scores. Select a column to
          sort.
        </p>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.rankCell}>
                #
              </th>
              {header("label", "Model · Harness")}
              {header("elo", "Elo", "Arena Elo from head-to-head votes")}
              {header("votes", "Votes")}
              {header("index", "Seed", "Maintainer seed index")}
              {METRICS.map((m) => header(m.key, m.short, m.label))}
              {header("trials", "Trials")}
              {header(
                "buildHours",
                "Build",
                "Median hours from empty repository to deployed game",
              )}
              <th scope="col">Runs</th>
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
                  </span>
                </th>
                <td className={styles.eloCell}>
                  <b>{ratingOf(ratings, entry).rating}</b>
                  <small>
                    ± {ratingSpread(ratingOf(ratings, entry).votes)}
                  </small>
                  {isProvisional(ratingOf(ratings, entry)) ? (
                    <span className={styles.provisionalTag}>Provisional</span>
                  ) : null}
                </td>
                <td className={styles.num}>{ratingOf(ratings, entry).votes}</td>
                <td className={styles.indexCell}>
                  <span
                    className={styles.inlineBar}
                    style={
                      {
                        "--w": `${entry.index}%`,
                        "--bar": PROVIDERS[entry.provider].color,
                      } as React.CSSProperties
                    }
                  />
                  <b>{entry.index}</b>
                </td>
                {METRICS.map((m) => (
                  <td key={m.key} className={styles.num}>
                    {entry.scores[m.key]}
                  </td>
                ))}
                <td className={styles.num}>{entry.trials}</td>
                <td className={styles.num}>
                  {entry.buildHours > 0
                    ? `${entry.buildHours.toFixed(1)} h`
                    : "—"}
                </td>
                <td className={styles.runsCell}>
                  {entry.runIds.filter((id) => runs[id]).length === 0
                    ? "—"
                    : entry.runIds
                        .filter((id) => runs[id])
                        .map((id) => (
                          <Link key={id} href={`/runs/${id}`}>
                            <Play aria-hidden="true" weight="fill" />
                            {runs[id].title}
                          </Link>
                        ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
