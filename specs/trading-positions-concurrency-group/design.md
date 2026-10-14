# Design — Serialize the trading cycle and the exit sweeps with one shared concurrency group

## Architecture Decision

The fix lives entirely in the GitHub Actions layer. Both `agent-cron.yml` (group `trading-cycle`) and `agent-exits.yml`
(group `exit-check`) run code that can close the same positions: the cycle calls `enforceExitRules` at
`src/lib/claude-agent.ts:1434`, and the exit sweep calls it at `src/lib/run-cycle.ts:38`. Because the two groups are
different, the runs can overlap. Giving both files the same group name makes GitHub run them one at a time. No
application code changes.

## Pre-Implementation Verification (against current files)

| Check | Result | Evidence |
|---|---|---|
| Current groups | `trading-cycle` and `exit-check`, both `cancel-in-progress: false` | `agent-cron.yml:9-11`, `agent-exits.yml:9-11` |
| `workflow_dispatch` present in both | Yes | `agent-cron.yml:7`, `agent-exits.yml:7` |
| The cycle runs `enforceExitRules` itself | Yes, step "4e", inside a try/catch; it reads `getAllOpenPositionContexts()` | `claude-agent.ts:1428-1437` |
| The cycle can skip it | Only when the market is closed and there are no positions (`claude-agent.ts:1322-1325`), when there is nothing to exit |
| The dashboard depends on `agent-cron.yml` | Yes, by file name, `ref: main` | `src/app/api/run-agent/route.ts:18,27` |
| Working tree | Clean, on `main` | `git status` |

## What the Change Does

Before / after for both files (only this block changes):

```yaml
# before (agent-cron.yml)            # before (agent-exits.yml)
concurrency:                         concurrency:
  group: trading-cycle                 group: exit-check
  cancel-in-progress: false            cancel-in-progress: false

# after (both files, same text)
# Shared with the exit sweep: both can close the same positions, so they must never overlap.
concurrency:
  group: trading-positions
  cancel-in-progress: false
```

## Data Flow

1. A scheduled or manual run of either workflow starts.
2. GitHub checks group `trading-positions`.
3. If nothing in the group is running, the run starts.
4. If a run is already running, the new run waits as "pending".
5. If a pending run already exists, the newer pending run replaces it, and the older one is shown as cancelled.
6. When the running job ends, the pending run starts.

## Behavior to Know About (stated plainly)

- **GitHub keeps one running and one pending run per group.** A newer pending run replaces an older pending one.
  If a long cycle is running and both an exit sweep and an hourly cycle (or a dashboard run) queue behind it, only the
  newest of those survives.
- **A queued exit sweep can be dropped.** It is covered, not lost: the cycle calls `enforceExitRules` on every run
  (`claude-agent.ts:1434`) before it evaluates entries, so the next cycle repeats the same exit evaluation.
- **A queued cycle can also be dropped**, for example by a later exit sweep or a dashboard run. A dropped cycle means
  one fewer entry opportunity that hour. This is new: today each workflow queues independently.
- **Dropped runs appear as "Canceled", not "Failed".** The cancellation reason on the run page mentions a higher-priority
  waiting request for the group.
- **Wait time does not count towards `timeout-minutes`** (15 for both). The wait is bounded in practice by the running
  job's own 15-minute limit.
- **The dashboard "Run Agent" button** now waits if a sweep is running, and can be replaced by a newer pending run.
- **It reduces overlap, it does not remove the ghost-close cause.** The duplicate-row mechanism in
  `detectClosedPositions()` is separate and stays open.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One shared group, `cancel-in-progress: false` | Serializes the two writers; two-line change; reversible | A pending run can be replaced by a newer pending one | Chosen |
| Keep two groups | No dropped pending runs | Cycle and sweep overlap on the same positions | Rejected |
| Shared group with `cancel-in-progress: true` | Newest wins | Would kill a run in the middle of placing or closing orders | Rejected |
| Group name from `${{ github.workflow }}` | Automatic | Resolves to different names per workflow, so no sharing | Rejected (FR-07) |
| Application-level lock in `enforceExitRules` | Protects against any caller | Touches the Protected Zone and the database; out of scope | Rejected |
| Also add the group to Position Health | Fewer simultaneous runs | Health does not close positions; widens the drop risk | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| .github/workflows/agent-cron.yml | MODIFY | `concurrency.group` becomes `trading-positions`; add a comment (lines 9-11 region only) |
| .github/workflows/agent-exits.yml | MODIFY | Same change (lines 9-11 region only) |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. Neither `claude-agent.ts` nor `learning.ts` nor any other
`src/` file is touched.

## Database Changes

None.

## Cannot Be Tested Before It Fires

- GitHub applies concurrency only on its own runners. A local parse proves the YAML is valid, not that the groups
  queue as intended.
- No workflow may be dispatched or re-run for this change (C-02), so the first real test is the next scheduled run
  that overlaps another.

## What to Check on the First Trading Day

- Actions tab: runs of "Trading Agent Cycle" and "Exit Check — Open and Close" should never show overlapping start/end
  times.
- Any run marked "Canceled" with a note about group `trading-positions`: record which workflow it was and what was
  running at the time.
- A "Canceled" Exit Check followed by a successful Trading Agent Cycle is the expected, covered case.
- A "Canceled" Trading Agent Cycle means an entry opportunity was skipped that hour.
- The dashboard "Run Agent" button: if it was pressed while something ran, it should start after that run.

## Open Questions

1. A pending hourly cycle can be replaced by a newer pending sweep or dashboard run, so one cycle (and its entry
   opportunity) can be skipped. Accept this trade-off, or would you prefer to keep only the sweeps serialized with each
   other and the cycle on its own group? (Recommendation: accept; the cycle has been hitting scheduling gaps of hours
   anyway, and protecting positions from double exits matters more.)
2. Is a dashboard "Run Agent" press that waits behind a running job, or is replaced by a newer pending run, acceptable?
