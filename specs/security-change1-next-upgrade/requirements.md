# Requirements — Security CHANGE 1: upgrade next to ^16.4.4 and fix remaining npm advisories

## Functional Requirements

### A. Release notes gate
FR-01: The system shall read the official Next.js 16.4 release notes or upgrade guide before any dependency is changed.
FR-02: The system shall list every 16.4 change relevant to `middleware.ts`, Server Actions, `next.config.js`, `next/image` defaults and the App Router in `.tmp/security-change1-report.md`.
FR-03: If a relevant change requires a source, config or workflow edit, the system shall stop before editing any file and report the change.
FR-04: If the release notes cannot be read, the system shall stop and report that, instead of assuming no breaking changes.

### B. Dependency changes
FR-05: The system shall set `next` in `package.json` to `^16.4.4`.
FR-06: The system shall update `package-lock.json` so the resolved `next` version is 16.4.4 or the newest 16.4.x the registry allows.
FR-07: The system shall run `npm audit fix` without `--force` after the `next` bump.
FR-08: If an audit fix needs `--force` or a major version bump, the system shall not apply it.
FR-09: The system shall list each advisory it did not fix, with the reason, in the report.
FR-10: The system shall leave every other field of `package.json` unchanged except where `npm audit fix` itself changes it.

### C. Lockfile diff
FR-11: The system shall list every package whose resolved version changed (old -> new) in the report.
FR-12: The system shall flag each major-version change in that list.
FR-13: If a major bump other than those named in the request appears, the system shall stop and report it before continuing.

### D. Verification
FR-14: The system shall confirm `npm ci` succeeds from the new lockfile.
FR-15: The system shall confirm `npx tsc --noEmit` passes.
FR-16: The system shall confirm the full `npx vitest run` suite passes.
FR-17: The system shall confirm `npm run build` passes.
FR-18: The system shall confirm ESLint passes with no new errors.
FR-19: If any check fails, the system shall report the failure with its output and shall not edit source code to fix it.

### E. Audit comparison
FR-20: The system shall run `npm audit` and `npm audit --omit=dev` after the change.
FR-21: The system shall report before/after counts per severity for both commands, against the baseline of 1 critical, 4 high, 19 moderate, 1 low (full) and 1 critical, 3 high, 1 moderate (prod-only).
FR-22: The system shall state whether the critical advisory is gone.

### F. Report
FR-23: The system shall write the report to `.tmp/security-change1-report.md`.
FR-24: The report shall contain release-notes findings, the lockfile diff table, test and build results, before/after audit numbers and unfixed items with reasons.
FR-25: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall print no secret value.
NFR-02: The change shall add no new direct dependency.
NFR-03: Verification commands shall make no live trading call (no `npm run cycle`, `exit-only` or `report`).
NFR-04: Every claim in the report shall be backed by a command result or a cited source; unverified items shall be labelled as such.

## Constraints

C-01: The system shall edit only `package.json` and `package-lock.json` (the report in `.tmp/` is the permitted deliverable, and `.tmp/` is gitignored).
C-02: The change shall not touch any Protected Zone file.
C-03: The change shall not use `npm audit fix --force`.
C-04: The change shall not make major bumps beyond those the request names.
C-05: The change shall not modify source code, config files or workflows.
C-06: The change shall not commit, push, branch or open a PR.

## Out of Scope

- GitHub Actions upgrades (CHANGE 2).
- Pinning actions by SHA, Dependabot, hardening `security-audit.yml`.
- Bumping `eslint-config-next` or `@anthropic-ai/sdk`.
- Migrating `middleware.ts` to a newer convention, if one exists.
- Rotating the Supabase token found in `.claude/settings.json`.
- Deploying to Vercel or testing a preview.
