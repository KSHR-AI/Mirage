# External deployment security

Mirage never executes, copies, or hosts contributor game code. It stores a
reviewed evidence record and embeds the contributor’s public deployment in a
restricted iframe.

## Trust boundaries

| Surface              | Trusted input                                  | Untrusted input                         |
| -------------------- | ---------------------------------------------- | --------------------------------------- |
| Submission preflight | Validator code on the reviewed Mirage revision | Record fields, DNS, HTTP responses      |
| Mirage application   | Accepted records committed to protected `main` | External cover and game deployment      |
| Game iframe          | Mirage-selected URL and sandbox attributes     | All contributor JavaScript and assets   |
| Contributor hosting  | Nothing                                        | Availability, bytes, headers, redirects |

Accepted records pin public source evidence. They do not make an external
deployment immutable or trustworthy.

## Submission preflight

The preflight job has read-only repository permission and does not execute the
submitted repository. It:

1. validates the exact schema and active lineage graph;
2. confirms the pinned commit through GitHub’s API;
3. accepts only uncredentialed HTTPS deployment URLs without a custom port,
   query, or fragment;
4. resolves deployment DNS and rejects IP literals and non-public addresses;
5. fetches with redirects disabled and a bounded timeout;
6. requires HTTP 200 HTML for the play URL and an image response for the cover;
7. rejects `X-Frame-Options: DENY` and `SAMEORIGIN`; and
8. rejects CSP `frame-ancestors` that does not permit `https://mirageml.com`.

The verifier sends its GitHub token only to `api.github.com`. External
deployment requests contain no Mirage credential.

DNS validation before a separate HTTP connection does not fully prevent a
malicious hostname from rebinding between resolution and fetch. The job carries
no production secret, write permission, or OIDC capability, but the validator
should eventually bind requests to verified addresses or run external checks in
a more isolated network.

## Runtime isolation

Mirage frames a game with:

```text
sandbox="allow-scripts allow-pointer-lock"
allow="fullscreen; gamepad"
referrerpolicy="no-referrer"
```

The iframe does not receive same-origin, forms, popups, downloads, storage
access, or top-navigation privileges. Without `allow-same-origin`, its document
receives an opaque origin even when the external host would otherwise be a
normal web origin.

Sandboxing limits browser capabilities; it does not prove that the game is
benign. A game can still consume CPU or GPU, make permitted network requests,
and observe traffic reaching its own host. Mirage should keep the iframe
separate from accounts, private data, credentials, and privileged application
state.

## Mutability and availability

The source commit is immutable; the contributor’s deployment is not. The host
owner can alter or remove bytes after review, a provider can suspend the site,
and DNS ownership can change.

Mitigations are:

- explicit “externally hosted” language;
- scheduled source, deployment, cover, and framing checks;
- sandboxed playback;
- a deployment-only relocation path that re-runs preflight;
- maintainer review for delisting; and
- immutable source and provenance evidence even when playback disappears.

Mirage must not describe an external deployment as archived, content-addressed,
or reproducible unless a separate mechanism establishes that fact.
