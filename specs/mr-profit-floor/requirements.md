# Requirements — MEAN_REVERSION Profit Floor (activation +5%, floor +3%, ratchet margin 3 pp)

## Functional Requirements

### A. Pure module `src/lib/protective-stop.ts`

FR-01: The system shall export `PROFIT_FLOOR_CONFIG` with the single entry `MEAN_REVERSION: { activationPct: 5, floorPct: 3, ratchetPp: 3 }`.
FR-02: The system shall export `computeProtectiveStop({ setup, entry, high, current, existingStop })` returning `{ active, stopPrice, action }` where `action` is one of `'none' | 'place' | 'replace' | 'sell_now'`.
FR-03: The system shall return `active: false` and `action: 'none'` when `setup` has no entry in `PROFIT_FLOOR_CONFIG`.
FR-04: Where `PROFIT_FLOOR_CONFIG` is an empty object, the system shall return `active: false` and `action: 'none'` for every setup.
FR-05: The system shall return `active: false` and `action: 'none'` while `high < entry × (1 + activationPct/100)`.
FR-06: The system shall compute `stopPrice = entry × (1 + max(floorPct, highPct − ratchetPp)/100)` when active, where `highPct = (high / entry − 1) × 100`.
FR-07: The system shall round `stopPrice` down to the tick.
FR-08: The system shall use a tick of 0.01 for prices at or above $1.
FR-09: The system shall use a tick of 0.0001 for prices below $1 (assumption A-2, see design.md).
FR-10: The system shall never return a `stopPrice` lower than `existingStop` when `existingStop` is a finite number.
FR-11: The system shall return `action: 'place'` when active, `existingStop` is null or undefined, and `current > stopPrice`.
FR-12: The system shall return `action: 'replace'` when active, `existingStop` is a finite number, `current > stopPrice`, and the rounded `stopPrice` is higher than `existingStop` by at least one tick.
FR-13: The system shall return `action: 'none'` when active, `current > stopPrice`, and the rounded `stopPrice` is not higher than `existingStop` by at least one tick.
FR-14: The system shall return `action: 'sell_now'` when active and `current <= stopPrice`, where `stopPrice` is the value after the never-lower rule of FR-10.
FR-15: The system shall return `active: false` and `action: 'none'` when `entry`, `high` or `current` is not a finite positive number.
FR-16: The system shall not mutate its input arguments or `PROFIT_FLOOR_CONFIG`.
FR-17: The system shall export the per-setup profit target (10% default, 5% for `TREND_ZLE05`) from `protective-stop.ts`.
FR-18: The system shall make `protective-stop.ts` importable from client components without any server-only import.

### B. Exit engine (`src/lib/claude-agent.ts`, trailing block and sell-now path)

FR-19: The system shall evaluate the protective stop of a `MEAN_REVERSION` position with `computeProtectiveStop` instead of the ATR trailing activation and distance.
FR-20: The system shall evaluate the protective stop of a `MEAN_REVERSION` position even when ATR is null or not positive.
FR-21: The system shall pass the high since entry, already updated with the current price, as `high`.
FR-22: The system shall pass the persisted `trailingStop` as `existingStop`.
FR-23: The system shall submit the `MEAN_REVERSION` protective stop as a plain `stop` (market) GTC sell order through the existing stop-order submission path.
FR-24: The system shall cancel the previously registered sell order before submitting a replacement stop.
FR-25: The system shall cancel the registered trailing order if one exists, otherwise the initial (Capa A) stop order.
FR-26: The system shall clear `stopOrderId` in the persisted context when the Capa A order was the one cancelled.
FR-27: The system shall not submit a replacement stop when the cancellation failed.
FR-28: The system shall log a `trailing_stop_naked` alert when the cancellation or the submission failed.
FR-29: The system shall persist the new order id in `trailingStopOrderId` when the submission succeeded.
FR-30: The system shall persist `trailingStopOrderId: null` when the submission failed.
FR-31: The system shall persist `trailingStop` and `trailingActivated: true` whenever the protective stop is active.
FR-32: The system shall persist `highSinceEntry` on every check.
FR-33: The system shall not cancel or create any order when the action is `'none'` and a stop order id is registered.
FR-34: The system shall place a stop when the floor is active and no `trailingStopOrderId` is registered.
FR-35: The system shall not move any broker order when `exitReason` was already set earlier in the same run for that position.
FR-36: The system shall still persist `highSinceEntry` when `exitReason` was already set earlier in the same run.
FR-37: The system shall set `exitReason` to `Exit rule: profit floor $X (+Y%) breached` when the action is `'sell_now'` and no earlier exit has set `exitReason`.
FR-38: The system shall close the position through the existing `closePosition` path when `exitReason` is the profit-floor text.
FR-39: The system shall map the profit-floor exit text in `toExitReason()` to `'TRAILING_STOP'`.
FR-40: The system shall apply the `TRAILING_STOP` cooldown class (next trading day, `nextTradingDay1`) to a profit-floor exit.
FR-41: The system shall order the `toExitReason()` match so that the profit-floor text is not matched by any earlier branch.
FR-42: The system shall keep the initial stop at `currentPrice × 0.95`, as a stop (market) GTC order.
FR-43: The system shall keep the Capa B check (`price <= buyPrice × 0.95`) unchanged.
FR-44: The system shall keep the activation, distance, order type and buy-price floor of every setup other than `MEAN_REVERSION` unchanged.
FR-45: The system shall round down to the tick the trailing stop price of every setup other than `MEAN_REVERSION`.
FR-46: The system shall replace the trailing order of a setup other than `MEAN_REVERSION` only when its rounded stop is higher than the previous stop by at least one tick.
FR-47: The system shall apply the floor to already-open `MEAN_REVERSION` positions from the next check, using their stored `highSinceEntry`.
FR-48: The system shall not add any protection between the initial -5% stop and the +5% activation.
FR-49: The system shall not place any order that blocks the move to the profit target.

