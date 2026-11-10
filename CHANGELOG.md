# Changelog

Changes describe the public source distribution, independently of any privately hosted installation.

## [0.1.0-alpha.1] - 2026-11-10

First tagged developer preview.

### Included

- Single-company Singapore-citizen payroll workflow, saved pay settings, draft review, payment-date bookkeeping and immutable payslip history.
- Employee directory, own-profile access, leave balances/half days/approvals, private claims and receipt-processing reference implementation.
- Responsive light/dark interface, company branding and leave calendar.
- Fictional fixtures, disposable PostgreSQL tests, constrained document processors and source-only deployment references.
- Versioned package metadata, fictional-demo quick start, source CI and security-reporting guidance.

### Fixed

- Removed wall-clock dependence from two pre-existing integration fixtures (future leave and November opening coverage) so release checks remain reproducible after their original fixture dates. No application calculation or service logic changed.

### Preview limitations

No turnkey production installer, verified universal hosting platform, live email, bank/CPF transfers or automatic invitations. Unsupported statutory cases, future-year rule verification, browser/device acceptance and populated disaster recovery require independent evaluation. Real renderer tests are opt-in. Four moderate development-tool-chain dependency advisories are recorded in SECURITY.md. This release is not a payroll compliance certification.

[0.1.0-alpha.1]: https://github.com/kenthecaffiend/Habitat/releases/tag/v0.1.0-alpha.1
