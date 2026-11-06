# Requirements — docs-4: Align the review agents and remaining docs with the code (DOCUMENTATION ONLY + one read-only check)

## Functional Requirements

### Agent files (steps 1 and 2)

FR-01: The system shall describe all five setups (MEAN_REVERSION, TREND_PULLBACK, TREND_PULLBACK_3DAY, TREND_ZLE05, EMA_RECLAIM) in `.claude/agents/trading-reviewer.md` (signals table at ~48-61).
FR-02: The system shall retitle the trading-reviewer section so it no longer says "4".
FR-03: The system shall change the trading-reviewer checklist item at ~82 so it no longer says "all 4 signal conditions".
FR-04: The system shall replace the trading-reviewer "Universal exits" list with exits that apply per setup, matching `CLAUDE.md` "Trading Signals" as corrected in docs-3.
FR-05: The system shall state in `.claude/agents/pr-reviewer.md` (~123 and the signal table at ~131) the five setups with entry, exit and target as the code evaluates them.
FR-06: The system shall retitle the `.claude/agents/test-agent.md` section "4 Trading Signals" (~219) and describe the MEAN_REVERSION trigger without RSI < 45 or %B < 0.2.
FR-07: The system shall add to `test-agent.md` fixture guidance for TREND_PULLBACK_3DAY only to the extent needed to say the section covers five setups; it shall not write new fixture code unless the existing fixtures contradict the code.
FR-08: The system shall state, in each of the three agent files, the profit target per setup (5% TREND_ZLE05, 10% others), the MR profit floor (+5% activation, +3% floor, 3 pp ratchet, replaces ATR trailing for MR only) and the classification priority, where the file already lists exit rules or signal conditions.
FR-09: The system shall change nothing else in the three agent files.
FR-10: Where a rule in these files cannot be verified against the code, the system shall list it in the report and leave it unchanged.
FR-11: The system shall replace, in `.claude/agents/debug-agent.md` (~30-32), the nonexistent workflow names and times with the real file names and cron expressions from `.github/workflows/`.
FR-12: The system shall list in the debug-agent table only workflows that exist, each with its file name and its cron expression read from the workflow file.

### Cron comments (step 3)

FR-13: The system shall state in `README.md` (schedule table, ~148-155) the UTC cron for each listed workflow and both local equivalents (daylight time UTC-4 and standard time UTC-5).
FR-14: The system shall state in the `CLAUDE.md` "GitHub Actions Schedule" block (~265-280) the UTC cron and both local equivalents in the comments.
FR-15: The system shall not change any cron expression.
FR-16: The system shall compute each local equivalent from the cron in the workflow file, not from the old comment.

### SDD.md sections 7 to 17 (step 4)

FR-17: The system shall verify each factual statement (threshold, rule, table, flow) in `SDD.md` sections 7 to 17 against the code, citing file:line.
FR-18: The system shall fix a statement only if it can prove it wrong from the code.
FR-19: The system shall list in the report every statement it could not verify, with SDD.md line.
FR-20: The system shall list in the report every statement it verified as correct only as a count per section, not line by line.
FR-21: The system shall not reword SDD.md text beyond the corrections.

### Read-only check on `src/lib/setups.ts` (step 5)

FR-22: The system shall report (a) exactly what `setups.ts` says around the MEAN_REVERSION criteria (line ~17).
FR-23: The system shall report (b) every place that imports or uses that text, including `stock-selector.ts` and `ACTIVE_SETUP_CRITERIA_TEXT`.
FR-24: The system shall report (c) whether that text is sent to Claude in the stock-selection prompt, citing the lines that build and send the prompt.
FR-25: If (c) cannot be established from static reading, the system shall state so explicitly.
FR-26: The system shall report (d) how that text differs from the real MEAN_REVERSION rule in `claude-agent.ts`.
FR-27: The system shall not edit `src/lib/setups.ts`.

### Report and process

FR-28: The system shall write `.tmp/docs-4-report.md` with each change as old value, new value and source file:line.
FR-29: The system shall include in that report the list of unverified statements and the `setups.ts` finding (a to d).
FR-30: The system shall read the source for each statement before writing it.
FR-31: The system shall preserve the CRLF line endings of every edited file.
FR-32: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: Every changed statement shall be traceable to a file:line in the report.
NFR-02: Text outside the listed corrections shall remain byte-identical.
NFR-03: The edited agent files shall stay usable as review rules (short tables, no prose rewrite).

## Constraints

C-01: This feature must not modify the Protected Zone; `claude-agent.ts`, `config.ts`, `indicators.ts` and the other protected files are read only.
C-02: Only `.claude/agents/*.md`, `.claude/skills/*.md`, `README.md`, `SDD.md` and `CLAUDE.md` may be edited, plus the new `.tmp/docs-4-report.md`.
C-03: `.claude/settings.json`, hooks, permission files, source, tests, goldens, workflows, `config.ts` and package files shall not be edited; `src/lib/setups.ts` is read only.
C-04: A documented number or rule shall not change without reading its source in this change.
C-05: Commit and push are forbidden until a separate request.

## Out of Scope

- Fixing the MR text in `setups.ts` (a code change that alters the stock-selection prompt; needs its own CHANGE).
- Changing any workflow cron.
- Skill files with no wrong statement; `supabase-reviewer.md` and `dashboard-builder.md` unless the SDD or signal sweep finds a wrong number.
- Behavior of the code.
