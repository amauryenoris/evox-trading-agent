# Requirements — PR Reviewer (GitHub Actions)

## Context

A GitHub Actions workflow that automatically reviews every PR opened or updated
against `main`. It runs TypeScript checks, tests, a Protected Zone audit, and a
Claude-powered architectural review, then posts a consolidated report as a PR
comment. Amaury retains full manual control over merging.

## Functional Requirements

FR-01: The system shall trigger automatically when a pull request targeting `main`
       is opened, reopened, or updated with new commits.

FR-02: The system shall run `npx tsc --noEmit` on the PR branch and record whether
       it exits with code 0 (pass) or non-zero (fail).

FR-03: The system shall run `npm test` (Vitest) on the PR branch and record whether
       it exits with code 0 (pass) or non-zero (fail), including the number of
       tests passed and failed if available.

FR-04: The system shall compare the PR diff against a fixed list of Protected Zone
       file paths and record which, if any, Protected Zone files were modified.

FR-05: The system shall send the PR diff (truncated to at most 12,000 characters if
       necessary) to the Claude API and request an evaluation of: analyst-pure
       architecture compliance, project pattern compliance, and trading logic
       correctness.

FR-06: The system shall post a single comment on the PR containing: TypeScript
       status, test results, Protected Zone audit outcome, and the Claude analysis.

FR-07: The system shall apply the label `needs-work` and submit a formal review
       requesting changes when the Claude analysis contains a CRITICAL finding.

FR-08: The system shall apply the label `ready-for-review` when the Claude analysis
       contains no CRITICAL findings.

FR-09: The system shall never auto-merge a pull request under any condition.

FR-10: The system shall update (replace) its comment on subsequent PR pushes rather
       than posting a new comment each time.

## Non-Functional Requirements

NFR-01: The workflow shall complete within 10 minutes for a typical PR (< 500 lines
        changed, test suite < 60 s).

NFR-02: The workflow shall not expose `ANTHROPIC_API_KEY` or any other secret in
        any log output or PR comment.

NFR-03: The Claude API call shall use model `claude-sonnet-4-6` consistent with the
        project's existing AI layer.

## Constraints

C-01: This feature must not modify any source files in `src/` — only the new
      workflow file `.github/workflows/pr-review.yml` shall be created.
C-02: The workflow must use `ANTHROPIC_API_KEY` from GitHub Secrets (already
      present); no new secrets are required.
C-03: Auto-merge is prohibited — the workflow may only comment and label, never
      merge.
C-04: The Protected Zone list used by the workflow must match exactly the list in
      `CLAUDE.md`: `src/lib/config.ts`, `src/lib/claude-agent.ts`,
      `src/lib/risk-manager.ts`, `src/lib/indicators.ts`,
      `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`,
      `src/lib/learning.ts`.

## Out of Scope

- Automatically fixing issues found during review
- Running E2E tests or integration tests against live Alpaca/Supabase
- Reviewing PRs targeting branches other than `main`
- Blocking merges via branch protection rules (Amaury configures those separately)
- Slack or email notifications
