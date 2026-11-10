# Security policy

## Supported versions

Habitat is a developer preview. Only the latest published alpha is considered for fixes, on a best-effort basis; no response or support-time guarantee is offered. Use fictional data until your installation's controls and supported cases are accepted.

## Report a vulnerability privately

Use GitHub's **Security → Report a vulnerability** on this repository if that option is available. Private vulnerability reporting must be enabled by a repository administrator; this document does not imply it is enabled.

If that option is absent, open an issue saying only that you need a private security contact. Do not describe exploitation details in that issue. Wait for a maintainer to establish a private channel before sending the report. No private contact email has been designated.

Never post credentials, session cookies, database URLs, backups, national identifiers, payslips, receipts or real employee records in public issues, pull requests or logs. Use fictional reproductions, the release version/commit, supported platform and expected versus observed behaviour.

## Current dependency status

The locked install reports **four moderate advisories** in the `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild` development-tool dependency chain ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). They must be assessed before an installation is accepted; passing tests does not dismiss them. Do not run an unreviewed `npm audit fix --force` or assume an alpha release is vulnerability-free. Dependency changes need separate regression and processor/build validation. Run `npm audit` against the exact lockfile for current details.

## Installation responsibilities

Preserve role/owner checks, private file stores, effective rule versions, immutable document history and recovery quarantine. Keep database, files and session secrets isolated by environment. Protect the container host and never expose a Docker socket to the web application. Verify populated restore and independent key custody before real payroll. Security fixes receive a new release/tag; published release tags should not be moved.
