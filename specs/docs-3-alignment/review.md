# Review Report — docs-3: Align documentation and agent instructions with the code

**Date**: 2026-11-06
**Reviewer**: Claude (automated)
**Status**: APPROVED

Note: the spec lives in `specs/docs-3-alignment/` (the command argument `docs-3` has no folder of that name). Method: `git diff -U0` of the eight edited files against the sources cited in `.tmp/docs-3-report.md`.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | CLAUDE.md lists exactly five setups | ✅ | Five rows |
| FR-02 | Heading no longer says four | ✅ | "Trading Signals" |
| FR-03 | MR entry = z ≤ threshold + ADX gate | ✅ | `claude-agent.ts:1684-1703`, `:83` |
| FR-04 | No RSI/%B for MR | ✅ | Removed from CLAUDE.md and SDD.md |
| FR-05 | PULLBACK entry incl. MACD > -2.0, ADX unavailable | ✅ | `:1661`, `:1744-1757`, `:84` |
| FR-06 | 3DAY entry | ✅ | `:1713-1742`, `sma5-exit.ts:7-14` |
| FR-07 | 3DAY reads no z/ADX/MACD | ✅ | Stated |
| FR-08 | ZLE05 entry | ✅ | `:1665-1670`, `:1791-1801` |
| FR-09 | EMA_RECLAIM entry | ✅ | `:1822-1829` |
| FR-10 | Classification priority | ✅ | `:1887-1897`; stated in CLAUDE.md and SDD.md |
| FR-11 | MR exit z ≥ -0.8 | ✅ | `config.ts:5`, `indicators.ts:195` |
| FR-12 | PULLBACK / RECLAIM exit below EMA50 | ✅ | `:272-290` |
| FR-13 | ZLE05 exit z ≥ 1.25, EMA50 not an exit | ✅ | `:279-283` |
| FR-14 | 3DAY exit price > SMA5 | ✅ | `:293-297` |
| FR-15 | Target 5% ZLE05, 10% others | ✅ | `protective-stop.ts:27-30` |
| FR-16 | 20 trading-day stop for all | ✅ | `:260-262` |
| FR-17 | MR profit floor 5 / 3 / 3pp, replaces ATR for MR only | ✅ | `protective-stop.ts:13`, `:93-98`; `claude-agent.ts:314-343` |
| FR-18 | ATR activation and multipliers per setup | ✅ | `protective-stop.ts:17-24`; `claude-agent.ts:303-310` |
| FR-19 | Trailing floors at buy price | ✅ | `:369-370` |
| FR-20 | Universal exits list rewritten per setup | ✅ | "Exits that apply to every setup" + "Protective stop" |
| FR-21 | Stop loss stays two layers | ✅ | Kept |
| FR-22 | SDD.md line 59, §4, §5 corrected | ✅ | |
| FR-23 | 3DAY and MR floor in SDD.md §5 | ✅ | |
| FR-24 | Verify other SDD.md setup statements | ⚠️ | Setup/exit statements and sizing checked; sections 7+ (near-miss, rotation) not re-verified, as the report admits |
| FR-25 | Spread 50→100 in three files | ✅ | debug-agent:108, trading-reviewer:42, alpaca-patterns:59 |
| FR-26 | "≤ 50bps"→"≤ 100bps" | ✅ | debug-agent:115, trading-reviewer:72 |
| FR-27 | Nothing else changed in those files | ✅ | Only the spread lines in those three; dashboard-builder is the Q-2 addition |
| FR-28 | Extra numbers listed | ✅ | A6 in the report |
| FR-29 | README MAX_POSITION_SIZE as fraction, prompt only | ✅ | `prompt-builder.ts:134,188` |
| FR-30 | Example value is a fraction | ✅ | `0.10` |
| FR-31 | Other README numbers checked | ✅ | RISK_PCT, times |
| FR-32 | RISK_PCT and times compared with sources | ✅ | `claude-agent.ts:2205`, `agent-cron.yml:6`, `agent-exits.yml:6` |
| FR-33 | README setups table | ✅ | 3DAY added, "five" |
| FR-34 | Read version from package.json | ✅ | `^16.4.4`; installed 16.4.4 |
| FR-35 | AGENTS.md:4 and CLAUDE.md Stack row | ✅ | |
| FR-36 | Report with old → new + source | ✅ | `.tmp/docs-3-report.md` |
| FR-37 | Remaining disagreements listed | ✅ | Section 2 of the report |
| FR-38 | Source read before each number | ➖ | Process claim; the diff values match the sources I re-checked |
| FR-39 | CRLF preserved | ✅ | CR count equals line count in all eight files |
| FR-40 | No commit or push | ✅ | Eight files modified, nothing committed |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | not in `git status` |
| src/lib/claude-agent.ts | UNTOUCHED | read only |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`CLAUDE.md` itself changed, but its Protected Zone block (the `config.ts` values) did not.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `claude-agent.ts` untouched; the Decision Architecture section is unchanged |
| Supabase patterns | ✅ | Not applicable, no queries |
| TypeScript quality | ✅ | Not applicable, no code |
| Security | ✅ | No secrets or sensitive data added |

## Task Checklist

- Completed: 19/19 implementation tasks. The two Post-Implementation boxes are this review itself.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **M-1** Four agent/skill files still describe four signals and the old MR rule (RSI < 45, %B < 0.2): `trading-reviewer.md:48-61,82`, `pr-reviewer.md:123`, `test-agent.md:219-232`. `trading-reviewer` and `pr-reviewer` use these as review rules, so they would flag correct 3DAY code or ZLE05 exits. Out of this change's step 4 (not numbers); it needs a follow-up docs CHANGE with its own authorization. Also `src/lib/setups.ts:17` carries the same stale MR criteria in code.

### LOW (optional)
- **L-1** `debug-agent.md:30-32` names workflows and times that do not exist (`trading-cycle.yml`, `exit-only.yml`, "every 30 min"). Listed in the report, not changed.
- **L-2** README "10 AM – 4 PM ET" follows the UTC cron `0 14-20` and matches the CLAUDE.md comment, but during standard time (UTC-5) the same cron runs 9 AM – 3 PM ET. The doc is correct for daylight time only.
- **L-3** SDD.md sections 7+ were not re-verified (FR-24 partial).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