### C. Persisted comparison data (gated on open question O-1)

FR-50: The system shall store `protectiveStop = { design: 'R', activationPct, floorPct, ratchetPp, activatedAt, highPct, stopPrice, stopOrderId }` inside the `open_position_contexts.indicators` JSONB.
FR-51: The system shall set `activatedAt` to the ISO timestamp of the first activation.
FR-52: The system shall preserve `activatedAt` on later refreshes.
FR-53: The system shall refresh `protectiveStop` whenever the stop is placed or replaced.
FR-54: The system shall leave every other key of `indicators` unchanged when it writes `protectiveStop`.
FR-55: The system shall log and continue, not abort order handling, when persisting `protectiveStop` fails.

### D. Peak accuracy (conditional on open question O-2)

FR-56: Where the one-extra-bars-call budget is authorized, the system shall update `highSinceEntry` from the maximum 1-minute regular-session high observed since the previous check.
FR-57: The system shall not lower `highSinceEntry`.
FR-58: The system shall make at most one additional Alpaca bars request per open position per check.
FR-59: The system shall keep the per-cycle price sample when the bars request fails.
FR-60: The system shall leave the once-per-cycle sampling unchanged when O-2 is not authorized.

### E. Dashboard and API

FR-61: The positions table shall show "Profit lock inactive - activates at +5%" for an inactive `MEAN_REVERSION` position.
FR-62: The positions table shall show "Floor $X (+Y%)" for an active `MEAN_REVERSION` position.
FR-63: The positions table shall keep the current trail texts for every other setup.
FR-64: The positions table shall read the activation percentage from the shared config, not from its own copy.
FR-65: The positions table shall show the profit target of the position's setup instead of a fixed 10.
FR-66: The positions API shall return the profit target of each position's setup in `PositionDisplay`.
FR-67: The agent reasoning log shall show the profit target of the entry's setup in the Holding card.
FR-68: The agent reasoning log shall show "Floor" instead of "Trail" for a `MEAN_REVERSION` Holding card.
FR-69: The system shall include the floor value in the HOLD reasoning text of an active `MEAN_REVERSION` position (needs authorization O-7).

## Non-Functional Requirements

NFR-01: `computeProtectiveStop` shall be deterministic and side-effect free.
NFR-02: New code shall reach at least 80% coverage, and `protective-stop.ts` shall reach 100% of branches.
NFR-03: No function added or changed shall exceed 50 lines, and no file shall exceed 800 lines (`claude-agent.ts` is already above this and shall not grow beyond the net change this spec needs).
NFR-04: `tsc`, the full Vitest suite and `npm run build` shall pass.
NFR-05: The change shall add no dependency.
NFR-06: Setting `PROFIT_FLOOR_CONFIG` to `{}` shall be a complete rollback of the floor logic.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. Authorized for this spec: `src/lib/claude-agent.ts` (trailing block ~:339-504, the sell-now path and `toExitReason()`) and `config.ts` only if constants must live there (the design keeps them out of it).
C-02: No other Protected Zone file shall be touched (`risk-manager.ts`, `indicators.ts`, `learning.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `config.ts`).
C-03: Entries, sizing, the -5% initial stop, Capa B, profit-target values and the activation or distance of other setups shall not change.
C-04: The stop-limit vs stop-market choice of other setups shall not change.
C-05: No migration, workflow or learning-file change; no A/B split or live comparison group.
C-06: No live order is placed during implementation or verification.
C-07: If `trailing_stop_order_id`, `stop_order_id` or the `protectiveStop` JSONB needs a `db.ts` or `types.ts` change, implementation shall STOP and report. **This is already triggered for `protectiveStop`; see O-1.**
C-08: If the trailing block cannot take the pure function without restructuring more than that block, implementation shall STOP and report.

## Out of Scope

- Recording of closing fill prices (separate item).
- Any intermediate protection below +5%.
- Changing the profit-target values, other setups' trailing, or the initial stop.
- Replacing cancel-then-create with an atomic Alpaca order replace (the no-stop window remains, only the redundant replacements are removed).
- Backfilling `protectiveStop` for positions activated before this change.
