import { describe, expect, it } from "vitest";
import generatedCatalog from "./catalog.generated.json";
import {
  DEMO_COLLECTION,
  DEMOS,
  FEATURED_DEMO,
  hasPublishedPrompt,
  hasPublishedSetup,
} from "./catalog";

describe("demo catalog", () => {
  it("discovers demos and promotes the configured feature", () => {
    expect(DEMOS.length).toBeGreaterThan(0);
    expect(FEATURED_DEMO.id).toBe(DEMO_COLLECTION.featuredDemoId);
    expect(DEMOS[0]).toBe(FEATURED_DEMO);
  });

  it("keeps demo identifiers unique", () => {
    const identifiers = DEMOS.map((demo) => demo.id);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it("keeps display and sharing configuration complete", () => {
    expect(DEMO_COLLECTION.brandName).not.toHaveLength(0);
    expect(DEMO_COLLECTION.surfaceLabel).not.toHaveLength(0);
    expect(DEMO_COLLECTION.gameTitle).not.toHaveLength(0);
    expect(DEMO_COLLECTION.locationLabel).not.toHaveLength(0);
    expect(DEMO_COLLECTION.updatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(DEMO_COLLECTION.contribution.guidePath).not.toMatch(/^\//);
    expect(DEMO_COLLECTION.metadata.shareImage.path).toMatch(/^\//);
    expect(DEMO_COLLECTION.metadata.shareImage.width).toBeGreaterThan(0);
    expect(DEMO_COLLECTION.metadata.shareImage.height).toBeGreaterThan(0);

    const latestBuild = DEMOS.reduce(
      (latest, demo) => (demo.builtOn > latest ? demo.builtOn : latest),
      "",
    );
    expect(DEMO_COLLECTION.updatedOn >= latestBuild).toBe(true);
  });

  it("contains no grading fields", () => {
    const source = JSON.stringify(generatedCatalog);
    expect(source).not.toMatch(
      /"(score|scores|progress|percent|rank|ranking|evaluator|judge)"/i,
    );
  });

  it("only embeds local or encrypted public artifacts", () => {
    for (const demo of DEMOS) {
      expect(
        demo.playUrl.startsWith("/") || demo.playUrl.startsWith("https://"),
      ).toBe(true);
      expect(
        demo.previewImage.startsWith("/") ||
          demo.previewImage.startsWith("https://"),
      ).toBe(true);
    }
  });

  it("pins every demo and setup record to the same source commit", () => {
    for (const demo of DEMOS) {
      expect(demo.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(demo.provenance.setup.resultCommit).toBe(demo.commit);
    }
  });

  it("does not claim prompt or setup publication without complete records", () => {
    for (const demo of DEMOS) {
      if (demo.provenance.prompt.status === "published") {
        expect(hasPublishedPrompt(demo)).toBe(true);
      } else {
        expect(hasPublishedPrompt(demo)).toBe(false);
      }

      if (demo.provenance.setup.status === "published") {
        expect(hasPublishedSetup(demo)).toBe(true);
      } else {
        expect(hasPublishedSetup(demo)).toBe(false);
      }
    }
  });
});
