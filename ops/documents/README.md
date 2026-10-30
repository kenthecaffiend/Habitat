# Private file processing

The reference image processor uses a digest-pinned Python/Pillow container. Input bytes are bounded and decoded before a ready private record is committed. Wrong format/signature, corrupt or excessive images, unsupported frames and resource-limit failures are rejected. Originals remain preserved; previews are newly encoded without source metadata. HEIC processing uses the bounded local adapter in the application; no outside conversion service is used.

Receipt uploads support PNG/JPEG/HEIC. Optional medical attachments support PDF/PNG/HEIC. Upload HTTP, storage, ownership and decoder policies are distinct layers; changing one does not bypass another. Logos have their own PNG/JPEG-only limits. Public receipt or medical-file URLs are not supported.

The disposable processor runs non-root, network-disabled, read-only, without host mounts or Docker socket, with dropped capabilities and bounded resources. Inspect the pinned Dockerfile/runner configuration before use. Input refusal and infrastructure/cleanup uncertainty are different outcomes; unknown processing is held rather than reported successful.

## Storage and restart

Private stores live outside the web root beneath a trusted operator-selected parent. Registration records the directory identity, environment and store ID. Files use generated names, exclusive/no-follow writes and restrictive permissions; metadata becomes ready only after durable writes and hash checks. Employee/admin ownership applies to reads and claim linkage.

Startup may reopen only an already registered, identity-verified store. It does not trust or create an unknown directory. Missing/corrupt files are quarantined. Unreferenced generated files can be retained in private orphan quarantine, never silently adopted or deleted. Permission, symlink, hardlink and identity failures remain fail-closed. A process restart test does not establish host power-loss durability.

Reconciliation and explicit retry must preserve transaction and audit state. An uncertain commit or cleanup result is not permission to clear a hold manually. Back up private files and database metadata consistently, and test a populated restore in quarantine.

## Synthetic verification

```sh
npm test
npm run typecheck
docker build --platform linux/arm64 --tag hr-synthetic-preview:dev ops/documents
node_modules/node/bin/node node_modules/tsx/dist/cli.mjs ops/documents/rehearse.ts
node_modules/node/bin/node node_modules/tsx/dist/cli.mjs ops/documents/receipt-rehearsal.ts
```

Verify the built image identity against the runner before real processing. Rehearsals use fictional files and disposable stores only. Keep their output ignored. The limited reference deployment and tests are not a general public-upload service or exhaustive sandbox/malware certification.
