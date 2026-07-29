import { describe, expect, it } from "vitest";
import { MAX_PUBLIC_REGISTRY_BYTES } from "./constants.mjs";
import {
  assertPublicRegistryBytes,
  serializePublicRegistry,
} from "./public-registry.mjs";
import { makeSubmission } from "./test-helpers.mjs";

describe("public registry serialization", () => {
  it("uses the exact runtime projection and maximum artifact placeholders", () => {
    const submission = makeSubmission();
    const { games, bytes } = serializePublicRegistry([{ submission }], {
      placeholderArtifacts: true,
    });

    expect(JSON.parse(bytes).games).toEqual(games);
    expect(games[0]).toMatchObject({
      id: submission.id,
      model: submission.provenance.model,
      builtOn: submission.provenance.builtOn,
      artifact: {
        digest: `sha256:${"f".repeat(64)}`,
        manifestDigest: `sha256:${"f".repeat(64)}`,
        entryPath: "index.html",
        fileCount: 5_000,
        bytes: 100 * 1024 * 1024,
      },
    });
    expect(Object.hasOwn(games[0], "publication")).toBe(false);
  });

  it("accepts exactly 256 KiB and rejects one byte more", () => {
    expect(() =>
      assertPublicRegistryBytes(Buffer.alloc(MAX_PUBLIC_REGISTRY_BYTES)),
    ).not.toThrow();
    expect(() =>
      assertPublicRegistryBytes(Buffer.alloc(MAX_PUBLIC_REGISTRY_BYTES + 1)),
    ).toThrow(`exceeds ${MAX_PUBLIC_REGISTRY_BYTES} bytes`);
  });

  it("reserves response headroom for escaped client-component props", () => {
    const maximumHtmlEscapeExpansion = 6;
    const conservativeFramingCopies = 2;
    const fourMiBResponseBudget = 4 * 1024 * 1024;

    expect(
      MAX_PUBLIC_REGISTRY_BYTES *
        maximumHtmlEscapeExpansion *
        conservativeFramingCopies,
    ).toBeLessThan(fourMiBResponseBudget);
  });
});
