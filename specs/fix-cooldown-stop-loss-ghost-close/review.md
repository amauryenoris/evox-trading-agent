# Review Report — Wire Stop-Loss/Ghost-Close Paths Into the Cooldown System

**Date**: 2026-07-16
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Compute trading-day dates once, before `enforceStopLosses()` | ✅ SATISFIED | Hoisted block (`claude-agent.ts:933-950`) runs before the `enforceStopLosses()` call — confirmed in diff. |
| FR-02 | Reuse the single hoisted computation everywhere | ✅ SATISFIED | `enforceStopLosses()` receives `nextTradingDay3` as a parameter; the existing cooldown-write block now destructures from `cooldownDates` instead of recomputing; the ghost-close loop reads `cooldownDates.nextTradingDay3` directly. No second `getNextTradingDay` call site added anywhere in the diff. |
| FR-03 | `enforceStopLosses()` writes `STOP_LOSS` cooldown on every close | ✅ SATISFIED | Confirmed — `upsertSymbolCooldown(ctx.symbol, 'STOP_LOSS', nextTradingDay3)` runs inside the same `try` as `closePosition`, guarded only by `nextTradingDay3 !== null` (fail-safe on date-fetch failure). |
| FR-04 | Ghost-close writes `STOP_LOSS` cooldown when `pnl_pct < 0` | ✅ SATISFIED | `if (pnlPct < 0 && cooldownDates !== null) { ... }` — confirmed. |
| FR-05 | Ghost-close writes no cooldown when `pnl_pct >= 0` | ✅ SATISFIED | Same conditional — strict `< 0`, so exactly `0` correctly writes nothing. |
| FR-06 | `[COOLDOWN_PERSIST]` log with source identification | ✅ SATISFIED | Both new call sites log the exact existing format with `source=enforceStopLosses` / `source=ghost_close` respectively. |
| FR-07 | `agent_log` ghost-close insert fires even when already evaluated | ✅ SATISFIED | The insert is now unconditional, after the `if/else` branch — confirmed in diff. |
| FR-08 | No duplicate `evaluateClosedTrade` call | ✅ SATISFIED | Only called in the `else` (`!alreadyEvaluated`) branch. |
| FR-09 | Sign-equivalent pnl_pct computed locally, no new DB read | ✅ SATISFIED | `pnlPct` computed once, before the branch, from `sellPrice`/`ctx.buyPrice` — no `TradeEvaluation` re-fetch added. |
| FR-10 | `enforceExitRules()`-sourced cooldown behavior unchanged | ⚠️ PARTIAL | Functionally unchanged in the normal case, but see **MEDIUM finding 1** below — hoisting the date computation earlier in the cycle means `nowUTC` is now captured several API calls earlier than before, which can very rarely shift `endOfTradingDay` across the market-close boundary for cycles that straddle it. Narrow, already-approximate per the code's own precision-goal comment, not a functional regression in the normal case. |
| FR-11 | `computeCooldownUntil()` switch unchanged | ✅ SATISFIED | No diff to that function. |
| FR-12 | Entry-time gate blocks re-entry once `STOP_LOSS` is written | ✅ SATISFIED (indirect) | Gate code (`claude-agent.ts:1210-1229`, now further down due to line shifts) is untouched in the diff; `STOP_LOSS` was already first-class there before this fix. Confirmed via the new regression test (`T-12`) replicating the gate logic. Not fully provable via static review alone for the live runtime path — see Pattern Compliance note. |
| NFR-01 | `getNextTradingDay()` called ≤ 2×/cycle | ✅ SATISFIED | Single `Promise.all` with exactly 2 calls in the hoisted block; no other call site added. |
| NFR-02 | No new table/column/migration | ✅ SATISFIED | Confirmed via `git status` — no migration file. |
| NFR-03 | 3 existing cooldown test files unmodified | ✅ SATISFIED | `git diff --stat` on all 3 files produces no output; all 28 of their tests still pass. |
| C-01–C-05 | Protected Zone scope, constraints | ✅ SATISFIED | See Protected Zone Audit below. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | **MODIFIED** | Listed in `design.md`'s Impact table as expected, explicitly authorized by Amaury in the originating request. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`git status --porcelain` confirms exactly one tracked-file change (`src/lib/claude-agent.ts`), matching the spec's Impact table exactly — no undocumented file was touched.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ SATISFIED | No change to Claude's output schema, prompt, or the forced-`HOLD` override — this fix is entirely in deterministic exit/cooldown code, nowhere near the Claude call path. |
| Supabase patterns | ✅ SATISFIED | Both new call sites go through the existing `upsertSymbolCooldown` (which itself already follows `db.ts`/`db-cooldowns.ts` conventions — parameterized RPC, internal error catch, no throw). No new queries added. |
| TypeScript quality | ✅ SATISFIED | No new `any`; no mutation (`cooldownDates` is a fresh local, never reassigned after the try/catch except the one intentional assignment); `enforceStopLosses` is 36 lines (well under 50); no new magic numbers. File remains 2127 lines (pre-existing, `claude-agent.ts` was already far over the 800-line guideline before this diff — not introduced or meaningfully worsened by this change, +~25 net lines). |
| Security | ✅ SATISFIED | No secrets, no `console.log` of sensitive data (only symbol/reason/timestamp), no SQL injection surface. |

