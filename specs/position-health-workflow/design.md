# Design — Position Health Monitor: GitHub Actions Workflow

## Architecture Decision

A single new GitHub Actions workflow file, `.github/workflows/position-health.yml`,
following `agent-exits.yml`'s exact structural pattern (the closest existing
analog: a script-invoking workflow with two daily cron triggers, its own
concurrency group, and a secrets-sourced env block) rather than
`agent-cron.yml`'s hourly single-trigger pattern. This is infrastructure-only
— no application code, no schema change. The workflow's only job is to
check out the repo, install dependencies, run the existing security audit,
and invoke the already-merged `npm run health-check` script in live mode.

## Verified pre-conditions (Step 1, this session)

```
.github/workflows/ contents: agent-cron.yml, agent-exits.yml, keepalive.yml,
weekly-report.yml, pr-review.yml — no position-health.yml exists today.

concurrency.group values in use: trading-cycle (agent-cron.yml),
exit-check (agent-exits.yml). keepalive.yml/weekly-report.yml/pr-review.yml
have no concurrency block. "position-health" is unused — no collision.
```

Both conditions the prompt's FAIL FAST clause was guarding against are
clear: the target file doesn't exist, and the concurrency group name is
available.

## Data Flow

```
GitHub Actions scheduler
  → cron "45 13 * * 1-5" (9:45 AM ET) or "10 20 * * 1-5" (4:10 PM ET)
    OR manual workflow_dispatch
  → checkout repo, setup Node 24, npm ci, npm audit
  → RUN_HEALTH_CHECK=true npm run health-check
    → scripts/position-health-check.ts (unchanged, Prompt 3/4)
      → reads open_position_contexts, computes current state,
        inserts one batch into position_health_snapshots
```

No new data path is introduced — this workflow only supplies the schedule
and environment that were previously provided manually (as in this
session's Prompt 3/4 `/implement` step).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New independent workflow file, own concurrency group (this design) | Never blocks or is blocked by `trading-cycle`/`exit-check`; matches the project's established one-workflow-per-concern pattern | One more workflow file to maintain | **Chosen** — explicitly requested by the prompt and consistent with existing precedent |
| Add health-check as an extra step inside `agent-exits.yml` | Fewer files | Couples an observability-only script to the exit-check workflow's schedule/concurrency/failure semantics; a slow or failing health-check run could delay or fail real exit-rule enforcement | Rejected |
| Schedule via Vercel Cron hitting an API route | Centralizes scheduling in the app | This project migrated *away* from Vercel Cron entirely in March 2026 (`vercel.json` crons removed, commit `81de814`/`8b4371b`) — reintroducing it contradicts established architecture | Rejected |
| Include `ANTHROPIC_API_KEY` in the env block "just in case" | Matches `agent-cron.yml`'s superset of secrets | `position-health-check.ts` makes zero Claude calls (confirmed: no `@anthropic-ai/sdk` import in that file) — an unused secret is unnecessary exposure surface | Rejected — omitted per FR-06 |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `.github/workflows/position-health.yml` | CREATE | New workflow, content specified verbatim below |

No existing file is modified. This is the entire change set.

## Exact file content

```yaml
name: Position Health Check

on:
  schedule:
    - cron: "45 13 * * 1-5"   # 9:45 AM ET
    - cron: "10 20 * * 1-5"   # 4:10 PM ET
  workflow_dispatch:

concurrency:
  group: position-health
  cancel-in-progress: false

jobs:
  position-health:
    name: Position Health Check
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read

    env:
      ALPACA_API_KEY: ${{ secrets.ALPACA_API_KEY }}
      ALPACA_SECRET_KEY: ${{ secrets.ALPACA_SECRET_KEY }}
      ALPACA_BASE_URL: ${{ secrets.ALPACA_BASE_URL }}
      ALPACA_DATA_URL: ${{ secrets.ALPACA_DATA_URL }}
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      RUN_HEALTH_CHECK: "true"

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - name: Security audit
        run: npm audit --audit-level=critical
      - run: npm run health-check
```

This is byte-for-byte what the prompt specified — no reordering, no added
comments beyond the two inline cron-time annotations already present in the
prompt's own draft (which themselves mirror the inline comment style
already used in `agent-exits.yml`), no additional permissions/env/caching.

## Protected Zone Impact

None — `.github/workflows/position-health.yml` is a new file outside the
Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`,
`indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`,
`learning.ts`, `.env`/`.env.local`, `vercel.json`, DB migrations — none of
these are touched).

## Database Changes

None.

## Open Questions

None. The two pre-conditions the prompt flagged as potential FAIL FAST
triggers (file-already-exists, concurrency-group collision) were checked
directly against the repository and both are clear, as documented above.
