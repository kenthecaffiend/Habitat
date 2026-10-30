# Isolated payslip PDF processing

The issued template is `fixed-a4-v8`. Application admission pins the renderer image, font and template identifiers; earlier immutable document bundles remain supported. The separate synthetic preview bundle is retained for its existing tests. Rebuilding an image requires updating and verifying the corresponding pins; do not substitute a mutable tag or rewrite historical PDFs.

The ReportLab renderer consumes bounded presentation JSON from a frozen payroll snapshot. It does not calculate wages or accept user templates, executable expressions or remote asset URLs. Current logos are bounded verified PNGs referenced by the snapshot; later branding changes do not alter issued documents.

The reference processor runs non-root with a read-only filesystem, no network, no host mounts or Docker socket, dropped capabilities, no-new-privileges and bounded CPU/memory/process/output/time limits. See the Dockerfiles, runners and hash-pinned requirements for exact controls. It targets Linux ARM64. The web application does not receive Docker control; a separately restricted renderer performs the work.

PDF bytes, source hash, version and renderer/font/template identity are stored together. Reads verify integrity and ownership. Employee access admits current documents only; administrators retain archived/voided history. Run-level payment recording preserves the payment fact even if generation partially fails, and explicit retry preserves completed artifacts. Voiding a document does not undo payment; replacement creates a new immutable version.

Current service limits include 256KiB per PDF and a configurable aggregate budget for issued PDFs (256MiB by default). Synthetic processing uses a smaller budget. Capacity refusal does not delete old files. Durable unknown processing outcomes remain held until the supported reconciliation/retry path determines the state.

## Verification

```sh
npm test
npm run typecheck
npm run build
HR_TEST_REAL_PDF=1 npx vitest run tests/integration/payslip-pdf.test.ts tests/unit/payslip-template.test.ts
node_modules/node/bin/node node_modules/tsx/dist/cli.mjs ops/payslip-pdf/rehearse.ts
```

Build and verify the exact pinned processors before opt-in rendering checks. The default suite records the real-PDF case skipped. Fictional adapter tests are not evidence that a real renderer ran. After layout changes, inspect every generated page and verify extracted values, ownership, historical reads, retries, rejection and cleanup. Keep generated files in ignored test-results, never in the public source export. These checks do not certify statutory correctness or protection against every host/kernel failure.
