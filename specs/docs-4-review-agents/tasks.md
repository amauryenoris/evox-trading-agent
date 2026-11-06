# Tasks — docs-4: Align the review agents and remaining docs with the code (DOCUMENTATION ONLY + one read-only check)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec (answers to Q-1 to Q-6)
- [x] Protected Zone changes confirmed (not applicable — read only)
- [x] Database migrations drafted (not applicable)

## Implementation Checklist

### Phase 1 — Sources
- [x] T-01: Re-read `claude-agent.ts` (`:247-380`, `:1640-1900`), `protective-stop.ts`, `sma5-exit.ts`, `config.ts`; record file:line per fact
- [x] T-02: Read every file in `.github/workflows/` and record file name, trigger and cron
- [x] T-03: Read the three agent files fully; mark stale, unverifiable and untouched statements
- [x] T-04: Record the current line endings of every candidate file

### Phase 2 — Agent files
- [x] T-05: `trading-reviewer.md`: signals table (five setups), title, line ~82, exits list
- [x] T-06: `pr-reviewer.md`: line ~123 and signal table ~131
- [x] T-07: `test-agent.md`: title ~219 and MR trigger ~223 (per Q-1)
- [x] T-08: `debug-agent.md`: workflow table with real names, files and crons

### Phase 3 — Cron comments
- [x] T-09: Compute UTC to EDT/EST for each cron from the workflow files
- [x] T-10: README schedule table and CLAUDE.md schedule block comments (cron unchanged)

### Phase 4 — SDD.md sections 7 to 17
- [x] T-11: Verify sections 7 to 10 against `watchlist-monitor.ts`, rotation/ranking code and `learning.ts`
- [x] T-12: Verify sections 11 to 14 against `news-intelligence.ts`, the schema/migrations, Supabase clients and Claude API usage
- [x] T-13: Verify sections 15 to 17 against the workflows and `CLAUDE.md`
- [x] T-14: Fix proven errors only; collect the unverified list

### Phase 5 — Read-only check and report
- [x] T-15: `setups.ts` finding (a) to (d), citing file:line; state if (c) is not verifiable
- [x] T-16: `git diff --name-only` shows only allowed files; `setups.ts` and Protected Zone untouched
- [x] T-17: CR count equals line count in each edited file
- [x] T-18: grep over docs and `.claude` finds no "RSI < 45" / "%B < 0.2" as an MR rule and no "four signals" / "4 signal(s)" left
- [x] T-19: Write `.tmp/docs-4-report.md` (changes, unverified list, setups.ts finding)
- [x] T-20: Do not commit or push

## Post-Implementation

- [x] Run /review docs-4 to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

Medium — the edits are small, but SDD sections 7 to 17 need a statement-by-statement check across several modules, and the agent files are used as review rules, so precision matters more than volume.
