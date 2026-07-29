# Security policy

## Supported versions

Security fixes target the current `main` branch and production deployment. An
older game with a security defect may be disabled while its source record is
preserved.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting for
[KSHR-AI/Mirage](https://github.com/KSHR-AI/Mirage/security/advisories/new).
Include affected routes or commits, reproduction steps, impact, and any proposed
mitigation.

Maintainers will acknowledge actionable reports, coordinate remediation, and
credit reporters who want attribution. Do not access other users' data,
degrade the public service, or publish details before a fix is available.

## Dependency-audit exception

`pnpm audit` ignores `GHSA-mh99-v99m-4gvg` only for
`brace-expansion@1.1.16`, which is loaded by ESLint's development-only
`minimatch@3` path against repository-controlled patterns. Forcing the
incompatible patched major breaks ESLint. The compatible `brace-expansion@5`
path is overridden to `5.0.8`; remove the exception when ESLint's dependency
chain publishes a compatible fix.
