# Design — docs-4: Align the review agents and remaining docs with the code (DOCUMENTATION ONLY + one read-only check)

## Architecture Decision

Documentation-only edits plus one read-only investigation. Sources of truth are the code files already used in docs-3 (`claude-agent.ts`, `protective-stop.ts`, `sma5-exit.ts`, `config.ts`, `indicators.ts`), the workflow files for schedules, and, for SDD.md sections 7 to 17, whichever module each section describes (for example `watchlist-monitor.ts`, `db.ts`, `learning.ts`, `news-intelligence.ts`, the workflow files). Edits are targeted line replacements with a script that preserves CRLF (all candidate files are 100% CRLF). The corrected `CLAUDE.md` "Trading Signals" section from docs-3 (commit `d44b669`) is the wording to reuse for the agent files, after re-checking it against the code.

## Data Flow

1. Re-read the signal and exit code (`claude-agent.ts:247-380`, `:1640-1900`, `protective-stop.ts`, `sma5-exit.ts`).
2. Read the three agent files fully and mark: stale statements (to fix), unverifiable rules (to list), everything else (untouched).
3. Edit trading-reviewer, pr-reviewer, test-agent.
4. Read every workflow file and rewrite the debug-agent workflow table.
5. Compute the local equivalents of each cron; edit the README schedule table and the CLAUDE.md schedule block.
6. Walk SDD.md sections 7 to 17 statement by statement against the code; fix proven errors; list the rest.
7. Read-only check on `setups.ts` and its consumers.
8. Verify and write `.tmp/docs-4-report.md`.

### Facts known from the spec research (to be re-read at implementation)

| Fact | Source |
|------|--------|
| Real workflows and crons: `agent-cron.yml` `0 14-20 * * 1-5`; `agent-exits.yml` `30 13` and `55 19` `* * 1-5`; `daily-bars-sync.yml` `0 21 * * 1-5`; `earnings-calendar-sync.yml` `17 11 * * 1-5`; `position-health.yml` `45 13` and `10 20` `* * 1-5`; `security-audit.yml` `0 12 * * 1-5`; `weekly-report.yml` `0 21 * * 5`; also `pr-review.yml` (trigger not read yet) | `.github/workflows/*.yml:5-6` |
| `debug-agent.md` lists `trading-cycle.yml` (every 30 min), `exit-only.yml` (3:45pm), weekly report "Friday 4pm"; none of the first two exist | `debug-agent.md:30-32` |
| Daylight (UTC-4) vs standard (UTC-5) equivalents: 14-20 UTC = 10 AM-4 PM EDT / 9 AM-3 PM EST; 13:30 = 9:30 / 8:30; 19:55 = 3:55 PM / 2:55 PM; 21:00 = 5 PM / 4 PM | arithmetic, to be recomputed per cron |
| Stale MR text in agents: `trading-reviewer.md:52`, `pr-reviewer.md:131`, `test-agent.md:223` (plus "4" in `trading-reviewer.md:48,82`, `pr-reviewer.md:123`, `test-agent.md:219`) | grep |
| `setups.ts:16-17`: MEAN_REVERSION criteria "Ranging market regime, z-score <= -1.3 (or news-adjusted threshold), RSI < 45, %B < 0.2." | `setups.ts:17` |
| `setups.ts` consumers: `stock-selector.ts:19` imports `ACTIVE_SETUPS`; `:47` builds `ACTIVE_SETUP_CRITERIA_TEXT`; `:66` interpolates it into a template (likely the prompt, not yet confirmed); `types.ts:1` imports the `SetupName` type only | grep |
| Real MR rule | `claude-agent.ts:1684-1703`: z-score <= effective threshold, plus the ADX gate (RANGING and ADX < 18 blocks); no RSI or %B condition |

### SDD.md sections 7 to 17 to check

Near-miss (7), rotation (8), ranking (9), learning loop (10), news intelligence (11), schema "9 Tables" (12), Supabase clients (13), Claude API usage (14), GitHub Actions workflows (15, overlaps the cron work), known limitations (16), Protected Zone (17). Known leads: SDD.md §15 probably repeats the stale workflow schedule; §12 table count must match the migrations/`db.ts`; §17 list must match `CLAUDE.md`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Targeted replacement of stale lines in the agent files | Minimal diff, rest untouched | Needs careful reading of each file | Chosen |
| Rewrite the three agent files from the CLAUDE.md section | Consistent | Violates "keep every other instruction unchanged" | Rejected |
| Fix `setups.ts:17` now | Removes the last stale copy | Code change, alters the stock-selection prompt, forbidden here | Rejected (report only) |
| Describe cron times as local times only | Shorter | Wrong for half the year | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| .claude/agents/trading-reviewer.md | MODIFY | Signals table, title, line 82, exits list |
| .claude/agents/pr-reviewer.md | MODIFY | Line 123, signal table ~131 |
| .claude/agents/test-agent.md | MODIFY | Title ~219, MR trigger ~223 |
| .claude/agents/debug-agent.md | MODIFY | Workflow table ~30-32 |
| README.md | MODIFY | Schedule table: UTC cron and both local equivalents |
| CLAUDE.md | MODIFY | Schedule block comments only |
| SDD.md | MODIFY | Only statements proven wrong in sections 7 to 17 |
| .tmp/docs-4-report.md | CREATE | Changes, unverified list, setups.ts finding |
| src/lib/setups.ts | READ ONLY | Investigated, not edited |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `claude-agent.ts`, `config.ts` and `indicators.ts` are only read. `CLAUDE.md` is edited in its schedule comments only, not in the Protected Zone block.

## Database Changes

None. (SDD.md section 12 is checked against the schema; no migration is touched.)

## Open Questions

- **Q-1 (test-agent fixtures):** `test-agent.md` has fixture code with `rsi: 38` and `percentB: 0.12` for MEAN_REVERSION. Those values do not contradict the code, but the header says they trigger the signal. Default: change only the header/trigger sentence and leave the fixture values; list them as "not required by the code" in the report. Confirm.
- **Q-2 (pr-reviewer / trading-reviewer rules):** Rules such as "Removes or weakens a universal exit rule" stay as is, but the word "universal" is now inaccurate (exits differ per setup). Default: touch only the wording needed to avoid a false flag, and list the rest. Confirm.
- **Q-3 (cron wording):** Default format in comments: `0 14-20 * * 1-5 (UTC) = 10 AM-4 PM EDT / 9 AM-3 PM EST`. Confirm.
- **Q-4 (SDD size):** Sections 7 to 17 are about 150 lines. Default: verify all of them; statements that need a live database or a deployed environment to check go to the "unverified" list. Confirm.
- **Q-5 (setups.ts finding c):** (c) is likely verifiable by reading `stock-selector.ts` around `:47-66` and the call that sends it; if the prompt is only built conditionally or the call site is dynamic, the report will say "not verifiable". No decision needed unless you want a runtime check, which is not authorized.
- **Q-6 (other workflows):** `pr-review.yml`, `position-health.yml`, `security-audit.yml` and the two sync workflows are also real. Default: list every real workflow in the debug-agent table, not only the three it names today. Confirm.
