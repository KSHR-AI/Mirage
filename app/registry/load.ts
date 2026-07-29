import { parseRegistryDocument, type PublishedGame } from "./schema";

export const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/KSHR-AI/Mirage/mirage-artifacts/registry.json";

// Keep this synchronized with scripts/publishing/constants.mjs. The publisher
// owns the hard limit; the runtime independently fails closed above it.
export const MAX_REGISTRY_BYTES = 256 * 1024;

type RegistryFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RegistryLoadResult =
  | {
      kind: "ready";
      games: readonly PublishedGame[];
      registryUrl: string;
      message: null;
    }
  | {
      kind: "empty";
      games: readonly [];
      registryUrl: string;
      message: string;
    }
  | {
      kind: "unavailable";
      games: readonly [];
      registryUrl: string | null;
      message: string;
    };

export async function loadPublishedRegistry(options?: {
  registryUrl?: string;
  fetcher?: RegistryFetch;
}): Promise<RegistryLoadResult> {
  let registryUrl: string;
  try {
    registryUrl = resolveRegistryUrl(options?.registryUrl).toString();
  } catch {
    return {
      kind: "unavailable",
      games: [],
      registryUrl: null,
      message:
        "The published-game registry URL is invalid. Mirage is not substituting bundled or cached games.",
    };
  }

  try {
    const response = await (options?.fetcher ?? fetch)(registryUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
    });
    if (response.status !== 200) {
      return {
        kind: "unavailable",
        games: [],
        registryUrl,
        message:
          "The published-game registry is unavailable. Mirage is not substituting bundled or cached games.",
      };
    }

    const document = parseRegistryDocument(
      JSON.parse(await readBoundedText(response, MAX_REGISTRY_BYTES)),
    );
    if (document.games.length === 0) {
      return {
        kind: "empty",
        games: [],
        registryUrl,
        message:
          "The registry is available, but no games have been published yet.",
      };
    }

    return {
      kind: "ready",
      games: document.games,
      registryUrl,
      message: null,
    };
  } catch {
    return {
      kind: "unavailable",
      games: [],
      registryUrl,
      message:
        "The published-game registry could not be verified. Mirage is not substituting bundled or cached games.",
    };
  }
}

export function resolveRegistryUrl(configuredUrl?: string) {
  const raw =
    configuredUrl?.trim() ||
    process.env.MIRAGE_REGISTRY_URL?.trim() ||
    DEFAULT_REGISTRY_URL;
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.pathname.endsWith(".json")
  ) {
    throw new Error("Registry URL must be an uncredentialed HTTPS JSON URL");
  }
  return url;
}

async function readBoundedText(response: Response, maximumBytes: number) {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) {
    throw new Error("Registry response exceeds its byte limit");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new Error("Registry response exceeds its byte limit");
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}
