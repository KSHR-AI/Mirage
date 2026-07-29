import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REGISTRY_URL,
  loadPublishedRegistry,
  MAX_REGISTRY_BYTES,
  resolveRegistryUrl,
} from "./load";

describe("runtime registry loading", () => {
  it("uses the Mirage artifact branch by default", () => {
    expect(resolveRegistryUrl("").toString()).toBe(DEFAULT_REGISTRY_URL);
  });

  it("reports a valid empty registry without inventing games", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ schemaVersion: 1, games: [] }),
    );
    const result = await loadPublishedRegistry({
      registryUrl: "https://registry.example/mirage/registry.json",
      fetcher,
    });

    expect(result.kind).toBe("empty");
    expect(result.games).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://registry.example/mirage/registry.json",
      {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
      },
    );
  });

  it("fails closed for invalid configuration and invalid registry JSON", async () => {
    expect(
      await loadPublishedRegistry({
        registryUrl: "http://registry.example/registry.json",
      }),
    ).toMatchObject({ kind: "unavailable", games: [] });

    expect(
      await loadPublishedRegistry({
        registryUrl: "https://registry.example/registry.json",
        fetcher: async () =>
          new Response('{"schemaVersion":2,"games":[]}', { status: 200 }),
      }),
    ).toMatchObject({ kind: "unavailable", games: [] });
  });

  it("fails closed before parsing a registry above the response-safe limit", async () => {
    const result = await loadPublishedRegistry({
      registryUrl: "https://registry.example/mirage/registry.json",
      fetcher: async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-length": String(MAX_REGISTRY_BYTES + 1),
          },
        }),
    });

    expect(result).toMatchObject({ kind: "unavailable", games: [] });
  });
});
