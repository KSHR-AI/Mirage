import { describe, expect, it, vi } from "vitest";
import { verifySubmissionDeployment } from "./deployment.mjs";
import { makeSubmission } from "./test-helpers.mjs";

const publicLookup = vi.fn(async () => [
  { address: "93.184.216.34", family: 4 },
]);

function successfulFetcher() {
  return vi.fn(async (input) => {
    const url = input.toString();
    if (url.startsWith("https://api.github.com/")) {
      return Response.json({ sha: "1".repeat(40) });
    }
    if (url.endsWith("assets/cover.webp")) {
      return new Response("image", {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    }
    return new Response("<!doctype html><title>Game</title>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

describe("external deployment verification", () => {
  it("verifies the pinned source, playable HTML, and cover", async () => {
    const fetcher = successfulFetcher();
    await expect(
      verifySubmissionDeployment(makeSubmission(), {
        fetcher,
        lookup: publicLookup,
      }),
    ).resolves.toMatchObject({
      deployment: {
        url: "https://example.github.io/night-drive/",
      },
      coverUrl: "https://example.github.io/night-drive/assets/cover.webp",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      name: "redirect",
      response: new Response(null, {
        status: 302,
        headers: { location: "https://elsewhere.example/game/" },
      }),
      message: /must not redirect/,
    },
    {
      name: "non-HTML response",
      response: new Response("download", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
      message: /text\/html/,
    },
    {
      name: "frame denial",
      response: new Response("<!doctype html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
          "x-frame-options": "DENY",
        },
      }),
      message: /X-Frame-Options/,
    },
    {
      name: "restrictive CSP",
      response: new Response("<!doctype html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-security-policy":
            "default-src 'self'; frame-ancestors 'self'",
        },
      }),
      message: /CSP/,
    },
  ])("rejects a $name", async ({ response, message }) => {
    const fetcher = successfulFetcher();
    fetcher.mockImplementationOnce(async () =>
      Response.json({ sha: "1".repeat(40) }),
    );
    fetcher.mockImplementationOnce(async () => response);
    await expect(
      verifySubmissionDeployment(makeSubmission(), {
        fetcher,
        lookup: publicLookup,
      }),
    ).rejects.toThrow(message);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
  ])("rejects deployment hostnames resolving to %s", async (address) => {
    await expect(
      verifySubmissionDeployment(makeSubmission(), {
        fetcher: successfulFetcher(),
        lookup: async () => [
          { address, family: address.includes(":") ? 6 : 4 },
        ],
      }),
    ).rejects.toThrow(/non-public/);
  });
});
