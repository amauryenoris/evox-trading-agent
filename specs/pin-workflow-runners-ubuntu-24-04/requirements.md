# Requirements — Pin All Workflow Runners to ubuntu-24.04

## Background

STEP 0 diagnostic (2026-10-05, prior session) inventoried all 7 files in `.github/workflows/` and
confirmed every one uses `runs-on: ubuntu-latest`, with `ubuntu-latest` scheduled to migrate to
Ubuntu 26 starting 2026-10-19. That same diagnostic flagged `pr-review.yml`'s inline `python3` step
([pr-review.yml:101](../../.github/workflows/pr-review.yml)) as having zero version pinning — the
single tool in the whole workflow set most exposed to an OS-image swap silently changing the default
Python build. Pinning `runs-on` to `ubuntu-24.04` (GitHub's current LTS-pinned label, distinct from
the rolling `ubuntu-latest` alias) freezes the OS image — including that `python3` build — across all
7 workflows, deferring exposure to the 2026-10-19 migration until a deliberate, separate decision to
move off `ubuntu-24.04` is made.

**Re-verified this session, live against current files** — exactly one `runs-on: ubuntu-latest` line
exists in each of the 7 files, at precisely the lines the diagnostic cited, and no other
`runs-on`/`ubuntu-latest`/`ubuntu-24.04` text exists anywhere else in `.github/`:

| File | Line | Current text |
|---|---|---|
| `agent-cron.yml` | 15 | `    runs-on: ubuntu-latest` |
| `agent-exits.yml` | 16 | `    runs-on: ubuntu-latest` |
| `position-health.yml` | 16 | `    runs-on: ubuntu-latest` |
| `daily-bars-sync.yml` | 15 | `    runs-on: ubuntu-latest` |
| `weekly-report.yml` | 10 | `    runs-on: ubuntu-latest` |
| `keepalive.yml` | 10 | `    runs-on: ubuntu-latest` |
| `pr-review.yml` | 15 | `    runs-on: ubuntu-latest` |

**FAIL FAST check performed this session**: none triggered — every file has exactly the one expected
`runs-on` line, at the expected line number, matching the context's citation exactly.

---

## Functional Requirements

FR-01: The system shall set `runs-on: ubuntu-24.04` in `agent-cron.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-02: The system shall set `runs-on: ubuntu-24.04` in `agent-exits.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-03: The system shall set `runs-on: ubuntu-24.04` in `position-health.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-04: The system shall set `runs-on: ubuntu-24.04` in `daily-bars-sync.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-05: The system shall set `runs-on: ubuntu-24.04` in `weekly-report.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-06: The system shall set `runs-on: ubuntu-24.04` in `keepalive.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-07: The system shall set `runs-on: ubuntu-24.04` in `pr-review.yml`, replacing its current `runs-on: ubuntu-latest` line.

FR-08: The system shall preserve each file's existing indentation and surrounding lines exactly, changing only the `runs-on` value.

FR-09: Where any `.github/workflows/*.yml` file other than the 7 named above exists at implementation time, the system shall leave it untouched.

---

## Non-Functional Requirements

NFR-01: Each modified file shall remain valid YAML after the change, verified with a parser without executing or dispatching the workflow.

NFR-02: The change shall not alter any workflow's observable trigger schedule, concurrency behavior, timeout, step sequence, or action versions.

---

## Constraints

C-01: This feature touches no Protected Zone file (`src/lib/config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `.env`/`.env.local`, `vercel.json`, any DB migration) — `.github/workflows/*.yml` files are not on that list. No Amaury confirmation beyond spec approval is required on that basis.

C-02: No change to any trigger, cron string, concurrency block, `timeout-minutes`, step, action version, `node-version`, the `npm audit` steps, or any secret reference, in any of the 7 files.

C-03: No change to any file outside `.github/workflows/`.

C-04: No new file is created.

C-05: No workflow is run, dispatched, or re-run as part of this change or its verification.

---

## Out of Scope

- Any other OS/runner choice (e.g., `ubuntu-22.04`, a self-hosted runner, or staying on `ubuntu-latest`) — `ubuntu-24.04` is the one specified
- Addressing the underlying Ubuntu 26 migration itself beyond deferring it via this pin
- Pinning `actions/checkout@v4`, `actions/setup-node@v4`, `actions/github-script@v7`, or `gautamkrishnar/keepalive-workflow@v2` to specific versions or commit SHAs (the keepalive action's unpinned-tag gap, noted in the STEP 0 diagnostic, is a separate, not-yet-spec'd concern)
- Adding `actions/setup-python` or any version pin for `pr-review.yml`'s inline `python3` step beyond what pinning the OS image itself freezes
- Any failure-notification, alerting, or alternative-scheduler work (the diagnostic's "Railway Cron + alerts" roadmap item) — unrelated and separate
- Vercel's dashboard deploy path — not a GitHub Actions workflow, untouched by this change
