# Requirements — Position Health Monitor: GitHub Actions Workflow

## Background

Prompt 3/4 (`scripts/position-health-check.ts`) is merged and live-verified
— it reads open positions, recomputes their current technical state, and
inserts one row per position into `position_health_snapshots`, gated
dry-run/live by the `RUN_HEALTH_CHECK` env var. This spec (Prompt 4/4)
schedules that script to run automatically, twice daily, via its own
independent GitHub Actions workflow — completing the Position Health
Monitor v1 with zero manual intervention required going forward.

## Functional Requirements

FR-01: The system shall run `npm run health-check` in live mode
(`RUN_HEALTH_CHECK=true`) on a scheduled cron trigger.

FR-02: The system shall trigger the scheduled run twice per weekday, at
13:45 UTC (9:45 AM ET) and 20:10 UTC (4:10 PM ET).

FR-03: The system shall support manual triggering via
`workflow_dispatch`, independent of the scheduled triggers.

FR-04: The system shall run in its own concurrency group, distinct from
`trading-cycle` (`agent-cron.yml`) and `exit-check` (`agent-exits.yml`),
so that none of the three workflows blocks or is blocked by another.

FR-05: The system shall inject exactly the six environment variables the
health-check script requires (`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`,
`ALPACA_BASE_URL`, `ALPACA_DATA_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) plus `RUN_HEALTH_CHECK: "true"`, sourced from
repository secrets where applicable.

FR-06: The system shall not inject `ANTHROPIC_API_KEY`, since the
health-check script makes no Claude API calls.

FR-07: The system shall run `npm ci` and `npm audit --audit-level=critical`
before executing the health-check script, matching the existing workflows'
pre-flight steps.

## Non-Functional Requirements

NFR-01: The new workflow file shall be valid YAML conforming to the GitHub
Actions workflow schema.

NFR-02: The new workflow shall use the same action versions already in use
elsewhere in this repository (`actions/checkout@v4`, `actions/setup-node@v4`
with `node-version: '24'`) — no version upgrade, downgrade, or introduction
of a different action.

## Constraints

C-01: This feature must create exactly one new file,
`.github/workflows/position-health.yml`, and must not modify any existing
file — not `agent-cron.yml`, `agent-exits.yml`, `weekly-report.yml`,
`keepalive.yml`, `pr-review.yml`, `package.json`, `scripts/`, or any file
under `src/`.

C-02: This feature must not add a `run_id` column or any other schema
change to `position_health_snapshots` — `snapshot_timestamp` (millisecond
precision) is sufficient to distinguish the two daily runs.

C-03: If implementing this spec would require modifying any existing file,
or the target file already exists, or the chosen `concurrency.group` name
collides with an existing one, implementation must stop and report the
conflict rather than attempt a workaround.

C-04: Live-triggering this workflow (or otherwise executing
`RUN_HEALTH_CHECK=true`) during verification must not be done gratuitously
— a live health-check run already occurred today during Prompt 3/4's
implementation; verification of this spec should avoid an unnecessary
additional insert where avoidable.

## Out of Scope

- Any change to `scripts/position-health-check.ts` itself.
- A `run_id` column or any `position_health_snapshots` schema change.
- A dashboard/API route to surface health-check results.
- Alerting, paging, or any notification on health-check findings.
- Changing the schedule or behavior of `agent-cron.yml`, `agent-exits.yml`,
  or any other existing workflow.
