# Try Habitat with fictional data

This guide targets a developer on an Apple-silicon Mac with Node.js 24.x, npm and Git. It creates a disposable loopback-only demo, separate from any existing Habitat installation. Do not use real employee records. Linux CI tests source/build only; document processing uses the separately configured ARM64 processors. Windows and other installation targets are not verified by this guide.

## 1. Get the preview

```sh
git clone --branch v0.1.0-alpha.1 https://github.com/kenthecaffiend/Habitat.git
cd Habitat
node --version  # must be v24.x
npm ci
npm run typecheck
npm test
npm run build
npm run demo
```

Run commands from the repository root as an ordinary user, not root. The tag becomes available with this release. Before publication, use the release commit instead. `npm ci` uses the lockfile and runs dependency lifecycle scripts, including installation of the pinned local Node runtime; do not substitute `--ignore-scripts` and assume the same setup is verified. No global runtime installation is performed by this project.

## 2. Open and sign in

The last startup JSON reports `LOCAL_SYNTHETIC_DEMO_STARTED`, an `origin` such as `http://127.0.0.1:<port>`, and a `statePath`. Open that exact origin in your browser. Ports are allocated dynamically; do not assume 3130 or a previous demo URL.

Open the local `statePath` file in a text editor to read the fictional administrator and employee login details. It contains credentials: keep it local and never paste or commit it. The demo has two fictional accounts: administrator and employee and fictional payroll/leave setup. It does not connect to your existing company database. No `.env` file, external database, SMTP account, Tailscale setup or application bootstrap is needed for this temporary demo.

Inspect the employee directory, employee/admin navigation, leave and payroll pages. Processor-dependent actions require separate setup; a disabled or unavailable receipt/PDF action does not imply these services were installed by the demo. The historical scripted walkthrough `ops/demo/verify.ts` is not the supported quick-start command and may reflect earlier UI contracts.

## 3. Stop or restart

Keep the terminal open. Press Ctrl-C in that terminal to stop the web process and disposable PostgreSQL server. A new `npm run demo` creates fresh fictional state; it is not a recovery or persistent-hosting command. Temporary demo/session files may remain under the system temp directory. Remove only your own demo directories after processes stop and after confirming you no longer need them.

## Files and PDFs

The demo launch does not build or install document processors. For real synthetic PNG/JPEG/PDF tests, read [private file processing](../ops/documents/README.md) and [PDF processing](../ops/payslip-pdf/README.md), build the exact required images, and verify their digests. Docker access can run containers; use only your isolated development host and fictional fixtures. HEIC, storage registration and issued-document modes have additional policy gates; do not weaken those gates to make a demo button work.

## Troubleshooting

- **Node version error:** use Node 24 before installing. `npm run` resolves the repository's pinned Node binary after a successful install.
- **PostgreSQL permission/startup error:** run as your normal user, allow a writable system temp directory and loopback sockets, and stop at the specific error. Do not point tests at a real database.
- **Missing native executable after install:** do not copy binaries from another installation; reinstall from the lockfile with lifecycle scripts enabled and inspect npm's errors.
- **Browser cannot connect:** use the printed current URL and keep the launcher terminal open.
- **PDF/upload unavailable:** follow the processor guides; the basic demo is not proof of renderer or storage acceptance.

For real-company installation, use the [owner guide](../SME-GUIDE.md) and a technical operator. Database/file isolation, account creation, current rule validation, migration reconciliation and populated recovery must be accepted separately.
