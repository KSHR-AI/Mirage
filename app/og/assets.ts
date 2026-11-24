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

/**
 * Returns a cover only when Mirage hosts it. A contributor deployment is
 * untrusted, so the server never fetches a cover from one.
 */
export async function loadMirageHostedCover(game: PublishedGame) {
  const coverPath = game.presentation.coverPath;
  if (!coverPath?.startsWith("/showcase-covers/")) return null;

  const name = path.basename(coverPath);
  const type = IMAGE_TYPES[path.extname(name).toLowerCase()];
  if (!type) return null;

  try {
    return toDataUri(
      await readFile(
        path.join(process.cwd(), "public", "showcase-covers", name),
      ),
      type,
    );
  } catch {
    return null;
  }
}

function toDataUri(bytes: Buffer, type: string) {
  return `data:${type};base64,${bytes.toString("base64")}`;
}
