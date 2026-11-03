# Review Report — Security CHANGE 2: move actions to Node 24 versions and pin by SHA

**Date**: 2026-11-03
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: the 3 tag-to-commit SHAs against `git ls-remote` (match), the structural validator (`ALL CHECKS PASSED`), `git diff --name-only` (only the 9 workflow files), no `@v4`/`@v7` refs left, and no `inputs.*` inside any `run:` script. The release-note findings and the keepalive run data come from the implementation run and `.tmp/security-change2-report.md`; I did not re-fetch them. Nothing is committed, and no workflow has been run.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Read checkout v4 -> v7.0.1 notes first | ✅ | v5, v6.0.x, v6.1.0, v7.0.0, v7.0.1 read (report §1). |
| FR-02 | Read setup-node v4 -> v7.1.0 notes first | ✅ | v5 through v7.1.0 read. |
| FR-03 | Read github-script v7 -> v9.0.0 notes first | ✅ | v8 and v9 read. |
| FR-04 | List breaking changes per action vs our use | ✅ | Tables per action in the report. |
| FR-05 | Check the 4 inline scripts | ✅ | Each script listed with the APIs it uses; grep for `getOctokit`/`@actions/github`: none. |
| FR-06 | Minimal script edit if needed | ✅ | None needed. |
| FR-07 | Stop if unsure | ✅ | Gate passed without doubt; residual risk disclosed. |
| FR-08 | checkout -> v7.0.1 | ✅ | 9 of 9 refs. |
| FR-09 | setup-node -> v7.1.0 | ✅ | 8 of 8 refs. |
| FR-10 | github-script -> v9.0.0 | ✅ | 4 of 4 refs. |
| FR-11 | Full 40-char SHA | ✅ | Validator: every ref matches `^[0-9a-f]{40}$`. |
| FR-12 | Trailing version-tag comment | ✅ | Validator: every pin has `# vX.Y.Z`. |
| FR-13 | SHA resolved from the official repo | ✅ | `actions/*` via ls-remote and REST API. |
| FR-14 | Annotated tag resolved to the commit | ✅ | github-script v9.0.0: pinned `3a2844b…` (commit), not tag object `d746ffe…`. Re-checked via `^{}`. |
| FR-15 | Unverifiable SHA left unchanged | ✅ | N/A, all three resolved and cross-checked. |
| FR-16 | Same SHA per action/version everywhere | ✅ | Validator: consistent. |
| FR-17 | Do not change keepalive-workflow | ✅ | Still `@v2`; its TODO comment untouched. |
| FR-18 | Report usage and permissions | ✅ | `keepalive.yml:17`, `contents: write`, `time_elapsed: 50`. |
| FR-19 | Report last 3 runs | ✅ | 3 runs retrieved via public REST API: all `failure` (2 Nov, 26 Oct, 19 Oct), failing at "Set up job". Log text not read (auth needed), stated. |
| FR-20 | `AUDIT_LEVEL` env var | ✅ | On both the validation step and the audit step. |
| FR-21 | Referenced as `"$AUDIT_LEVEL"` | ✅ | `npm audit --audit-level="$AUDIT_LEVEL"`. |
| FR-22 | No `${{ inputs.audit_level }}` inside `run:` | ✅ | Only 2 matches remain, both in `env:` (lines 43, 57). |
| FR-23 | Validate against low/moderate/high/critical | ✅ | `case` allow-list; local test accepted the 4 values and rejected `bogus`, `critical; id` and a newline-injection string. |
| FR-24 | Fail with a message naming the allowed values | ✅ | `::error::audit_level must be one of: low, moderate, high, critical`, `exit 1`. The bad value is not echoed. |
| FR-25 | `critical` on schedule runs | ✅ | `inputs.audit_level \|\| 'critical'`. |
| FR-26 | Audit capture and issue logic identical | ✅ | `tee audit.txt`, `id: audit`, `continue-on-error: true`, issue steps unchanged (diff shows only the intended lines). |
| FR-27 | `permissions:` unchanged | ✅ | Parsed-YAML comparison vs `HEAD`, top level and per job. |
| FR-28 | Triggers and crons unchanged | ✅ | Same comparison (`on`). |
| FR-29 | Concurrency unchanged | ✅ | Same comparison. |
| FR-30 | Secrets and `env:` unchanged | ✅ | Top-level and job-level `env` compared; diff lines contain no `secrets.*` change. |
| FR-31 | Other inputs unchanged | ✅ | `node-version`, `cache`, `fetch-depth` untouched; no rename found in notes. |
| FR-32 | Validate YAML (`actionlint` or parse) | ⚠️ | `actionlint` not installed; all 9 files parsed with `js-yaml`. No expression or shellcheck lint was run. Allowed fallback, gap disclosed. |
| FR-33 | Only `.github/workflows/` changed | ✅ | `git diff --name-only`: 9 workflow files; no other tracked change. |
| FR-34 | Report at `.tmp/security-change2-report.md` | ✅ | Present. |
| FR-35 | Report contents | ✅ | Findings per action, change table, unchanged items, keepalive, validation. The change table groups some workflows into one row. |
| FR-36 | Uncommitted | ✅ | Working tree only. |
| NFR-01 | No secret printed | ✅ | None in report or spec. |
| NFR-02 | SHAs traceable | ✅ | Commands and API results recorded in the report; re-run at review. |
| NFR-03 | Unverified items labelled | ✅ | Report §7. |
| NFR-04 | No workflow triggered | ✅ | No push, no dispatch. |
| C-01 | Edit only `.github/workflows/` | ✅ | Plus `.tmp/` and `specs/`. |
| C-02 | No Protected Zone file | ✅ | See below. |
| C-03 | No source, `package.json`, lockfile | ✅ | `git diff --name-only` shows none. |
| C-04 | No job-logic change beyond the items | ⚠️ | One added step ("Validate audit level"), disclosed and anticipated in design O-3. It is beyond a literal reading of "keep behaviour identical". |
| C-05 | No guessed SHA/version | ✅ | |
| C-06 | No commit/push/PR | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`pr-review.yml` contains the protected-path list (used by the PR check); its job logic and that list are unchanged. `.env*`, `vercel.json`, `package.json` and the lockfile are untouched.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A, `claude-agent.ts` untouched. |
| Supabase patterns | ✅ | N/A. |
| TypeScript quality | ✅ | N/A, no source changed. |
| Security | ✅ | Actions pinned to immutable commits; direct shell interpolation of the input removed; no secrets; permissions unchanged. |

