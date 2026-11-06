# Review Report — docs-4: Align the review agents and remaining docs with the code

**Date**: 2026-11-06
**Reviewer**: Claude (automated)
**Status**: APPROVED

Method: `git diff -U0` of the eight modified files, byte-level line-ending check, and re-reading the code lines cited in `.tmp/docs-4-report.md` (signal and exit logic, workflow files, `setups.ts`, `stock-selector.ts`).

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | trading-reviewer lists five setups | ✅ | Five rows with entries and exits |
| FR-02 | trading-reviewer heading drops "4" | ✅ | "Trading Signals to Verify" |
| FR-03 | checklist item no longer "all 4" | ✅ | "all 5" |
| FR-04 | trading-reviewer universal exits replaced per setup | ✅ | Matches CLAUDE.md as corrected in docs-3 |
| FR-05 | pr-reviewer (~123, ~131) five setups | ✅ | Count, table, priority and exits updated |
| FR-06 | test-agent title and MR trigger | ✅ | Title "Trading Signals"; MR trigger per code |
| FR-07 | no new fixture code | ✅ | None added |
| FR-08 | target, MR floor, priority where the file lists exit rules | ⚠️ | Done in trading-reviewer and pr-reviewer. `test-agent.md:290-298` also lists exit rules ("Universal exit conditions (test these for every signal)") and was not updated (see M-1) |
| FR-09 | nothing else changed in the three agent files | ✅ | Diff has only the intended lines (the Q-2 checklist wording is the approved exception) |
| FR-10 | unverifiable or stale rules listed | ⚠️ | The stale `test-agent.md` items in M-1 are not in the report's unverified list |
| FR-11 | debug-agent uses real workflow names | ✅ | `agent-cron.yml`, `agent-exits.yml`, and others, all existing |
| FR-12 | file names and crons read from the workflows | ✅ | Cron strings and EDT/EST conversions match `.github/workflows/*.yml` |
| FR-13 | README UTC cron plus both local times | ✅ | Four rows and the note |
| FR-14 | CLAUDE.md schedule comments | ✅ | Four comments, cron lines unchanged |
| FR-15 | no cron expression changed | ✅ | Diff shows cron strings identical |
| FR-16 | local equivalents computed from the cron | ✅ | 14-20 UTC = 10-4 EDT / 9-3 EST, etc. |
| FR-17 | SDD 7-17 verified with file:line | ✅ | Report section 2 and 3 |
| FR-18 | fix only what is proven wrong | ✅ | Five corrections (D1-D5), each with a source |
| FR-19 | list unverified statements | ✅ | Report section 3 |
| FR-20 | verified statements as counts | ✅ | Report section 2 |
| FR-21 | no rewording beyond corrections | ✅ | SDD diff limited to D1-D5 and the §15 time cells |
| FR-22 | (a) what setups.ts says | ✅ | Lines 16-19 quoted |
| FR-23 | (b) every consumer | ✅ | `stock-selector.ts:19,47,66`; `types.ts:1` type only. Grep confirms no other `.criteria` reader |
| FR-24 | (c) sent to Claude | ✅ | `stock-selector.ts:52-90,191-194`, call at `claude-agent.ts:1160`; screener ≥ 10 condition (`:1159`) |
| FR-25 | state if (c) not verifiable | ✅ | Runtime dependence on the screener is stated |
| FR-26 | (d) difference from the real MR rule | ✅ | Table with five rows; claims match `claude-agent.ts:1684-1703`, `:1715-1742` |
| FR-27 | setups.ts not edited | ✅ | Not in `git status` |
| FR-28 | report with old → new and source | ✅ | `.tmp/docs-4-report.md` |
| FR-29 | unverified list and setups.ts finding in report | ✅ | Sections 3 and 4 |
| FR-30 | source read before each statement | ➖ | Process claim; the sampled values match the code |
| FR-31 | CRLF preserved | ✅ | Byte check: CRLF files have 0 bare LF; the LF-only files kept their own style |
| FR-32 | no commit or push | ✅ | Working tree modified, nothing committed |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | read only |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No `src/` file is in `git diff --name-only`; `src/lib/setups.ts` is untouched.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Not applicable to the code; the agent text still says Claude must not decide trades |
| Supabase patterns | ✅ | Not applicable, no queries |
| TypeScript quality | ✅ | Not applicable, no code |
| Security | ✅ | No secrets or sensitive data added |

## Task Checklist

- Completed: 20/20 implementation tasks. The two Post-Implementation boxes are this review.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **M-1** `.claude/agents/test-agent.md` still carries stale exit and trigger content that the agent uses as test guidance, and the report does not list it:
  - `:290-298` "Universal exit conditions (test these for every signal)" has `trendSignalExit = price < EMA50` for every signal and `profitTargetExit +11% > 10%`; the code exits `TREND_ZLE05` on z ≥ 1.25 with a 5% target and `TREND_PULLBACK_3DAY` on price > SMA5, and MR on the profit floor/z-score (`claude-agent.ts:255-297`, `protective-stop.ts:27-30`). A test written from this guidance would assert wrong behavior.
  - `:271` the ZLE05 fixture comment says "in 0–0.5 band"; the code ceiling is 1.25 (`claude-agent.ts:1797`).
  Not edited in this change (FR-08 and FR-10 asked to edit or list it). It needs a small follow-up edit with the same authorization.

### LOW (optional)
- **L-1** `SDD.md` §15 still lists 3 of 8 workflows (listed in the report, not changed).
- **L-2** `skills/typescript-patterns.md:102` example `SignalType` lacks `TREND_PULLBACK_3DAY` (listed in the report).
- **L-3** The report's section 0 correction about the docs-3 line-ending check is correct and necessary; the docs-3 report in `.tmp/` (not versioned) still contains the invalid statement.
- **L-4** `setups.ts:17` stays stale and still reaches the stock-selection prompt; it needs its own CHANGE (already stated in the report).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Suggested follow-up: one small docs CHANGE for M-1 (test-agent exit section and ZLE05 comment), and optionally the `setups.ts` prompt text.
