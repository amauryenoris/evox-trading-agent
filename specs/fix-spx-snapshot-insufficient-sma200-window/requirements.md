# Requirements — Fix SPX Snapshot Insufficient SMA200 Window

## Diagnostic findings (STEP 0 — see conversation for full verbatim detail)

- `src/lib/claude-agent.ts:870`: `getBars('SPY', '1Day', 260)` requests **260 calendar days** of SPY daily bars. NYSE trading days are ≈69% of calendar days, so this yields only **~179-185 trading-day bars** — structurally insufficient for the 200-period SMA `computeSpxSnapshot()` requires.
- `src/lib/claude-agent.ts:832-847` (`computeSpxSnapshot`/`smaAt`): with `refIndex ≈ 177-183` and `period-1 = 199` for the 200-SMA, `smaAt()` returns `null` for `spx_sma200` on every call. The function's early-return branch (line 845-847) then also **discards the successfully-computed `spx_sma50`**, hardcoding `spx_sma50: null` in the response — so all three of `spx_sma50`/`spx_sma200`/`spx_regime` come back null while `spx_price` (set unconditionally at line 830) survives.
- This is **deterministic and affects 100% of cycles** — not an intermittent fetch failure, not a regression. `git log -p` confirms `computeSpxSnapshot` and the `getBars('SPY', ...)` call have been unchanged since their original introduction in `3821ec9` (Macro-C Part 1).
- `trade_evaluations.spx_*` (written via `learning.ts:73-91` → `insertTradeEvaluation`) is a pure passthrough of `open_position_contexts.indicators.spx_*` at SELL time — it never recomputes independently. The previously merged propagation fix (`f21f042`, PR #6 / SF-C/SF-D) only copies whatever is already in `indicators` into dedicated columns; it cannot produce non-null values if the source was already null.
- `scripts/backfill-spx-regime.ts:74` (`earliest.setDate(earliest.getDate() - 400)`) uses a **400-calendar-day** window and successfully backfilled 35 historical trades with non-null regimes — confirming 400 days is a proven-sufficient margin for this exact SMA200 calculation, while 260 is not.

## Functional Requirements

FR-01: The system shall fetch SPY daily bars using a calendar-day lookback window sufficient to reliably yield at least 201 trading-day bars (200 for the SMA period + 1 for the `refIndex` offset).

FR-02: The system shall preserve the existing fail-open behavior (empty bars array on fetch failure → all four snapshot fields null) unchanged.

FR-03: The system shall preserve the existing no-lookahead-bias behavior (`refIndex = bars.length - 2`, excluding the current partial bar) unchanged.

FR-04: The system shall continue to compute `spx_price`, `spx_sma50`, `spx_sma200`, and `spx_regime` using the same formulas as today — only the bars-fetch window changes.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass after the change.

NFR-03: The chosen lookback value shall be justified by the same calendar-to-trading-day margin reasoning already proven correct in `scripts/backfill-spx-regime.ts`.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone) — requires explicit confirmation from Amaury before implementation.

C-02: This feature must not change `computeSpxSnapshot()`'s internal SMA/regime calculation logic, only the upstream bars-fetch parameter(s) needed to supply it with sufficient data.

C-03: This feature must not change `learning.ts`/`db.ts`/`types.ts` (the SF-C/SF-D propagation pipeline) — that pipeline is already correct; it simply has nothing valid to propagate today.

C-04: This feature must not introduce a second, independent SPY data source — the single `spyBars`/`spxSnapshot` computed once per `runAgentCycle()` remains the sole source of truth for both `open_position_contexts` and (downstream) `trade_evaluations`.

## Out of Scope

- The secondary behavior where `computeSpxSnapshot()` discards an already-computed `spx_sma50` whenever `spx_sma200` alone is insufficient (line 845-847 hardcodes `spx_sma50: null`). With FR-01 satisfied, this branch should no longer trigger under normal conditions — left unchanged to keep this fix minimal and focused on the proven root cause.
- Backfilling/recomputing historical `open_position_contexts`/`trade_evaluations` rows already affected by the insufficient window (separate concern — a backfill script already exists and was previously run for `trade_evaluations`; this spec does not extend it to `open_position_contexts`).
- Any change to the actual fail-open `.catch(() => [])` branch — already correct per FR-02.
- Any change to `scripts/backfill-spx-regime.ts` itself (already correct, used here only as a reference/validation point).
