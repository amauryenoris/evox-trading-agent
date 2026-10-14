# Requirements — Serialize the trading cycle and the exit sweeps with one shared concurrency group

YAML-only change. Scope is the `concurrency:` block of `.github/workflows/agent-cron.yml` and
`.github/workflows/agent-exits.yml`. No application code, no Protected Zone file, no other workflow.

## Functional Requirements

### A. Shared group

FR-01: The system shall place every run of "Trading Agent Cycle" in the concurrency group `trading-positions`.
FR-02: The system shall place every run of "Exit Check — Open and Close" in the concurrency group `trading-positions`.
FR-03: The system shall use the identical literal group name in both files.
FR-04: The system shall set `cancel-in-progress: false` in both files.
FR-05: The system shall let at most one run of the two workflows execute at a time.
FR-06: The system shall apply the shared group to scheduled runs and to manually dispatched runs alike.
FR-07: The system shall not use a context expression (such as `github.workflow` or `github.ref`) in the group name.

### B. Documentation in the file

FR-08: The system shall include a comment above each `concurrency:` block saying that the two workflows share the group because both can close the same positions.
FR-09: The system shall keep each comment to three lines or fewer.

### C. Everything else unchanged

FR-10: The system shall leave every line of `agent-cron.yml` outside its `concurrency:` block and the added comment unchanged.
FR-11: The system shall leave every line of `agent-exits.yml` outside its `concurrency:` block and the added comment unchanged.
FR-12: The system shall keep the `workflow_dispatch:` trigger in `agent-cron.yml`.
FR-13: The system shall keep the `workflow_dispatch:` trigger in `agent-exits.yml`.
FR-14: The system shall keep every cron string, secret, permission, timeout and step of both files as they are.
FR-15: The system shall add no `concurrency:` block to any other workflow.
FR-16: The system shall keep both files valid YAML that GitHub accepts as workflows.

### D. Behavior to be documented in the verification report

FR-17: The report shall state that GitHub keeps one running and one pending run per group.
FR-18: The report shall state that a newer pending run replaces an older pending run in the same group.
FR-19: The report shall state that a queued exit sweep can therefore be dropped when two runs queue behind a running one.
FR-20: The report shall state that a queued trading cycle can be dropped in the same way.
FR-21: The report shall confirm from the code that the cycle itself calls `enforceExitRules`.
FR-22: The report shall state what could not be tested before the change fires.
FR-23: The report shall state what to check in the Actions tab on the first trading day.

## Non-Functional Requirements

NFR-01: The diff shall touch only `agent-cron.yml` and `agent-exits.yml`, and only inside the `concurrency:` region.
NFR-02: Both YAML files shall parse without error with `npx js-yaml`.
NFR-03: The change shall be reversible by reverting one commit.
NFR-04: The change shall not alter when any workflow is scheduled or triggered.

## Constraints

C-01: No Protected Zone file shall be modified.
C-02: No workflow shall be dispatched or re-run as part of this change.
C-03: `workflow_dispatch` shall not be removed from `agent-cron.yml`, because `src/app/api/run-agent/route.ts` dispatches it by file name.
C-04: No secret, environment variable or repository setting shall be changed.
C-05: No file other than the two workflows (and this spec folder) shall change.

## Out of Scope

- Cron times, minutes, DST, `workflow_call` splits, dry-run inputs and `main`-only guards (later changes).
- The duplicate ghost-close investigation itself and any application-level guard against double exits.
- Concurrency for Position Health, Daily Bars Sync, Weekly Report, Security Audit, Keepalive or PR Review.
- Changing `timeout-minutes`, adding job-level concurrency, or adding any in-job lock.
- Scheduled-run delays or dropped scheduled runs on GitHub's side.
