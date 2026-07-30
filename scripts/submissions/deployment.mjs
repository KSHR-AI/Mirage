import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { invariant } from "./errors.mjs";

const REQUEST_TIMEOUT_MS = 15_000;

export async function verifySubmissionDeployment(
  submission,
  { fetcher = fetch, lookup = dnsLookup } = {},
) {
  await verifySourceCommit(submission.source, fetcher);

  const playUrl = new URL(submission.deployment.url);
  await assertPublicHostname(playUrl.hostname, lookup);
  const page = await request(playUrl, fetcher, {
    accept: "text/html,application/xhtml+xml",
  });
  invariant(
    page.status === 200,
    `Deployment returned HTTP ${page.status}: ${playUrl}`,
  );
  const contentType = page.headers.get("content-type")?.toLowerCase() ?? "";
  invariant(
    contentType.startsWith("text/html"),
    `Deployment must return text/html: ${playUrl}`,
  );
  assertFrameable(page.headers, playUrl);
  await page.body?.cancel();

  const coverUrl = new URL(
    submission.presentation.coverPath,
    submission.deployment.url,
  );
  invariant(
    coverUrl.origin === playUrl.origin,
    "Cover image must use the deployment origin",
  );
  await assertPublicHostname(coverUrl.hostname, lookup);
  const cover = await request(coverUrl, fetcher, { accept: "image/*" });
  invariant(
    cover.status === 200,
    `Cover image returned HTTP ${cover.status}: ${coverUrl}`,
  );
  invariant(
    (cover.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("image/"),
    `Cover path must return an image content type: ${coverUrl}`,
  );
  await cover.body?.cancel();

  return Object.freeze({
    source: submission.source,
    deployment: submission.deployment,
    coverUrl: coverUrl.toString(),
  });
}

async function verifySourceCommit(source, fetcher) {
  const repository = new URL(source.repositoryUrl);
  const [owner, name] = repository.pathname.slice(1).split("/");
  const commitUrl = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${source.commit}`,
    "https://api.github.com",
  );
  const authorization = process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {};
  const response = await request(commitUrl, fetcher, {
    accept: "application/vnd.github+json",
    "user-agent": "MirageML-Bench-submission-verifier",
    ...authorization,
  });
  invariant(
    response.status === 200,
    `GitHub could not verify ${source.repositoryUrl}@${source.commit}`,
  );
  await response.body?.cancel();
}

async function request(url, fetcher, headers) {
  const response = await fetcher(url, {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  invariant(
    !isRedirect(response.status),
    `Submitted URLs must not redirect: ${url}`,
  );
  return response;
}

function assertFrameable(headers, url) {
  const xFrameOptions = headers.get("x-frame-options")?.toLowerCase() ?? "";
  invariant(
    !/(?:^|,)\s*(?:deny|sameorigin)\s*(?:,|$)/.test(xFrameOptions),
    `Deployment blocks iframe playback with X-Frame-Options: ${url}`,
  );

  const policy = headers.get("content-security-policy");
  if (!policy) return;
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors "));
  if (!directive) return;
  const sources = directive.split(/\s+/).slice(1);
  invariant(
    sources.includes("*") ||
      sources.includes("https://mirageml.com") ||
      sources.includes("https://*.mirageml.com"),
    `Deployment CSP does not allow mirageml.com to frame it: ${url}`,
  );
}

async function assertPublicHostname(hostname, lookup) {
  invariant(
    isIP(hostname) === 0,
    `Deployment hostname cannot be an IP address`,
  );
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  invariant(addresses.length > 0, `Deployment hostname did not resolve`);
  for (const { address } of addresses) {
    invariant(
      isPublicAddress(address),
      `Deployment hostname resolves to a non-public address`,
    );
  }
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b, c] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

function isRedirect(status) {
  return status >= 300 && status < 400;
}
