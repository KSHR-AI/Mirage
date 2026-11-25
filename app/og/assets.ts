import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PublishedGame } from "../registry/schema";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_COLORS = {
  bg: "#0a0e0c",
  ink: "#ece5d0",
  softInk: "#cbc5af",
  muted: "#9c9a88",
  rule: "rgba(236, 229, 208, 0.28)",
  lime: "#c9f45a",
  limeInk: "#10160a",
  amber: "#f2b45c",
} as const;

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

// Each path is a literal so the build traces exactly these files.
export async function loadOgFonts() {
  const [display, body, mono] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff",
      ),
    ),
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff",
      ),
    ),
    readFile(
      path.join(
        process.cwd(),
        "node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff",
      ),
    ),
  ]);

  return [
    {
      name: "Barlow Condensed",
      weight: 800 as const,
      style: "normal" as const,
      data: display,
    },
    {
      name: "Inter",
      weight: 500 as const,
      style: "normal" as const,
      data: body,
    },
    {
      name: "JetBrains Mono",
      weight: 500 as const,
      style: "normal" as const,
      data: mono,
    },
  ];
}

export async function loadBenchmarkArt() {
  return toDataUri(
    await readFile(
      path.join(process.cwd(), "app/gallery/mirage-bench-sf-chase.jpg"),
    ),
    "image/jpeg",
  );
}

export async function loadBrandMark() {
  return toDataUri(
    await readFile(path.join(process.cwd(), "app/icon.png")),
    "image/png",
  );
}

const COVER_EXTENSIONS = [".png", ".jpg", ".jpeg"] as const;

/**
 * Returns the run's own cover from Mirage's reviewed copy in
 * `public/showcase-covers`, named for the run ID. A contributor deployment is
 * untrusted and mutable, so a share card never fetches a cover from one.
 */
export async function loadRunCover(game: Pick<PublishedGame, "id">) {
  for (const extension of COVER_EXTENSIONS) {
    try {
      return toDataUri(
        await readFile(
          path.join(
            process.cwd(),
            "public",
            "showcase-covers",
            `${path.basename(game.id)}${extension}`,
          ),
        ),
        IMAGE_TYPES[extension],
      );
    } catch {
      // Try the next extension; a run without a copy uses the benchmark art.
    }
  }
  return null;
}

function toDataUri(bytes: Buffer, type: string) {
  return `data:${type};base64,${bytes.toString("base64")}`;
}
