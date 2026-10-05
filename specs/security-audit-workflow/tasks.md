# Tasks — Add a Standalone Daily Security-Audit Workflow (Additive Only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, no Protected Zone file touched (see design.md)
- [x] Database migrations drafted — N/A, none required
- [x] **GitHub Issues feature confirmed enabled for this repository** (Settings → Features → Issues) — this cannot be verified from repo files (see design.md Open Questions); if disabled, `/implement` must stop per the spec's own FAIL FAST condition rather than proceed and discover the failure only when the workflow eventually runs

## Implementation Checklist

### Phase 1 — Create the workflow file

- [x] T-01: Created `.github/workflows/security-audit.yml` with `name: Security Audit`, `on.schedule` cron `"0 12 * * 1-5"`, and `on.workflow_dispatch`.
- [x] T-02: Set `permissions: contents: read, issues: write`.
- [x] T-03: Set `concurrency: group: security-audit, cancel-in-progress: false`.
- [x] T-04: Defined the single job with `runs-on: ubuntu-24.04` and `timeout-minutes: 10`.
- [x] T-05: Added steps `actions/checkout@v4` → `actions/setup-node@v4` (`node-version: "24"`, `cache: "npm"`) → `run: npm ci`.
- [x] T-06: Added the audit step: `id: audit`, `continue-on-error: true`, running `set -o pipefail` then `npm audit --audit-level=critical 2>&1 | tee audit.txt`. **Deviation from design.md's sketch**: instead of a separate step capturing `audit.txt`'s first 60 lines into `$GITHUB_ENV`, each of the two conditional `github-script` steps (T-07/T-08) reads `audit.txt` directly via Node's `fs.readFileSync` and slices the first 60 lines itself. Reason: `actions/github-script@v7` fully supports `require('fs')` inside its script context (well-documented capability), so the extra `$GITHUB_ENV` round-trip step was unnecessary — and it would have been actively wrong here, since `set -o pipefail` plus the runner's default `-e` means the script aborts immediately on the failing `npm audit` line, so any capture command chained *after* it in the same step would never execute on the failure path. Reading the file fresh in each later step sidesteps that trap entirely. No externally observable behavior (FR-14 through FR-18) changes.
- [x] T-07: Added step "Report critical advisory", gated `if: steps.audit.outcome == 'failure'`, using `actions/github-script@v7`: lists open issues (excluding PRs), finds one whose title is exactly `"Security audit: critical advisory detected"`; if found, adds a comment with the audit excerpt; if not found, creates a new issue with that exact title and the excerpt as the body.
- [x] T-08: Added step "Close resolved advisory", gated `if: steps.audit.outcome == 'success'`, using `actions/github-script@v7`: same lookup; if found, adds a "audit is clean" comment and closes it (`state: 'closed'`); if not found, does nothing (the `if (existing)` block is skipped entirely).
- [x] T-09: Added final step "Fail the run on critical advisory", gated `if: steps.audit.outcome == 'failure'`, running `exit 1` — ordered after both conditional github-script steps so issue-handling always completes first.
- [x] T-10: Confirmed — no `env:` block, no secret reference anywhere in the file; both `github-script` steps use the implicit default `GITHUB_TOKEN` the `github` object is pre-authenticated with.

## Verification

- [x] T-11: Complete file content shown in the implementation report.
- [x] T-12: Ran `npx js-yaml .github/workflows/security-audit.yml` — parses cleanly. No workflow run or dispatched.
- [x] T-13: Explained in plain words in the implementation report (see below).
- [x] T-14: Stated explicitly in the implementation report: the workflow was NOT executed or dispatched at any point.
- [x] T-15: Ran `git status --short` and `git diff --stat` — exactly one new file, `.github/workflows/security-audit.yml`; zero modifications to any existing file.

## Post-Implementation

- [x] Run `/review security-audit-workflow` to verify implementation matches spec — APPROVED, see `specs/security-audit-workflow/review.md`
- [x] Confirm Protected Zone files unchanged — confirmed, none in scope; `git status --short` shows only the new `.github/workflows/security-audit.yml` file
- [ ] Note for Amaury (not an implementation task): this workflow is step one of two. Once it has run successfully for a few days (confirming issue creation/comment/close behavior works as intended against this specific repo's Issues configuration), the next, separate change removes the hard `npm audit` gate from the 5 trading workflows — do not remove those gates before this one has been observed working.

## Estimated Complexity

**Low** — one new, self-contained CI file with no application code, no Protected Zone, no DB change, and no modification to anything existing. The only real risk is the unverifiable-from-repo Issues-enabled pre-condition, which is why it's called out as its own Pre-Implementation gate rather than assumed.
