# Tasks — Security CHANGE 2: move actions to Node 24 versions and pin by SHA

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: none)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Breaking-change gate
- [x] T-01: Read release notes `actions/checkout` v4 -> v7.0.1 (all intermediate majors); list breaking changes vs our use (`fetch-depth`, default credentials).
- [x] T-02: Read release notes `actions/setup-node` v4 -> v7.1.0; list breaking changes vs our use (`node-version`, `cache: npm`).
- [x] T-03: Read release notes `actions/github-script` v7 -> v9.0.0; check the 4 inline scripts (`pr-review.yml` x2, `security-audit.yml` x2). STOP if a non-minimal edit or an unclear effect appears.
- [x] T-04: Re-list current `uses:` lines in all workflows (confirm the step 0 table is still accurate).

### Phase 2 — Resolve SHAs
- [x] T-05: Resolve checkout v7.0.1, setup-node v7.1.0, github-script v9.0.0 to commit SHAs (REST API + `git ls-remote`, peel annotated tags); cross-check both sources; confirm `node24` in each `action.yml` at that SHA. Leave any unverifiable action unchanged.

### Phase 3 — Edit workflows
- [x] T-06: Pin checkout, setup-node in `agent-cron`, `agent-exits`, `daily-bars-sync`, `earnings-calendar-sync`, `position-health`, `weekly-report` (`@<sha> # vX.Y.Z`).
- [x] T-07: Pin checkout, setup-node, github-script x2 in `pr-review.yml`.
- [x] T-08: Pin checkout, setup-node, github-script x2 in `security-audit.yml`.
- [x] T-09: `security-audit.yml`: pass `AUDIT_LEVEL` via `env:`, validate against `low|moderate|high|critical`, call `npm audit --audit-level="$AUDIT_LEVEL"`; default `critical` for schedule runs.
- [x] T-10: Pin `actions/checkout` in `keepalive.yml` only; leave `keepalive-workflow@v2` untouched.
- [x] T-11: Apply minimal script edits only if T-03 found a need; list them.

### Phase 4 — keepalive findings
- [x] T-12: Record where `keepalive-workflow` is used, its permissions, and the last 3 runs of `keepalive.yml` (or why unavailable).

### Phase 5 — Validation
- [x] T-13: Validate YAML syntax of all changed files (`actionlint` or YAML parse).
- [x] T-14: `git diff --name-only` shows only `.github/workflows/*`; `git diff` shows no change to `on:`, `cron`, `permissions:`, `concurrency:`, `secrets.*`.
- [x] T-15: Confirm every pinned SHA is 40 hex chars, has a version comment, and is identical per action/version across files.

### Phase 6 — Report
- [x] T-16: Write `.tmp/security-change2-report.md` (breaking-change findings, table, unchanged items, keepalive, validation, manual run order after push).

## Post-Implementation

- [ ] Run /review security-change2-actions-sha to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; after the commit, run the changed workflows via `workflow_dispatch` (security-audit, earnings-calendar-sync, daily-bars-sync, position-health) before relying on the schedule; `pr-review` is only exercised by a real PR

## Estimated Complexity

Medium. The edits are mechanical (about 40 `uses:` lines plus one input-handling change), but three actions jump several majors and cannot be exercised before push, so the release-notes gate and SHA verification carry the risk.
