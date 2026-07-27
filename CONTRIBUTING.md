# Contributing to Mirage

Mirage accepts model-built demos, gallery improvements, gameplay work, bug
fixes, and documentation through pull requests. Contributions are licensed
under Apache-2.0.

## Before opening a pull request

1. Search existing issues and pull requests.
2. Fork the repository and branch from the latest `main`.
3. Use Node 24 and pnpm 11.7.0.
4. Install with `pnpm install --frozen-lockfile`.
5. Keep gallery facts in `demos/collection.json` and `demos/entries/`; run
   `pnpm catalog:generate` after changing them.
6. Run `pnpm check`.

Pull requests must explain the user-visible change, validation performed,
licensing for new assets, and any change to the public demo record. Keep
unrelated changes separate. Maintainers may request a playable Vercel preview
before merge.

## Adding a model-built demo

Follow [the demo guide](demos/README.md). A demo needs a unique ID, immutable
source revision, build brief when available, setup record, playable route or
pinned artifact, honest limitations, and asset licensing. Materially new
attempts receive new IDs.

## Reporting problems

Use the structured issue forms for public bugs, proposals, and demo additions.
Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