## Task Checklist

- Implementation tasks: 16/16 completed (plus the 4 pre-implementation boxes ticked = 20 `[x]`).
- 3 unchecked boxes remain under Post-Implementation (this review, Protected Zone confirmation, "nothing committed"). They close with this review and your commit decision; not implementation gaps.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** Nothing was run. Three actions jumped 3 to 5 majors and `pr-review.yml` (all four action paths) can only be exercised by a real PR. The first scheduled/dispatched runs are the real test. Suggested order after the commit: `security-audit`, `earnings-calendar-sync`, `daily-bars-sync`, `position-health`; leave `agent-cron`, `agent-exits` and `weekly-report` for their next schedule or a deliberate manual run; open a throwaway PR for `pr-review`.
- **M-2** `keepalive-workflow` is unusable: its repo is disabled by GitHub staff and the last 3 weekly runs of `keepalive.yml` failed at "Set up job" (cause inferred, logs not read). The 60-day-inactivity safeguard is not working. Not urgent while commits are frequent, but it needs an owner decision (replace with an inline step, drop, or keep). It is also still unpinned with `contents: write`.
- **M-3** `actionlint` was not run, so expression syntax and shellcheck on the new step have only been checked by parsing and a local `case` test.

### LOW (optional)
- **L-1** The new "Validate audit level" step is one step beyond a literal "keep behaviour identical". Justified (otherwise an invalid value would open a false critical-advisory issue) and flagged in design O-3.
- **L-2** Workflow files have mixed CRLF/LF in the working tree; git warns on every command (`core.autocrlf=true`). The commit content is unaffected.
- **L-3** Release notes were read at bullet level, not PR diffs. The checkout v6 credential-file change is the only item with a theoretical effect on a job that pushes (keepalive), moot while that action is unavailable.
- **L-4** Newer releases may appear (this pins exact versions); consider Dependabot for `github-actions` later (out of scope here).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. After pushing, dispatch the workflows in the order above before relying on the schedules.
