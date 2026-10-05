# Requirements — Add a Standalone Daily Security-Audit Workflow (Additive Only)

## Background

The CI-resilience STEP 0 diagnostic (2026-10-05, prior session) confirmed 5 trading-relevant
workflows (`agent-cron.yml`, `agent-exits.yml`, `position-health.yml`, `daily-bars-sync.yml`,
`weekly-report.yml`) each run `npm audit --audit-level=critical` as a hard gate with no
`continue-on-error` — a newly published CRITICAL advisory fails that step and skips the workflow's
main command entirely, which is what happened 2026-09-30 (~18 hours of halted trading/exit
management, resolved only by a separate package-update fix — see `specs/npm-audit-critical-fix/`,
unrelated to this change). That same diagnostic found **zero failure-notification mechanism**
anywhere in the repo (no `if: failure()`, no Slack/webhook/email, no issue creation tied to a failed
scheduled run) — the September outage was found manually.

This change is step one of a two-step plan: add a **separate, additive-only** workflow that runs the
same audit on its own schedule and raises a visible GitHub Issue (plus its own natural run-failure
signal) when a critical advisory exists. A later, separate change removes the hard gate from the 5
trading workflows once this alerting exists. **This change does not touch any existing workflow or
any other file** — it only adds `.github/workflows/security-audit.yml`.

**Re-verified this session, live against the current repo**:
- `.github/workflows/security-audit.yml` does **not** currently exist — confirmed via `Glob`.
- No other file in `.github/workflows/` implements an equivalent audit-then-issue pattern — confirmed
  by listing all 7 current workflow files; none of them create or manage issues outside
  `pr-review.yml`'s PR-comment flow (which uses the Issues API only to comment on pull requests, a
  distinct capability from standalone issue creation — see Open Questions in `design.md`).
- All 7 existing workflows now run on `runs-on: ubuntu-24.04` (per the immediately prior
  `pin-workflow-runners-ubuntu-24-04` change) and use `actions/checkout@v4` +
  `actions/setup-node@v4` with `node-version: "24"` — the pattern this new workflow follows.
- `pr-review.yml` already uses `actions/github-script@v7` with the default `GITHUB_TOKEN` (no extra
  secret) to call `github.rest.issues.*` methods, and already uses the "capture command output into
  `GITHUB_ENV` via a heredoc delimiter, read it back in a later step" pattern for exactly this kind of
  cross-step text-passing — both are precedents this new workflow's design reuses rather than
  reinventing.

**FAIL FAST check performed this session — one item could NOT be resolved and is carried into
`design.md`'s Open Questions rather than assumed**: whether the GitHub repository's standalone
**Issues feature is enabled** cannot be verified from repository files — it is a GitHub repository
Settings toggle, not stored in git. `pr-review.yml`'s existing `issues.createComment` calls do not
prove this, because PR conversation comments use the Issues REST API internally even when the
standalone Issues *tab* is disabled for a repo; creating a free-standing issue (not attached to a PR)
specifically requires that feature to be ON. This must be confirmed before `/implement` proceeds.

---

## Functional Requirements

FR-01: The system shall create a new workflow file at `.github/workflows/security-audit.yml`.

FR-02: The system shall name the workflow "Security Audit".

FR-03: The system shall trigger the workflow on the cron schedule `"0 12 * * 1-5"`.

FR-04: The system shall trigger the workflow on `workflow_dispatch`.

FR-05: The system shall grant the workflow `permissions: contents: read` and `issues: write`.

FR-06: The system shall define a `concurrency` group named `security-audit` with `cancel-in-progress: false`.

FR-07: The system shall run the job on `runs-on: ubuntu-24.04`.

FR-08: The system shall set `timeout-minutes: 10` for the job.

FR-09: The system shall check out the repository using `actions/checkout@v4`.

FR-10: The system shall set up Node using `actions/setup-node@v4` with `node-version: "24"`.

FR-11: The system shall install dependencies using `npm ci`.

FR-12: The system shall run `npm audit --audit-level=critical` under `set -o pipefail`, piping its combined output to a file via `tee`.

FR-13: The system shall give the audit step an `id` and `continue-on-error: true`, so its outcome can be branched on without failing the job at that point.

FR-14: Where the audit step's outcome is `failure` and no open issue titled exactly "Security audit: critical advisory detected" exists, the system shall create one, with the first ~60 lines of the audit output in its body.

FR-15: Where the audit step's outcome is `failure` and an open issue titled exactly "Security audit: critical advisory detected" already exists, the system shall add a comment containing the first ~60 lines of the audit output to that issue instead of creating a new one.

FR-16: Where the audit step's outcome is `success` and an open issue titled exactly "Security audit: critical advisory detected" exists, the system shall close it and add a comment stating the audit is clean.

FR-17: Where the audit step's outcome is `success` and no open issue titled exactly "Security audit: critical advisory detected" exists, the system shall take no issue-related action.

FR-18: Where the audit step's outcome is `failure`, the system shall cause the job to exit non-zero after the issue-handling step completes, so the run itself is marked failed.

FR-19: The system shall reference no secret and no environment token beyond the default `GITHUB_TOKEN`.

---

## Non-Functional Requirements

NFR-01: The new file shall be valid YAML, verified with a static parser without executing or dispatching the workflow.

NFR-02: This change shall introduce no new npm package dependency.

---

## Constraints

C-01: This feature touches no Protected Zone file — `.github/workflows/*.yml` is not on the Protected Zone list in `CLAUDE.md`/`SDD.md` §17.

C-02: No existing workflow file shall be modified.

C-03: `package.json`, any lockfile, any source file, and any secret shall not be modified.

C-04: No existing `npm audit` step anywhere in the repo shall be removed or altered — that is explicitly reserved for a later, separate change.

C-05: No workflow shall be run, dispatched, or re-run as part of this change or its verification.

C-06: Exactly one new file is created: `.github/workflows/security-audit.yml`. No other file, new or existing, changes.

---

## Out of Scope

- Removing or modifying the `npm audit` gate in `agent-cron.yml`, `agent-exits.yml`, `position-health.yml`, `daily-bars-sync.yml`, or `weekly-report.yml` — that is the next, separate change in this plan
- Any Slack/email/webhook notification channel — this change relies solely on a GitHub Issue plus GitHub's own run-failure signal
- Fixing the actual vulnerable package(s) that might trigger this workflow — a `npm audit fix` is a separate, unrelated maintenance action (see `specs/npm-audit-critical-fix/` for the precedent of how that was handled previously)
- Pinning `actions/checkout@v4`, `actions/setup-node@v4`, or `actions/github-script@v7` to specific commit SHAs
- Any change to `keepalive.yml`, `pr-review.yml`, or any other existing workflow
- Determining or changing whether GitHub Issues are enabled for this repository — that is a pre-implementation confirmation, not something this change can verify or alter from inside the repo (see `design.md` Open Questions)
