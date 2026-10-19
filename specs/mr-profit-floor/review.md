# Review Report — MEAN_REVERSION Profit Floor

**Date**: 2026-10-19
**Reviewer**: Claude (automated)
**Status**: APPROVED (no CRITICAL or HIGH findings; 3 MEDIUM notes)

Evidence: `tsc --noEmit` clean · full Vitest suite 737/737 · `npm run build` green · coverage `protective-stop.ts` 100% statements/branches/functions/lines, `peak-high.ts` 100% lines / 85.7% branches. No live order was placed; Alpaca and Supabase are mocked in every test.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `PROFIT_FLOOR_CONFIG` = MR {5,3,3} | ✅ | `protective-stop.ts`, asserted in test |
| FR-02 | `computeProtectiveStop` returns `{active, stopPrice, action}` | ✅ | Optional 2nd arg `config` added for the empty-config test |
| FR-03 | Setup not in config → inactive/none | ✅ | tested |
| FR-04 | Empty config → inert for all setups | ✅ | tested via injected `{}` |
| FR-05 | Inactive while high < entry×1.05 | ✅ | tested (104.99 inactive, 105 active) |
| FR-06 | Stop = entry×(1+max(floor, highPct−ratchet)/100) | ✅ | +5.5/+6/+7/+8.14/+12% cases tested |
| FR-07 | Round down to tick | ✅ | `roundDownToTick`, epsilon-guarded |
| FR-08 | Tick 0.01 at/above $1 | ✅ | |
| FR-09 | Tick 0.0001 below $1 | ✅ | assumption A-2, tested |
| FR-10 | Never lower than existing stop | ✅ | tested |
| FR-11 | `place` when no existing stop | ✅ | |
| FR-12 | `replace` when ≥1 tick higher | ✅ | 103.99→104 replaces; 103.995 does not |
| FR-13 | `none` when not a tick higher | ✅ | |
| FR-14 | `sell_now` when current ≤ effective stop | ✅ | incl. never-lower case |
| FR-15 | Invalid inputs → inactive | ✅ | NaN/0/negative/Infinity tested |
| FR-16 | No mutation | ✅ | frozen input test; result `INACTIVE` is frozen |
| FR-17 | Profit target exported (10% / ZLE05 5%) | ✅ | `getProfitTargetPct`; code and dashboard share it |
| FR-18 | Client-safe module | ✅ | only a type import from `types.ts`; imported by two UI files |
| FR-19 | MR uses the new function instead of ATR trailing | ✅ | `applyProfitFloor` branch |
| FR-20 | Works with null/invalid ATR | ✅ | branch precedes the ATR guard; tested |
| FR-21 | `high` = updated high since entry | ✅ | |
| FR-22 | `existingStop` = persisted `trailingStop` | ✅ | |
| FR-23 | Plain stop (market) GTC via existing submission | ✅ | `submitStopWithRetry` → `submitStopOrder` (type `stop`, `gtc`); asserted `submitStopLimitOrder` not called. GTC itself comes from the unchanged function, not asserted (mocked) |
| FR-24 | Cancel previous order before replacing | ✅ | |
| FR-25 | Cancel trailing order, else Capa A | ✅ | tested both |
| FR-26 | Clear `stopOrderId` when Capa A cancelled | ✅ | tested |
| FR-27 | No submit when cancel failed | ✅ | tested |
| FR-28 | `trailing_stop_naked` alert on cancel/submit failure | ✅ | cancel path tested; submit-failure path shares the same helper but has no dedicated test |
| FR-29 | Persist new order id | ✅ | |
| FR-30 | Persist `trailingStopOrderId: null` on submit failure | ✅ | by code; not separately tested |
| FR-31 | Persist `trailingStop` / `trailingActivated:true` while active | ✅ | |
| FR-32 | Persist `highSinceEntry` every check | ✅ | all branches |
| FR-33 | No cancel/create at unchanged price with order registered | ✅ | tested (equal and sub-tick) |
| FR-34 | Place stop when active and no order id | ✅ | self-heal tested |
| FR-35 | No broker order moves when `exitReason` already set | ✅ | tested with profit target and z-score exit |
| FR-36 | Still persist high in that case | ✅ | tested |
| FR-37 | Exit text `Exit rule: profit floor $X (+Y%) breached` | ✅ | exact string asserted |
| FR-38 | Close via `closePosition` | ✅ | tested |
| FR-39 | `toExitReason` → `TRAILING_STOP` | ✅ | asserted through `exitReasons` |
| FR-40 | Cooldown class `nextTradingDay1` | ✅ | existing `computeCooldownUntil` mapping for `TRAILING_STOP`; unchanged and not re-asserted here |
| FR-41 | Floor text not caught by earlier branches | ✅ | check placed first |
| FR-42 | Initial stop unchanged | ✅ | entry/Capa A code not in the diff |
| FR-43 | Capa B unchanged | ✅ | `enforceStopLosses` not in the diff |
| FR-44 | Other setups' activation/distance/order type/floor unchanged | ✅ | values moved verbatim; MR keys removed from local maps |
| FR-45 | Other setups: stop rounded down | ✅ | tested (106.7444 → 106.74) |
| FR-46 | Other setups: replace only when ≥1 tick higher | ✅ | tested |
| FR-47 | Open positions apply from next check using stored high | ✅ | `ctx.highSinceEntry` is the base |
| FR-48 | No protection between -5% and +5% added | ✅ | inactive path persists only the high |
| FR-49 | No order blocks the 10% target | ✅ | floor is a stop below price; target exit still precedes it |
| FR-50 | `protectiveStop` shape in `indicators` JSONB | ✅ | `design:'R'`, all fields asserted |
| FR-51 | `activatedAt` = first activation | ✅ | cycle timestamp |
| FR-52 | `activatedAt` preserved | ✅ | tested |
| FR-53 | Refreshed when stop moves | ✅ | place/replace/self-heal; not rewritten when unchanged |
| FR-54 | Other `indicators` keys untouched | ✅ | read-modify-write merge in `db.ts` (no dedicated DB test) |
| FR-55 | Persist failure does not abort | ✅ | tested |
| FR-56 | 1-min regular-session high since previous check | ⚠️ | Approximated: window = `max(buyTimestamp, now−18h)` because no last-check timestamp is stored (agreed in O-2). Misses only the ~5 min after the Friday 15:55 ET sweep |
| FR-57 | Never lowers high | ✅ | tested |
| FR-58 | ≤1 extra bars request per position per check | ✅ | one call, MR only; tested |
| FR-59 | Fallback on bars failure | ✅ | tested |
| FR-60 | Unchanged sampling if not authorized | ➖ | N/A — O-2 was authorized |
| FR-61 | "Profit lock inactive - activates at +5%" | ✅ | tested |
| FR-62 | "Floor $X (+Y%)" | ✅ | tested ($105.14 → +5.14%) |
| FR-63 | Other setups keep trail texts | ✅ | tested |
| FR-64 | Shared activation config in the table | ✅ | local `ACTIVATION_PCT` removed |
| FR-65 | Per-setup profit target in the table | ✅ | not covered by a rendering test |
| FR-66 | API returns per-setup target | ✅ | `profitTargetPct` in percent |
| FR-67 | Log card target per setup | ✅ | setup from `signal_type` or parsed `signalType=`; not rendering-tested |
| FR-68 | "Floor" label for MR | ✅ | `parseEntry` tested; label swap by code |
| FR-69 | HOLD text includes `profitFloor=$X` | ✅ | tested |

