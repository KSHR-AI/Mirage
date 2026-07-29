# Publishing security

Mirage treats every submission repository, dependency, build script, and
generated file as hostile. A maintainer-approved submission-record merge is the
only human publication decision; credentials never cross into the candidate
build.

## Trust boundaries

| Boundary                     | Authority                                      | May execute candidate code          | May write public state  |
| ---------------------------- | ---------------------------------------------- | ----------------------------------- | ----------------------- |
| Submission pull request      | Read-only repository token; no secrets or OIDC | Only inside the candidate container | No                      |
| Protected-`main` staging job | Read-only repository token; no secrets or OIDC | Only inside the candidate container | No                      |
| Static validator             | Candidate files plus submission data           | No                                  | No                      |
| Artifact publisher           | Repository contents write token                | No                                  | Only `mirage-artifacts` |
| Mirage runtime               | Public registry and static artifact bytes      | Only in an opaque-origin iframe     | No                      |

The workflow never uses `pull_request_target` or `workflow_run`. Only the final
publisher receives `contents: write`; it downloads validated files and
provenance, checks them again, and never installs dependencies, invokes a
package manager, launches Docker, or runs an artifact.

## Candidate build

- Source must be a public `https://github.com/OWNER/REPO` repository pinned by
  an exact lowercase 40-character commit.
- The host performs only the public Git fetch. Candidate package code runs in
  the pinned Node 24 image, as the runner's unprivileged numeric user, with all
  Linux capabilities dropped, `no-new-privileges`, and bounded CPU, memory,
  processes, logs, and time.
- Dependency installation may use the network because package lifecycle scripts
  need it, but that container receives no token, secret, Mirage checkout, user
  home, or production configuration.
- `pnpm run build:mirage` runs in a second container with networking disabled.
  Its only writable inputs are the candidate checkout and dedicated temporary
  directories.
- The fixed command, runtime, package-manager version, output directory, and
  limits come from Mirage; submission JSON cannot supply shell, environment, or
  path values.

Container isolation reduces the blast radius of malicious packages; it is not a
kernel-security proof. Keep the runner image and GitHub-hosted runner current,
and do not move this job onto a credentialed or persistent self-hosted runner.

## Static validation

Only `dist/` crosses the build boundary. Mirage requires `dist/index.html` and
rejects:

- more than 5,000 files, more than 100 MiB total, or any file above 4 MiB;
- symlinks, hardlinks, sockets, devices, FIFOs, executable files, hidden path
  segments, control characters, absolute paths, traversal, or paths escaping
  `dist/`;
- server functions, middleware, deployment configuration, service workers,
  source maps, package metadata, secrets, or unsupported file types;
- root-absolute asset references and service-worker registration in supported
  text files.

Static inspection is not a complete JavaScript behavior proof. The artifact CSP
and iframe sandbox enforce the runtime boundary: they block remote loads, forms,
popups, downloads, top navigation, workers, nested frames, and browser
capabilities outside the player contract.

The validator hashes every file, builds a sorted file manifest, hashes that
manifest, and computes the aggregate artifact digest from normalized paths and
bytes. An existing game ID cannot resolve to a different source commit or
digest. A retry with the same identities is a no-op.

The publisher caps the complete public `registry.json` at 256 KiB so worst-case
HTML escaping and client-prop framing retain deployment response headroom. The artifact
proxy caps each fetched manifest at 8 MiB before parsing or verification.

## Publication and runtime

Validated files live on the generated `mirage-artifacts` branch under:

```text
artifacts/GAME_ID/SOURCE_COMMIT/ARTIFACT_DIGEST/...
manifests/GAME_ID/SOURCE_COMMIT/ARTIFACT_DIGEST.json
registry.json
```

The branch contains a trusted Vercel rule that disables deployments, so storage
updates do not create preview sites. The production application reads
`registry.json` at request time; a successful artifact-branch push therefore
makes the game discoverable without another application deployment.

`mirageml.com/artifacts/...` is a restrictive proxy, not an arbitrary URL
fetcher. It accepts only a game, commit, digest, and file listed by the
validated registry. Before serving a file it verifies the artifact manifest
digest, manifest totals, requested path, expected byte count, and file SHA-256.
Responses use an extension allowlist, immutable caching, `nosniff`, no referrer,
a restrictive Permissions Policy, and CSP sandboxing.

Games run in an iframe with:

```text
sandbox="allow-scripts allow-pointer-lock"
allow="fullscreen; gamepad"
```

The frame omits `allow-same-origin`, forms, popups, downloads, storage access,
and top navigation. Although the proxy URL is on `mirageml.com`, the sandbox
gives the game an opaque origin, so it cannot read Mirage state or send Mirage
cookies as same-origin credentials. CSP blocks workers and nested frames and
limits runtime resources to the immutable artifact route.

Opaque-origin module scripts, WASM, and `fetch` subresources still need CORS to
read public artifact bytes. Artifact responses therefore send
`Access-Control-Allow-Origin: *` and never
`Access-Control-Allow-Credentials`; no request header or Mirage credential is
forwarded to artifact storage.

## Response and rollback

- A failed preflight must remain unmerged.
- A failed protected-`main` publication leaves the game absent and exposes the
  failure on the merge commit; rerunning the workflow is safe.
- Removing a submission record delists its registry entry but retains immutable
  bytes for investigation and rollback.
- Delisting blocks registry-driven discovery and uncached proxy resolution; it
  does not revoke one-year CDN responses or direct public artifact URLs. Use
  private incident coordination for cache purge and quarantine. Do not rewrite
  a digest path in place.
- Changes to workflows, publisher code, submission contracts, proxy code, and
  CODEOWNERS require maintainer review and the publishing-contract check.
