# Review Report — CHANGE docs-2: fix wrong numbers in CLAUDE.md and SDD.md (documentation only)

**Date**: 2026-11-06
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: `git status` and `git diff --name-only` (only `CLAUDE.md` and `SDD.md` modified, plus the untracked spec folder), the exact hunks and added/removed lines, line endings (CRLF preserved, no LF-only line in either file), the source facts behind every edit (`config.ts:3`, `position-sizing.ts:1,6,71-72`, the only reads of `MAX_POSITION_SIZE` at `prompt-builder.ts:108,134,188`, the spread gate at `claude-agent.ts:2172`), that no spread figure of 50 remains in either document, and that `security-audit.yml` appears once in the workflow sentences. I also spot-checked the evidence cited in `.tmp/docs-2-report.md` for the listed disagreements; two citations were wrong and I corrected them (see L-1). No code ran, so `tsc` and Vitest are unaffected and were not re-run. Nothing is committed; baseline `618bef7`.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Read `MAX_SPREAD_BPS` in `config.ts` first | ✅ | `config.ts:3` = 100. |
| FR-02 | Correct the Protected Zone block of `CLAUDE.md` | ✅ | `MAX_SPREAD_BPS = 100`, comment column kept. |
| FR-03 | Correct the execution-gates sentence of `CLAUDE.md` | ✅ | `spread (≤ 100bps)`. |
| FR-04 | Correct the gates list of `SDD.md` | ✅ | `MAX_SPREAD_BPS (100)`. |
| FR-05 | Correct every other occurrence | ✅ | Grep over both documents: none left. |
| FR-06 | Keep the `≤` wording unless the code differs | ✅ | The gate blocks on `>` (`claude-agent.ts:2172`), so `≤` is right. |
| FR-07 | Verify who reads `MAX_POSITION_SIZE` first | ✅ | Only `prompt-builder.ts:134,188` (type at `:108`). |
| FR-08 | Row states it only feeds the prompt text | ✅ | "Prompt text only". |
| FR-09 | Row names the prompt lines | ✅ | `Max Position Size` and `Max Position Value Allowed`. |
| FR-10 | Row states it does not limit the order quantity | ✅ | |
| FR-11 | Document `MAX_POSITION_EQUITY_FRACTION` | ✅ | New sentence under the table. |
| FR-12 | Value read from `position-sizing.ts` | ✅ | 0.10 (`:1`). |
| FR-13 | State it is a code constant, not env | ✅ | "constants in `position-sizing.ts`, not env". |
| FR-14 | Document `BUYING_POWER_FRACTION` with its value | ✅ | 0.95 (`:6`, applied at `:71`). |
| FR-15 | Keep the default `0.10` of the row | ✅ | |
| FR-16 | `claude-agent.ts` row no longer claims sizing | ✅ | |
| FR-17 | Row says quantity comes from `position-sizing.ts` and the prompt from `prompt-builder.ts` | ✅ | |
| FR-18 | Keep the claims that remain true | ✅ | Agent loop, signal detection, exit rules. |
| FR-19 | Remove the duplicate `security-audit.yml` mention | ✅ | From the "Other workflows" list; interpreted per design O-1 (the duplicate was in the sentence, not the table). |
| FR-20 | Keep the `npm audit` sentence unchanged | ✅ | |
| FR-21 | Search both documents for other disagreements | ✅ | Eight found. |
| FR-22 | Cover thresholds, positions, spread, quote age, caps, exits, versions | ✅ | |
| FR-23 | List each with document line, value and source line | ✅ | Report section 2. Two citations were wrong in the first version and are now fixed (L-1). |
| FR-24 | Do not edit disagreements outside A/B/C | ✅ | None of D1 to D8 was touched. |
| FR-25 | Also list disagreements outside the two documents | ✅ | O1 to O4 listed, including the two agent files and a skill. |
| FR-26 | Old text, new text and source line for every change | ✅ | Report section 1, E1 to E7. |
| FR-27 | No number changed without reading its source | ✅ | Each edit has its source line. |
| FR-28 | Preserve line endings | ✅ | CRLF, no LF-only line. |
| FR-29 | No other line changed | ✅ | Hunks: `CLAUDE.md` 83, 148, 178, +2 after 181, 184, 258; `SDD.md` 76. |
| FR-30 | Report at `.tmp/docs-2-report.md` | ✅ | |
| FR-31 | Only the two documents changed | ✅ | |
| FR-32 | Uncommitted | ✅ | |
| NFR-01 | No source, test, golden, workflow or settings file | ✅ | |
| NFR-02 | No secret printed | ✅ | |
| NFR-03 | Documented numbers agree with the code | ✅ | For the edited lines; see M-1 for what remains. |
| NFR-04 | Unverified claims labelled | ✅ | |
| C-01 | Edit only `CLAUDE.md` and `SDD.md` | ✅ | |
| C-02 | No Protected Zone file, including `config.ts` | ✅ | |
| C-03 | No threshold, flag or logic change | ✅ | |
| C-04 | No commit/push | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Read only. |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No file outside `CLAUDE.md` and `SDD.md` is modified.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A, no code. |
| Supabase patterns | ✅ | N/A. |
| TypeScript quality | ✅ | N/A, no code. |
| Security | ✅ | No secrets. |

