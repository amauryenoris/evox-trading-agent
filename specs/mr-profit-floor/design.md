# Design — MEAN_REVERSION Profit Floor

## Architecture Decision

The floor rule is a pure function in a new client-safe module `src/lib/protective-stop.ts` (config, `computeProtectiveStop`, per-setup profit target, shared trailing-activation table). `enforceExitRules()` in `claude-agent.ts` calls it for `MEAN_REVERSION` only, inside the existing trailing block, in place of the ATR math; all other setups keep the current code path with two hardening changes (tick rounding and strictly-higher replacement). The broker side reuses the existing cancel / submit / naked-alert machinery with a plain `stop` GTC order via `submitStopWithRetry` → `submitStopOrder`. The state reuses the existing columns `trailing_stop`, `trailing_activated`, `trailing_stop_order_id`, so Capa A/B, ghost-close detection (`trailingStopOrderId` match) and the cooldown path keep working unchanged. The dashboard imports the same module, which removes the manually mirrored `ACTIVATION_PCT` and the fixed `10`.

Findings from reading the code that shape this design:
- The trailing block is `claude-agent.ts:339-504`. It sits inside `if (atr valid) … else` so today **no ATR means no trailing**; the MR branch must be taken before that guard (FR-20).
- Today the block moves broker orders **before** the PASO 5 exit check and ignores `exitReason` set by target / 20-day / setup exits (FR-35 fixes this for the new code and for other setups' order moves is **not** changed beyond rounding — see Open Question O-8).
- `highSinceEntry` is `max(stored, position.current_price)`, one sample per cycle.
- `updatePositionContext` (`db.ts:210-225`) writes only 5 columns; it never writes `indicators`.
- `toExitReason()` (`claude-agent.ts:170-185`) matches substrings of the upper-cased text; `'TRAILING_STOP'` maps to cooldown `nextTradingDay1` (`claude-agent.ts:147-149`, ghost-close at `:1562-1570`).
- `getBars` (`alpaca.ts:76`) accepts only `'1Day' | '1Hour' | '5Min'`, a day-granularity `start`, feed `sip` already.
- `PROFIT_TARGET_PCT` is a local const at `claude-agent.ts:285-288`; the dashboard hardcodes 10 in `PositionsTable.tsx:28` and `AgentReasoningLog.tsx:384`.

## Data Flow

1. `enforceExitRules` loads ctx; universal and setup exits run first and may set `exitReason` (target, 20 days, z-score, EMA, SMA5).
2. Update `highSinceEntry = max(stored, current)` (optionally from 1-min bars if O-2 is authorized).
3. If `signalType === 'MEAN_REVERSION'`:
   1. `computeProtectiveStop({ setup, entry, high, current, existingStop: ctx.trailingStop })`.
   2. If `exitReason` is already set → persist `highSinceEntry` only, no broker call.
   3. `'sell_now'` → `exitReason = "Exit rule: profit floor $X (+Y%) breached"` → existing `closePosition` path (`cancel_orders=true`) → cooldown `TRAILING_STOP` / next trading day.
   4. `'place'` / `'replace'` → cancel registered order (trailing id, else Capa A id) → `submitStopWithRetry` (stop market GTC) → persist `trailingStopOrderId` (+ clear `stopOrderId` if Capa A was cancelled), `trailingStop`, `trailingActivated`, and `protectiveStop` JSONB (O-1).
   5. `'none'` → no broker call; self-heal places a stop only if no `trailingStopOrderId` is registered.
4. Other setups: existing ATR trailing, but `trailingStop` rounded down to the tick and replacement only when `rounded > previous + 1 tick`.
5. Dashboard: `/api/positions` returns `profitTargetPct` (from `protective-stop.ts`) + existing `trailingStop` / `trailingActivated`; `PositionsTable` renders "Profit lock inactive - activates at +5%" or "Floor $X (+Y%)" for MR.

Formula check against the required cases (entry E, floor = E×(1+max(3, highPct−3)/100)): +5.5% → +3.00%; +6% → +3%; +7% → +4%; +8.14% → +5.14%; +12% → +9%.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New pure module + MR branch in the trailing block | Unit-testable, client-safe, `{}` is rollback, minimal Protected Zone diff | Two code paths in the block until other setups migrate | **Chosen** |
| Put constants in `config.ts` | Single config file | Needs a Protected Zone change in a file with live trading parameters; not client-safe if it grows server imports | Rejected |
| Parametrize the ATR formula (distance = f(setup)) | One path | Different semantics (stop-limit, ATR-based, floor at buy price); risks touching other setups | Rejected |
| Persist `protectiveStop` through a new merge function in `db.ts` (`indicators` jsonb already exists) | No schema change, comparable later with `trade_evaluations`, same mechanism as `fillAttempts` | Needs `db.ts` + `types.ts` edits → triggers fail-fast | **Proposed — needs approval (O-1)** |
| Persist `protectiveStop` in `agent_log` instead | No `db.ts` change | Not the mechanism requested; not attached to the position row | Rejected |
| Atomic Alpaca PATCH order replace | Removes the no-stop window | New broker API usage, out of scope | Rejected (out of scope) |
| Sample 1-minute highs from a stored last-check timestamp | Exact "since last check" | No such timestamp is stored; would need a new column | Rejected |
| Sample 1-minute highs since `max(buyTimestamp, today's session open)` — one call | One call, no new storage, covers everything not seen by earlier checks (overnight has no regular-session prints) | Needs additive `getBars` change (`'1Min'`, timestamp start) | **Proposed (O-2)** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/protective-stop.ts | CREATE | `PROFIT_FLOOR_CONFIG`, `computeProtectiveStop`, `tickFor`/rounding, `PROFIT_TARGET_PCT` + `getProfitTargetPct`, shared `TRAILING_ACTIVATION_PCT` (values unchanged, moved from `claude-agent.ts` / `PositionsTable.tsx`) |
| src/lib/claude-agent.ts ⚠️ | MODIFY (Protected) | MR branch in trailing block before the ATR guard; `exitReason` guard on order moves; sell-now text; `toExitReason()` mapping; tick rounding + strictly-higher check for other setups; import shared profit target and activation table; remove dead MR keys from local ATR/activation maps; HOLD text gets `profitFloor=$X` (O-7) |
| src/lib/db.ts | MODIFY (pending O-1) | New function to merge `protectiveStop` into `open_position_contexts.indicators` (read from ctx, write jsonb); `updatePositionContext` untouched |
| src/lib/types.ts | MODIFY (pending O-1) | `TechnicalIndicators.protectiveStop?` + `ProtectiveStopSnapshot` type; `PositionDisplay.profitTargetPct` |
| src/lib/alpaca.ts | MODIFY (pending O-2) | Additive: `getBars` accepts `'1Min'` and an ISO `start`, used only by the peak sampling |
| src/app/api/positions/route.ts | MODIFY | Add `profitTargetPct` |
| src/components/dashboard/PositionsTable.tsx | MODIFY | Drop local `ACTIVATION_PCT`; import shared config; MR texts; per-setup profit target |
| src/components/dashboard/AgentReasoningLog.tsx | MODIFY | Target text (~384) per setup parsed from `signalType=`; "Floor" label (~406-416) for MR; regex for `profitFloor=` |
| src/lib/__tests__/protective-stop.test.ts | CREATE | Pure function cases (see tasks) |
| src/lib/__tests__/mr-profit-floor-exit-rules.test.ts | CREATE | `enforceExitRules` mocks, modeled on `trailing-stop-exit-reason-guard.test.ts` |
| src/lib/__tests__/protective-stop-persistence.test.ts | CREATE | Persisted shape (pending O-1) |
| src/lib/__tests__/positions-dashboard-texts.test.ts | CREATE | Dashboard texts (static render; fallback in tasks) |
| Existing trailing/exit tests (`trailing-stop-exit-reason-guard`, `trend-zle05-exit-rules-trial`) | MODIFY if needed | Only to follow the tick rounding / import move; behavior assertions unchanged |

## Protected Zone Impact

- ⚠️ `src/lib/claude-agent.ts` — authorized in the brief for the trailing block (~:339-504), the sell-now path, and (named in ALLOWED #2) `toExitReason()`. **Edits outside that range are also needed** and are listed in O-7 so Amaury can confirm them explicitly: the `PROFIT_TARGET_PCT` const at ~:284-293 (replaced by the shared import), the HOLD reasoning string at ~:513, and the import block.
- `config.ts`: **not touched** (constants live in `protective-stop.ts`).
- No other Protected Zone file is touched.
- ⚠️ Requires Amaury confirmation before implementation.

## Database Changes

None to the schema and no migration. `open_position_contexts.indicators` is already `jsonb`; the only gap is code: `updatePositionContext` never writes it (see O-1). Existing columns used: `trailing_stop`, `trailing_activated`, `trailing_stop_order_id`, `stop_order_id`, `high_since_entry`.

## Fail-Fast Assessment (for Amaury)

- **FAIL FAST #1 (block cannot take the function):** not triggered. The MR branch fits inside the block if it is taken before the `if (!atr …)` guard; no restructure outside the block is required.
- **FAIL FAST #2 (db.ts / types.ts):** **triggered** for the `protectiveStop` JSONB — `updatePositionContext` cannot write `indicators`, and `TechnicalIndicators` has no `protectiveStop` field. `trailing_stop_order_id` and `stop_order_id` need no change. Per the brief, implementation of the persistence tasks stops until O-1 is answered; the rest can proceed.

## Risks

- R-1: Cancel-then-create still leaves a short no-stop window on each real stop move; the strict-higher rule removes the redundant moves only.
- R-2: A new stop is rejected by Alpaca if the market moved to or through it between the cycle's price read and submission. Handled by the existing retry + naked alert; the next check either re-places (`needsSelfHeal`) or fires `sell_now`.
- R-3 (accepted by Amaury): margin 3 stops out MP/NOW-type runners early.
- R-4: A bad SIP print in the 1-minute bars (O-2) could ratchet the floor too high and trigger `sell_now`; mitigation proposal: take the high from regular-session bars only and never from a bar with zero/odd volume — confirm if desired.
- R-5: `claude-agent.ts` is far above 800 lines; the change must be net-small and avoid growing the block (new logic goes in the pure module).

## Open Questions

- **O-1 (BLOCKER — fail-fast #2): persistence of `protectiveStop`.** Authorize (a) a new function in `db.ts` that merges `protectiveStop` into `indicators`, and (b) the `types.ts` field? Recommended: yes, no schema change. If no: drop FR-50…FR-55 and derive comparison data from the columns + agent_log.
- **O-2: Peak accuracy.** Not possible within the stated budget as written: `getBars` has no `'1Min'` and no last-check timestamp is stored. Proposal: one `'1Min'` call from `max(buyTimestamp, today's session open)`, requiring an additive `getBars` change in `alpaca.ts` (not Protected, not forbidden, not in ALLOWED). Authorize? If no: sampling stays once per cycle and I will say so in the report (FR-60).
- **O-3: Entry basis.** `entry` = `position.avg_entry_price` (matches `pnlPct` and the activation test) with `ctx.buyPrice` as fallback, or `ctx.buyPrice` (what the current floor uses)? Recommended: `avg_entry_price`.
- **O-4: Already-activated MR positions.** If an MR position already has `trailingActivated=true` with an ATR stop-limit order, `existingStop = ctx.trailingStop` keeps it until the floor is strictly higher, then it is replaced by a plain stop. Confirm that is acceptable (the brief says only UUUU is open and inactive, so this is likely a no-op today).
- **O-5 (assumption A-2):** tick below $1 is 0.0001 (Alpaca sub-dollar rule); the brief only defines 0.01 at or above $1.
- **O-6 (assumption A-3):** the other setups' activation table moves unchanged into `protective-stop.ts` so the dashboard can import it; their values do not change.
- **O-7 (Protected Zone, explicit confirmation):** confirm the edits outside :339-504 — `PROFIT_TARGET_PCT` at ~:284-293, the HOLD reasoning string at ~:513 (adds `profitFloor=$X` so the log can show "Floor"), and imports.
- **O-8: Order moves vs earlier exits for other setups.** The brief orders "do not move broker orders when another exit already set exitReason" under the MR bullet; the limit for other setups is only "rounded + strictly higher". Apply the exitReason guard to other setups too (small, safe, but a behavior change to their trailing block) or MR only? Recommended: apply to all — a position about to be closed by `closePosition(cancel_orders=true)` gains nothing from a cancel/create first. Default if unanswered: MR only.
- **O-9: Limit price for other setups.** After rounding the stop, the stop-limit's limit (`stop × 0.995`) is also rounded down to the tick (sub-penny limits are rejected by Alpaca). Assumed yes.