NFR-01 ✅ · NFR-02 ✅ · NFR-03 ⚠️ (see MEDIUM-2) · NFR-04 ✅ · NFR-05 ✅ (no new dependency) · NFR-06 ✅ by code (see LOW-2).

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized (brief + O-7): trailing block, `toExitReason`, `PROFIT_TARGET_PCT` removal, HOLD text, imports, helper functions. Entry, sizing, Capa A/B, SYSTEM_PROMPT and Claude output schema not in the diff |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

Other modified files, all listed in design.md and approved in the O-1/O-2 answers: `db.ts`, `types.ts`, `alpaca.ts`, `api/positions/route.ts`, `PositionsTable.tsx`, `AgentReasoningLog.tsx`. No migration, workflow or `.env` change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Only the deterministic exit engine changed; Claude's action override, prompt and output schema are untouched |
| Supabase patterns | ✅ | New function in `db.ts`, errors thrown on both read and update, no `any` (uses `Record<string, unknown>`), not imported by client code, no new table. No `.limit()`, but both queries are filtered by `symbol` and use `.single()` |
| TypeScript quality | ⚠️ | No `any`, pure/immutable new module, named constants. `applyProfitFloor` is 52 lines (MEDIUM-2); `db.ts` is 832 lines (was ~813) |
| Security | ✅ | No secrets; only `console.warn`/`error` with symbol and error objects |

## Task Checklist

- Implementation tasks T-01…T-27: 27/27 completed
- Pre-Implementation: all checked (line 8 had a malformed `[x ]`; fixed)
- Post-Implementation: the `/review` and Protected Zone items ticked by this report; the rollback item ticked on code evidence (LOW-2)

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **No outlier guard on the 1-minute high (design risk R-4).** A bad SIP print becomes the permanent `highSinceEntry` (it never lowers) and sets the floor from it. If price is then below that floor, `sell_now` closes the position early. Mitigation options: require minimum bar volume, or cap the peak at a multiple of the daily range. Not implemented because the spec only proposed it.
2. **`applyProfitFloor` is 52 lines** (limit 50). Extracting the sell-now branch into its own small function fixes it.
3. **`db.ts` is 832 lines** (limit 800). It was already over before this change (+19 lines here); a split belongs in a separate refactor.

### LOW (optional)
1. Submit-failure path (`naked` outcome) and the `db.ts` merge have no dedicated test; they share code with covered paths.
2. The rollback (`PROFIT_FLOOR_CONFIG = {}`) is verified by reading, not by test. With an empty config, MR takes the legacy ATR path, and the remaining defaults (activation 5%, ATR multiple 1.2) equal the previous MR values. Behaviour would differ only by the new tick rounding. The config is a module constant, so an agent-level test would need a module mock.
3. Already-activated MR positions with a legacy ATR stop-limit keep it until the floor is strictly higher (O-4, accepted). UUUU is inactive, so this is a no-op today.
4. Other setups: if `closePosition` fails after the trailing stop rose, the broker order stays stale until the exit is retried. The persisted stop already moved, so the order is not re-placed in the interim.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit once Amaury has read the three MEDIUM notes. Nothing has been committed.