## Task Checklist

- Completed: 16/16 implementation tasks (T-01–T-16)
- Pre-implementation: 3/3 checked
- Post-implementation: 1/2 checked — "Run `/review`" is the self-referential item this report closes out.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **Narrow retry-scenario cooldown-reason overwrite.** Traced a specific interleaving: if
  `enforceExitRules()` successfully calls `evaluateClosedTrade()` for a closed position but its
  own `removeOpenPositionContext()` cleanup then fails (an already-anticipated case — the
  existing code comment at that site literally says *"Do not rethrow — Alpaca already closed /
  detectClosedPositions() will retry next cycle"*), the `OpenPositionContext` survives into a
  later cycle. `detectClosedPositions()` then picks it up, `tradeEvaluationExists()` is `true`
  (evaluation already happened), so the new `alreadyEvaluated` branch runs — and if the closing
  `pnl_pct` is negative, it will now write/overwrite that symbol's cooldown as `'STOP_LOSS'`
  (the longest cooldown, `nextTradingDay3`), even though the position actually exited via a
  legitimate signal-based reason (e.g. `Z_SCORE_EXIT`, whose own cooldown block already ran in
  the earlier cycle with the *correct*, likely shorter, reason). Net effect: in this specific,
  narrow, already-rare retry path, a symbol could end up cooling down longer than its true exit
  reason warrants. Not a data-corruption or crash risk (`upsertSymbolCooldown` is an idempotent
  upsert), and the direction of the error is conservative (more caution, not less) — but worth a
  deliberate decision on whether that's acceptable or whether the ghost-close path should be
  able to distinguish "truly external close" from "our own retry of a known internal close."
  Not required to fix before merge; flagging for a conscious choice.

### LOW (optional)
- **`nowUTC` capture point moved earlier in the cycle.** Corresponds to FR-10's partial status —
  the hoisted block now captures `nowUTC` before `enforceStopLosses()`, several awaited API
  calls earlier than the old capture point. For a cycle that happens to straddle exactly the
  21:00 UTC market-close approximation, `endOfTradingDay` could resolve to a different trading
  day than it would have under the old timing. The code's own comment already documents this
  boundary as an approximation ("Precision goal: prevent same-day re-entry, not exact exchange
  timing"), so this is unlikely to matter in practice — noting for completeness, not urgent.
- **New Alpaca API call added for the already-evaluated ghost-close branch.** `getLatestSellOrder`
  is now called unconditionally for every closed context, including ones that were previously
  short-circuited via `continue` before ever reaching it. This was an explicit, spec-approved
  consequence of reusing the `sellPrice` formula for the sign check (Task T-06), not an
  oversight — just noting the added API-call cost.
- **Write-order change between `removeOpenPositionContext` and `recordSelectionOutcome`.**
  Previously `removeOpenPositionContext` ran *before* `recordSelectionOutcome` in the
  newly-evaluated branch; now it runs *after* (consolidated into the single shared
  post-branch call). The two operations touch independent tables (`open_position_contexts` vs
  `selection_evaluations`) with no cross-dependency found, so this reorder appears safe, but it
  wasn't explicitly called out in the spec — flagging for visibility.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings; all 12 functional requirements and 3
non-functional requirements are satisfied (one, FR-10, with a documented narrow caveat). One
MEDIUM finding (a rare retry-path cooldown-reason overwrite, conservative in direction, not a
correctness/safety risk) is worth a conscious decision but does not block merging — reused the
existing, tested, idempotent `upsertSymbolCooldown` mechanism throughout, and the core objective
(stop-loss and ghost-close paths now feed the cooldown system) is fully and correctly achieved.