## Task Checklist

- Implementation tasks: 14/14 completed (T-01 to T-14), plus the 4 pre-implementation boxes = 18 `[x]`.
- 3 unchecked boxes remain under Post-Implementation (this review, Protected Zone confirmation, "nothing committed"). They close with this review and your commit decision; not implementation gaps.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** The documents still contain strategy descriptions that disagree with the code (D1 to D5 in the report): the MEAN_REVERSION entry condition (the docs say RSI < 45 and %B < 0.2; the setup does not use them), the TREND_ZLE05 exit (docs: EMA50 break; code: z-score >= 1.25) and its 5% profit target, the missing fifth signal `TREND_PULLBACK_3DAY`, and the MEAN_REVERSION trailing row (it uses a profit floor). They were deliberately only listed, as requested, but `CLAUDE.md` is the file read at the start of every session, so these misdescribe live trading logic. A docs-3 would fix them.
- **M-2** The subagent instructions `.claude/agents/debug-agent.md` (lines 108, 115) and `.claude/agents/trading-reviewer.md` (lines 42, 72) and the skill `.claude/skills/alpaca-patterns.md:59` still say `MAX_SPREAD_BPS = 50`. They are outside this change's authorization, but the agents read them as rules, so they would flag a 50 bps limit that does not exist. They should be corrected with their own authorization.

### LOW (optional)
- **L-1** Two line citations in the first version of the report were wrong: the "4 Trading Signals" heading is at `CLAUDE.md:155` (not 152) and the risk gates are at `risk-manager.ts:103,112,121` (not 79, 88, 97). I corrected the report and the design table during this review; the conclusions did not change.
- **L-2** `README.md:73,224` still describes `MAX_POSITION_SIZE` as a dollar amount (`1000`, "$1,000"), which is wrong in two ways (it is a fraction, and it only feeds the prompt). Outside the authorization.
- **L-3** `AGENTS.md:4` and the Stack row of `CLAUDE.md:65` still say Next.js 16.2.1 while `package.json` has `^16.4.4`.
- **L-4** `MAX_POSITION_SIZE` remains a live environment variable that does nothing but change prompt text, which is confusing by design. The documentation now says so; whether to remove the variable or wire it to the cap is a code decision for later.
- **L-5** The Risk Parameters table is for environment variables, so the real caps are in a sentence below it rather than in the table. Chosen on purpose (design O-2); a reader scanning only the table sees the `MAX_POSITION_SIZE` row with its corrected description.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Suggested follow-up: a docs-3 change for M-1 and the `CLAUDE.md` Stack row, and a separate authorization for M-2 (the agent and skill files), which matter most because subagents read them.
