# Tasks — Position Health Monitor: GitHub Actions Workflow

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed: **None** — new workflow file only
- [X] Database migrations drafted: **None required**

---

## Implementation Checklist

### Phase 1 — Pre-flight conflict check

- [x] T-01: Confirmed `.github/workflows/position-health.yml` does not
      exist (directory listing at implement time: agent-cron.yml,
      agent-exits.yml, keepalive.yml, weekly-report.yml, pr-review.yml —
      no position-health.yml). No conflict.
- [x] T-02: Confirmed no existing workflow file uses
      `concurrency.group: position-health` — only `trading-cycle`
      (agent-cron.yml) and `exit-check` (agent-exits.yml) are in use. No
      conflict.

### Phase 2 — Create the workflow

- [x] T-03: Create `.github/workflows/position-health.yml` with exactly
      the content specified in design.md's "Exact file content" section —
      no reordering of keys, no added comments beyond the two cron-time
      annotations already specified, no additional permissions/env
      vars/caching/defaults.

### Phase 3 — Verification

- [x] T-04: Confirmed valid YAML — parsed successfully with `js-yaml`,
      top-level keys `name`, `on`, `concurrency`, `jobs` all present as
      expected. No syntax error.
- [x] T-05: Re-confirmed: three distinct `group:` values across
      `.github/workflows/` — `position-health` (new), `exit-check`,
      `trading-cycle`. No collision.
- [x] T-06: Confirmed via `git status --porcelain`: `?? .github/workflows/position-health.yml`
      and `?? specs/position-health-workflow/` only. No existing file
      modified — matches the expected diff exactly.
- [x] T-07: Skipped intentionally, per C-04. Did not dispatch the workflow
      (no `gh workflow run` or any live trigger attempted). GitHub Actions
      execution is not available from this local environment, and today
      already has one live `RUN_HEALTH_CHECK=true` run from Prompt 3/4's
      T-22 — an additional dispatch would insert a redundant, unneeded
      3rd batch into `position_health_snapshots`. No dispatch result is
      simulated or assumed; actual schedule/dispatch behavior can only be
      confirmed once merged to `main`, on GitHub's own infrastructure.

---

## Post-Implementation

- [x] Run `/review position-health-workflow` to verify implementation
      matches spec
- [x] Confirm Protected Zone files unchanged (expected: none touched)
- [ ] Amaury verifies the schedule fires as expected on the next trading
      day (external to this implementation — GitHub Actions scheduled
      triggers cannot be verified synchronously from this session)

---

## Estimated Complexity

**Low** — A single new YAML file with fully-specified, literal content; no
application logic, no schema change, no existing file touched. The only
real risk is a repository-state conflict (file already exists, or a
concurrency-group name collision), both explicitly checked in Phase 1
before the file is written, per the prompt's own FAIL FAST requirement.
