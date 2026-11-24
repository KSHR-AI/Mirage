import type { EvidenceSignal, RegistryStats } from "../registry/evidence";
import { getBoardEvidence, getModelLabel } from "../registry/evidence";
import type { PublishedGame } from "../registry/schema";
import { OG_COLORS as C } from "./assets";

const PADDING = 56;

function Frame({
  backdrop,
  children,
}: {
  backdrop: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        background: C.bg,
        color: C.ink,
        fontFamily: "Inter",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={backdrop}
        width={1200}
        height={630}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "flex",
          width: 1200,
          height: 630,
          background:
            "linear-gradient(90deg, rgba(10,14,12,0.97) 0%, rgba(10,14,12,0.9) 40%, rgba(10,14,12,0.42) 74%, rgba(10,14,12,0.3) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "flex",
          width: 1200,
          height: 630,
          background:
            "linear-gradient(180deg, rgba(10,14,12,0) 52%, rgba(10,14,12,0.9) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: PADDING,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Brand({ mark, aside }: { mark: string; aside?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={mark} width={32} height={36} />
        <div
          style={{
            display: "flex",
            fontFamily: "Barlow Condensed",
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          MirageML Bench
        </div>
        <Chip>GTA in SF</Chip>
      </div>
      {aside}
    </div>
  );
}

function Chip({
  children,
  solid = false,
}: {
  children: React.ReactNode;
  solid?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        border: `2px solid ${solid ? C.lime : C.rule}`,
        borderRadius: 5,
        padding: "7px 12px 6px",
        background: solid ? C.lime : "rgba(10,14,12,0.6)",
        color: solid ? C.limeInk : C.softInk,
        fontFamily: "JetBrains Mono",
        fontSize: 17,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function PlayCallout({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderRadius: 6,
        padding: "16px 24px",
        background: C.lime,
        color: C.limeInk,
        fontFamily: "Barlow Condensed",
        fontSize: 32,
        fontWeight: 800,
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}
    >
      <svg width="22" height="24" viewBox="0 0 22 24">
        <path d="M2 1.5v21L21 12z" fill={C.limeInk} />
      </svg>
      {label}
    </div>
  );
}

function Glyph({ state }: { state: EvidenceSignal["state"] }) {
  if (state === "recorded") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="8" fill={C.lime} />
      </svg>
    );
  }
  if (state === "partial") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path d="M9 1a8 8 0 0 0 0 16z" fill={C.amber} />
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          stroke={C.amber}
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <circle
        cx="9"
        cy="9"
        r="7"
        fill="none"
        stroke={C.muted}
        strokeWidth="2"
        strokeDasharray="3.2 2.6"
      />
    </svg>
  );
}

export function RunCard({
  game,
  backdrop,
  mark,
}: {
  game: PublishedGame;
  backdrop: string;
  mark: string;
}) {
  const titleSize =
    game.title.length <= 12 ? 132 : game.title.length <= 20 ? 104 : 80;

  return (
    <Frame backdrop={backdrop}>
      <Brand
        mark={mark}
        aside={
          <Chip solid={game.track === "benchmark"}>
            {game.track === "benchmark" ? "Benchmark" : "Showcase"}
          </Chip>
        }
      />

      <div
        style={{
          display: "flex",
          maxWidth: 800,
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            color: C.lime,
            fontFamily: "JetBrains Mono",
            fontSize: 24,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {getModelLabel(game)}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontFamily: "Barlow Condensed",
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 0.92,
          }}
        >
          {game.title}
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 700,
            marginTop: 20,
            color: C.softInk,
            fontSize: 26,
            lineHeight: 1.35,
          }}
        >
          {game.tagline}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 32,
        }}
      >
        <div style={{ display: "flex", gap: 30 }}>
          {getBoardEvidence(game).map((signal) => (
            <div
              key={signal.key}
              style={{ display: "flex", flexDirection: "column", gap: 9 }}
            >
              <div
                style={{
                  display: "flex",
                  color: C.muted,
                  fontFamily: "JetBrains Mono",
                  fontSize: 14,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                }}
              >
                {signal.key === "license" ? "License" : signal.label}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  color: signal.state === "missing" ? C.muted : C.ink,
                  fontFamily: "JetBrains Mono",
                  fontSize: 19,
                }}
              >
                <Glyph state={signal.state} />
                {signal.value}
              </div>
            </div>
          ))}
        </div>
        <PlayCallout label="Play it now" />
      </div>
    </Frame>
  );
}

export function SiteCard({
  stats,
  backdrop,
  mark,
}: {
  stats: RegistryStats;
  backdrop: string;
  mark: string;
}) {
  const figures = [
    [stats.runs, stats.runs === 1 ? "Playable run" : "Playable runs"],
    [stats.benchmark, "Benchmark"],
    [stats.showcase, "Showcase"],
    [stats.models, stats.models === 1 ? "Model" : "Models"],
  ] as const;

  return (
    <Frame backdrop={backdrop}>
      <Brand mark={mark} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontFamily: "Barlow Condensed",
          fontSize: 126,
          fontWeight: 800,
          lineHeight: 0.86,
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex" }}>Can coding</div>
        <div style={{ display: "flex" }}>models build</div>
        <div style={{ display: "flex", color: C.lime }}>GTA in SF?</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 32,
        }}
      >
        <div style={{ display: "flex", gap: 40 }}>
          {figures.map(([value, label]) => (
            <div
              key={label}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "Barlow Condensed",
                  fontSize: 58,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  display: "flex",
                  color: C.muted,
                  fontFamily: "JetBrains Mono",
                  fontSize: 14,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
        <PlayCallout label="Play the runs" />
      </div>
    </Frame>
  );
}
