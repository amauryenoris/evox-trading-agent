# Design — Pin All Workflow Runners to ubuntu-24.04

## Architecture Decision

This is a single-token, 7-file text substitution inside `.github/workflows/` — there is no runtime
code, no module, no data flow to design. Each file's `runs-on:` value changes from the rolling alias
`ubuntu-latest` to the fixed label `ubuntu-24.04`. Nothing else in any file changes.

## Data Flow

Not applicable — no application code or data path is involved. The only "flow" is: GitHub Actions
reads each workflow file's `runs-on` key when scheduling a job; after this change, it requests an
`ubuntu-24.04` runner image instead of whatever `ubuntu-latest` currently resolves to.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Pin to `ubuntu-24.04` | Matches the spec's explicit instruction; current GitHub-supported LTS label; freezes `pr-review.yml`'s unpinned `python3` build | Runner image stops receiving the newest default-image updates until deliberately repinned later | **Chosen** |
| Leave `ubuntu-latest` and address Ubuntu 26 reactively after 2026-10-19 | No action needed now | Exactly the failure mode the STEP 0 diagnostic flagged — no notification exists if the migration breaks a workflow (e.g., the unpinned `python3` step) | Rejected |
| Pin to `ubuntu-22.04` instead | Longer remaining support window than 24.04 in the abstract | Not what was asked; introduces an older image than the spec specifies for no stated benefit | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.github/workflows/agent-cron.yml` | MODIFY | Line 15: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |
| `.github/workflows/agent-exits.yml` | MODIFY | Line 16: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |
| `.github/workflows/position-health.yml` | MODIFY | Line 16: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |
| `.github/workflows/daily-bars-sync.yml` | MODIFY | Line 15: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |
| `.github/workflows/weekly-report.yml` | MODIFY | Line 10: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |
| `.github/workflows/keepalive.yml` | MODIFY | Line 10: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |
| `.github/workflows/pr-review.yml` | MODIFY | Line 15: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04` |

No other file — not even a non-`runs-on` line in these 7 files — changes.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `.github/workflows/*.yml` is not on the
Protected Zone list in `CLAUDE.md` or `SDD.md` §17 (`config.ts`, `claude-agent.ts`, `risk-manager.ts`,
`indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `.env`/`.env.local`,
`vercel.json`, DB migrations).

## Database Changes

None.

## Verification approach (for `/implement`, not executed now)

`js-yaml` is already present in `node_modules/.bin/` (confirmed this session, a transitive
dependency — not added for this change). `npx js-yaml <file>` parses a file and exits non-zero on
invalid YAML, with **no workflow execution or dispatch involved** — this satisfies the spec's
"validate YAML syntax if a parser is available; do not run or dispatch any workflow" instruction.
Run it against each of the 7 files after editing.

## Open Questions

None. This is a mechanical, fully-specified 7-line change with no ambiguity: the exact current line,
exact target text, and exact file list were all re-confirmed live this session.
