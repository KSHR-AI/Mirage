import type { RegistryStats } from "../registry/evidence";
import { getRunModelsLabel } from "../bench/entries";
import type { PublishedGame } from "../registry/schema";
import { OG_COLORS as C } from "./assets";

const PADDING = 56;
const SITE_HOST = "mirageml.com";

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
            "linear-gradient(90deg, rgba(10,14,12,0.96) 0%, rgba(10,14,12,0.86) 36%, rgba(10,14,12,0.3) 70%, rgba(10,14,12,0.12) 100%)",
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

function Brand({ mark }: { mark: string }) {
  return (
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
      <Chip>Solve GTA</Chip>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        border: `2px solid ${C.rule}`,
        borderRadius: 5,
        padding: "7px 12px 6px",
        background: "rgba(10,14,12,0.6)",
        color: C.softInk,
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

/**
 * Frames the cover as a screenshot beside the text, so a cover that carries
 * its own title or interface never collides with the card's words.
 */
export function RunCard({
  game,
  cover,
  mark,
}: {
  game: PublishedGame;
  cover: string;
  mark: string;
}) {
  const titleSize =
    game.title.length <= 12 ? 104 : game.title.length <= 20 ? 86 : 66;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: PADDING,
        background: `linear-gradient(140deg, #1b2414 0%, ${C.bg} 46%)`,
        color: C.ink,
        fontFamily: "Inter",
      }}
    >
      <Brand mark={mark} />

      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        <div
          style={{
            display: "flex",
            width: 468,
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              color: C.lime,
              fontFamily: "JetBrains Mono",
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {getRunModelsLabel(game)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
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
              marginTop: 18,
              color: C.softInk,
              fontSize: 23,
              lineHeight: 1.36,
            }}
          >
            {game.tagline}
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img
          src={cover}
          width={576}
          height={324}
          style={{
            width: 576,
            height: 324,
            border: `2px solid ${C.rule}`,
            borderRadius: 10,
            objectFit: "cover",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
        }}
      >
        <div
          style={{
            display: "flex",
            color: C.softInk,
            fontFamily: "JetBrains Mono",
            fontSize: 22,
            letterSpacing: 0.5,
          }}
        >
          {`${SITE_HOST}/play/${game.id}`}
        </div>
        <PlayCallout label="Play it now" />
      </div>
    </div>
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
          fontSize: 148,
          fontWeight: 800,
          lineHeight: 0.86,
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex" }}>Can an LLM</div>
        <div style={{ display: "flex" }}>
          solve&nbsp;<span style={{ color: C.lime }}>GTA?</span>
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
