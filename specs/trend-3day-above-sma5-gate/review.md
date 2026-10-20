# Review Report — TREND_PULLBACK_3DAY: No Entry When Price Is Above the SMA5 Exit Level

**Date**: 2026-10-20
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS (no CRITICAL or HIGH findings; 1 MEDIUM)

Evidence: `tsc --noEmit` clean · full Vitest suite 785/785 · `npm run build` green · `sma5-exit.ts` 100% lines/statements/functions. No live order was placed; the live cycle and real candidates were not run.

Decisions applied (confirmed in conversation): O-1 strict operator (price > SMA5 blocks, equality allowed) · O-2 a blocked symbol that qualifies for another setup proceeds under it · O-3 shared function in a new `src/lib/sma5-exit.ts` · O-4 current line locations (detection ~1982-2012, exit ~337).

The exact comparison: `sma5 != null && price > sma5` (`sma5-exit.ts:9`), used by the exit and, through `evaluateSma5EntryGate`, by the entry gate.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Do not detect 3DAY when the exit would fire | ✅ | `trendPullback3DaySetup = candidate && !blocked` |
| FR-02 | Gate uses the exit's comparison function | ✅ | `evaluateSma5EntryGate` calls `isSma5ExitConditionMet` |
| FR-03 | Exit uses that same function | ✅ | `claude-agent.ts` exit branch |
| FR-04 | Strict `>` operator | ✅ | tested (100.01 vs 100 fires, 100 vs 100 does not) |
| FR-05 | Allow equal or below | ✅ | tested in both modules |
| FR-06 | Price and SMA5 from the same indicator object | ✅ | `indicators.currentPrice` / `indicators.sma5`; both come from `calculateAllIndicators` |
| FR-07 | SMA200 and streak conditions unchanged | ✅ | lines in the diff are only the rename to `…Candidate` and the new gate |
| FR-08 | Gate only for candidates that meet the other conditions | ✅ | ternary on `trendPullback3DayCandidate` |
| FR-09 | Missing SMA5 does not block | ✅ | tested (null, undefined) |
| FR-10 | Non-finite SMA5 does not block | ✅ | tested (NaN, ±Infinity) |
| FR-11 | One `console.warn` with the symbol when skipping | ⚠️ | Present in the entry block (`[TREND_3DAY] SYMBOL: SMA5 missing…`); the wiring inside `runAgentCycle` is not unit-tested (MEDIUM-1) |
| FR-12 | HOLD record when blocked and no other setup | ⚠️ | Implemented; wiring not unit-tested |
| FR-13 | `error` starts with `TREND_3DAY_ABOVE_SMA5` | ✅ | by the reason builder (tested); `error` is set to that text |
| FR-14 | Text `price $X >= SMA5 $Y (3DAY exit would fire immediately)` | ✅ | exact string tested, two decimals |
| FR-15 | Full indicator object stored, including `sma5` and `currentPrice` | ✅ | `indicators` is passed whole |
| FR-16 | `orderExecuted` false, `quantity` 0, `confidence` 0 | ✅ | by code |
| FR-17 | `[SETUP-GATE]` console line | ✅ | by code |
| FR-18 | Skip the symbol when no other setup is detected | ✅ | `continue` inside `if (!setup_detected)` |
| FR-19 | Continue under another detected setup | ✅ | falls through; `signalType` chain unchanged |
| FR-20 | No HOLD record in that case | ✅ | record only inside `if (!setup_detected)` |
| FR-21 | Exit rule, operator and text unchanged | ✅ | characterization test passed before the code change and after |
| FR-22 | Other setups' detection unchanged | ✅ | not in the diff; `setup_detected` expression unchanged |
| FR-23 | Sizing, stops and orders unchanged | ✅ | not in the diff |
| FR-24 | No minimum distance below the SMA5 | ✅ | no distance threshold exists |
| FR-25 | No schema or type change | ✅ | `db.ts` and `types.ts` untouched |

NFR-01 ✅ pure functions · NFR-02 ✅ existing 3DAY tests unchanged and passing · NFR-03 ✅ (see coverage note) · NFR-04 ✅ · NFR-05 ✅ no dependency, no Alpaca request · NFR-06 ✅ new functions are 3–4 lines each.

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized and listed in design.md: exit comparison, entry gate, blocked record, one import. +34/−3 lines. SYSTEM_PROMPT, output schema, other setups, sizing and stops are not in the diff |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`db.ts`, `types.ts`, dashboard components, workflows and migrations are also untouched.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Only deterministic gating changed; Claude's prompt, schema and action override are untouched. A blocked candidate never reaches Claude |
| Supabase patterns | ✅ | N/A — no database code; the record goes through the existing `decisions` batch |
| TypeScript quality | ✅ | No `any`, no non-null assertions, immutable pure helpers, prefix as a named constant, `sma5-exit.ts` is 18 lines |
| Security | ✅ | No secrets; log lines contain only symbol and prices |

## Task Checklist

- Implementation tasks T-01…T-13: 13/13 completed
- Post-Implementation: this review and the Protected Zone confirmation, ticked by this report

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **The entry-block wiring has no automated test.** The brief asks for a test that "the blocked record has the prefix and the numbers"; this is covered through the reason builder, and the entry gate and exit are covered through the shared function, but the `decisions.push` / `continue` / "proceed under another setup" branch inside `runAgentCycle` is not executed by any test (that function is not run directly in this project; existing 3DAY detection tests replicate their logic inline). The code is short and follows the neighbouring blocked-record pattern, so the risk is low, but the first live day is the first real execution.

### LOW (optional)
1. The weekly report's gate-bucketing does not know the new prefix, so these HOLDs count under `otherHold`; the "Rejected today" API only whitelists older prefixes. Both are outside this change's scope (dashboard and reporting were out of scope).
2. If the SMA5 were `-Infinity`, the exit would fire (`price > -Infinity`) while the gate reports it unusable and does not block. This cannot occur with finite daily closes.
3. Between the gate evaluation (cycle bar close) and the next exit evaluation (next cycle's bar), price can still cross the SMA5; the gate removes only the immediate case.
4. A blocked symbol that qualifies for another setup is now classified as that setup instead of 3DAY (3DAY had the highest priority). This is the accepted O-2 behaviour.

---

## Decision

**APPROVED WITH WARNINGS** — one MEDIUM finding (untested wiring), no CRITICAL or HIGH. Ready to commit; verify on the first live day that blocked candidates appear as HOLD with `TREND_3DAY_ABOVE_SMA5` and that every new 3DAY entry has price below the SMA5. Nothing has been committed.
