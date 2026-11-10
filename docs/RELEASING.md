# Versions, releases and upgrades

Habitat uses `MAJOR.MINOR.PATCH` with alpha prereleases during early development. The initial public preview is `0.1.0-alpha.1`; repository tags include the `v` prefix. Matching values live in package.json, package-lock.json and release notes. `private: true` deliberately prevents accidental npm publication; it does not make this GitHub repository private.

During alpha, compatibility is not guaranteed. Increment the alpha counter for subsequent previews of the same planned feature set; use a new minor for a new development feature set. Document every data/configuration compatibility change regardless of its version label. Reserve 1.0 for an explicitly defined stable supported contract; it is not legal certification.

## Maintainer release checklist

1. Use a dedicated public-source checkout/branch. Exclude private history, configuration, identities, generated documents, uploads and databases.
2. Synchronise package/lockfile versions, README status and CHANGELOG. Review dependency/asset notices and known issues.
3. From a fresh locked install on Node 24, run typecheck, tests and build. Verify the fictional demo. Record optional renderer/browser checks separately, including skips.
4. Review GitHub Actions results for the exact release commit. CI never deploys the application or changes a live database.
5. Publish the approved commit, create immutable tag `v<version>` and a GitHub **prerelease**, with features, limitations, platform, setup, test evidence and upgrade notes. Never move an existing release tag.
6. Verify the remote tag, release target, prerelease flag and downloadable source archives. Release assets must contain no real data or secrets.

## Operator upgrade checklist

- Install a tagged version, not a moving main branch. Record source commit, database/schema migrations, processor image digests and rule versions separately.
- Read changes and determine exact migrations/configuration changes before upgrading. Back up database and private files consistently; verify a populated restore in quarantine. Keep recovery keys separately.
- Rehearse in isolated UAT with fictional/sanitised data. Validate historical PDF reads, access, supported calculations, storage and restart behaviour.
- Schedule a deliberate release outside an active payroll cycle. Keep the accepted application image and recovery manifest. Rolling back code does not reverse schema migrations or external payment/email effects.
- No generic safe upgrade command is supplied in alpha. Do not run fresh-target provisioners over a populated database. A public GitHub release never automatically updates an existing Habitat server.
