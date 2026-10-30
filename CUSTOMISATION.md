# Adapt Habitat to your company

You can adapt Habitat's features and company policies to your own needs. Claude Code or OpenAI Codex are optional coding assistants that can help you inspect the code, propose changes and run checks. They are recommendations, not requirements or guarantees of correct payroll or leave calculations.

## A practical workflow

1. Start from a fork or a separate working copy. Keep company-specific extensions and confidential work in a private repository. A branch of a public repository is still public.
2. Describe one change at a time. Prefer saved company settings and effective dates over hardcoded employee names or IDs. Ask for a short plan and identify what should stay unchanged.
3. Use fictional employees, invoices, receipts and payroll fixtures. Keep credentials, recovery keys and real employee/payroll records out of prompts and public Git. Review the tool's data settings and the context it can access before use.
4. Review the generated diff, authorization checks, validation and migration/rollback effects. Do not accept a change solely because an assistant says it is complete.
5. Run the existing checks, including `npm run typecheck`, `npm test` and the appropriate build/browser/processor tests. Verify payroll and leave behavior against current MOM/CPF requirements and your actual company policy before deploying to live data. Back up the accepted installation and preserve issued history.

Example request:

> Add an administrator-managed meal-claim limit, initially SGD25 per claim, as a configurable company setting. Apply changes to new claims from an effective date. Preserve existing approved/paid claims, private receipt ownership and audit history. Use fictional records, show the proposed approach, and run the relevant existing tests. Do not hardcode employee identities or change payroll/payment behavior.

These are recommended engineering and privacy practices, not additional restrictions on rights granted by the MIT license. Preserve the applicable copyright, license and third-party notices when redistributing code.

## Official tool resources

- [Claude Code documentation](https://code.claude.com/docs/en/overview)
- [OpenAI Codex resources](https://developers.openai.com/learn/codex)

Use the official documentation for current setup and supported environments. Habitat does not require a particular account plan, model or coding assistant.
