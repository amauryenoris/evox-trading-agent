# Requirements — Central ACTIVE_SETUPS List, Fix Setup-Name Drift

## Background

No single clean list of the 5 live setups exists today. Verified against the live codebase (2026-09-25):

- `types.ts:137` `SignalType` — stale, values (`'MEAN_REVERSION' | 'TREND_FOLLOWING' | 'PULLBACK_EMA50' | 'OTHER'`) match no live setup. Feeds `AgentDecision.signal_type` (`types.ts:158`), which is populated only if Claude's own JSON response happens to include the field — Claude's documented output schema (CLAUDE.md) has no `signal_type` key, so this field is effectively always `undefined` in practice.
- `types.ts:195` (`OpenPositionContext.signalType`) and `types.ts:212` (`TradeEvaluation.signal_type`) both carry a `'TREND'` literal alongside the 5 real names (6 values). Confirmed this is **not** dead: `claude-agent.ts:294-295` has a live exit-rule branch — `if (!exitReason && (signalType === 'TREND' || signalType === 'TREND_PULLBACK' || signalType === 'TREND_ZLE05'))` — explicitly commented `// Trend exits (covers legacy TREND + new TREND_PULLBACK + TREND_ZLE05)`. `db.ts:192` and `db.ts:335` also cast Supabase rows into these two fields using the same 6-value list. This is intentional backward compatibility for positions opened before the `TREND` → `TREND_PULLBACK` rename, not a bug.
- `types.ts:403` (`NearMissEntry.signal_type`) — already the accurate 5-value list, no `'TREND'`. Left untouched.
- `gate-importance.ts:5-10` (`DIMENSION_IMPORTANCE`) — missing `TREND_PULLBACK_3DAY` entirely (predates that setup). Confirmed shape: `Record<string, Record<string, GateImportance>>` where `GateImportance = 'hard-gated' | 'soft-referenced' | 'not-gated'` (a 3-value enum, not a numeric scale).

The 5 live setups, confirmed via `claude-agent.ts:1873-1883`'s selector and each setup's own boolean:
`TREND_PULLBACK_3DAY`, `MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`. All 5 start active by default — no on/off logic exists yet (future `/settings` feature, out of scope here).

`DIMENSION_IMPORTANCE` feeds `compareFingerprints()` in `learning.ts`, which builds the "RECENT TRADE LESSONS" text shown to Claude. Confirmed prior behavior for a setup missing from the table: `compareFingerprints()` does `DIMENSION_IMPORTANCE[current.signal_type ?? '']` and `DIMENSION_IMPORTANCE[historical.signal_type ?? '']`, then `if (!currentImportance || !historicalImportance) return null` (`learning.ts:313-315`). Since `TREND_PULLBACK_3DAY` isn't a key today, either lookup is `undefined` whenever either side of a comparison is a `TREND_PULLBACK_3DAY` trade — `compareFingerprints()` returns `null`, and `buildRecentTradeLessonsLines()` (`learning.ts:346-352`) simply omits the "Context vs. current trade: ..." line for that trade. The trade's symbol/outcome/P&L line and its `lessonsLearned` bullets still render normally — only the dimension-comparison sentence is missing.

Confirmed `TREND_PULLBACK_3DAY`'s entry condition (`claude-agent.ts:1711-1728`): `prevClose > sma200` (uptrend) AND `prevClose < closeMinus2 < closeMinus3 < closeMinus4` (3 consecutive lower closes). It reads none of `adx`, `macd`, or the Kalman z-score. It also never reads `indicators.marketRegime` — the same field `gate-importance.ts`'s `regime` dimension represents (confirmed via `learning.ts:301-305`'s `getFingerprintDimensionValue()`, which maps `regime` → `fp.market_regime`, populated from `indicators.marketRegime: 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'TRANSITION'`). Only `MEAN_REVERSION`'s gate (`mrRangingAdxGateOk`, `claude-agent.ts:1693-1699`) reads `indicators.marketRegime` directly, which is why it alone is `'hard-gated'` on `regime` in the existing table. `TREND_PULLBACK`, `TREND_ZLE05`, and `EMA_RECLAIM` all require an uptrend structurally (via EMA50/EMA200 relationships) but never read `indicators.marketRegime`, so they're all `'not-gated'` on `regime` — `TREND_PULLBACK_3DAY` follows the identical pattern.

A second guaranteed compile-error site was found and folded into scope: `src/app/api/system-status/route.ts:31-32` compares `AgentDecision.signal_type` against the stale `'TREND_FOLLOWING'`/`'PULLBACK_EMA50'` values. Once `SignalType` is corrected to the 5 real names, this becomes a TS2367 "no overlap" error. This file is not Protected Zone (`src/app/api/**` is freely touchable).

**Resolved via user decision (2026-09-25):** the `'TREND'` literal in `OpenPositionContext.signalType` / `TradeEvaluation.signal_type` stays — it is not removed. It is documented in place as intentional legacy compatibility. This keeps `claude-agent.ts:295` (Protected Zone) and `db.ts:192`/`:335` untouched.

---

## Functional Requirements

FR-01: The system shall define a single exported list of the 5 live setups (`ACTIVE_SETUPS`) in a new file `src/lib/setups.ts`.

FR-02: Where an entry exists in `ACTIVE_SETUPS`, the system shall include a `name` (the exact string used elsewhere in the codebase), a short plain-language `criteria` description, and an `active` field.

FR-03: The system shall set `active: true` for all 5 entries in `ACTIVE_SETUPS`.

FR-04: The system shall export a `SetupName` type derived from `ACTIVE_SETUPS`'s `name` values (e.g. `(typeof ACTIVE_SETUPS)[number]['name']`), matching the derivation pattern already used in this codebase (`DashboardTabs.tsx:14`, `PnLChart.tsx:34`).

FR-05: Where `AgentDecision.signal_type` is typed via `SignalType` (`types.ts:137`), the system shall restrict `SignalType`'s values to the 5 live setup names, derived from `setups.ts`'s `SetupName` type.

FR-06: The system shall update `system-status/route.ts:31-32`'s stale `'TREND_FOLLOWING'` / `'PULLBACK_EMA50'` comparison to reference real trend-setup names, to prevent a guaranteed compile error once `SignalType` narrows (FR-05).

FR-07: The system shall document the `'TREND'` literal in `OpenPositionContext.signalType` (`types.ts:195`) and `TradeEvaluation.signal_type` (`types.ts:212`) with a comment identifying it as an intentional legacy-compatibility value (positions opened before the `TREND` → `TREND_PULLBACK` rename), consumed by `claude-agent.ts:295`. The system shall not remove this literal from either type in this change.

FR-08: The system shall add a `TREND_PULLBACK_3DAY` entry to `DIMENSION_IMPORTANCE` (`gate-importance.ts`) with `adx`, `macd`, `z`, and `regime` values derived from `TREND_PULLBACK_3DAY`'s own entry-condition code (`claude-agent.ts:1711-1728`), not copied from any other setup's row.

FR-09: The system shall include a code comment on the new `DIMENSION_IMPORTANCE` entry stating the weighting is derived directly from `TREND_PULLBACK_3DAY`'s entry-condition code and should be revisited once the setup reaches n>=20-30 closed trades (currently n=13).

---

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero errors after the change.

NFR-02: The existing test suite (`npm test`) shall pass with no regressions.

NFR-03: The change shall not alter setup-detection logic, execution gates, exit rules, or position sizing.

NFR-04: The change shall not alter `compareFingerprints()`'s output for any setup other than `TREND_PULLBACK_3DAY`.

---

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) without explicit confirmation from Amaury. None of the requirements above require touching these files.

C-02: No on/off gating, filtering, or branching logic shall be added based on the `active` field — every setup stays fully live regardless of its value in this change.

C-03: `stock-selector.ts` and the Buy Scanner prompt shall not be touched.

C-04: `ACTIVATION_PCT` / `ATR_MULT` (`claude-agent.ts:319-336`), including their own stray `'TREND'` key, shall not be modified.

C-05: `NearMissEntry.signal_type` (`types.ts:403`) shall not be modified — it is already correct.

C-06: `TREND_PULLBACK_3DAY`'s `DIMENSION_IMPORTANCE` weights shall not be copied from `TREND_ZLE05` or any other setup's row.

C-07: `risk-manager.ts` and `indicators.ts` shall not be touched.

C-08: `learning.ts` shall not be touched — only the data `gate-importance.ts` exports to it changes.

---

## Out of Scope

- On/off setup toggling (future `/settings` feature)
- `stock-selector.ts` / Buy Scanner prompt changes (follow-up change)
- Any change to `claude-agent.ts`'s setup-detection or exit-rule logic
- Removing `'TREND'` from `OpenPositionContext.signalType` / `TradeEvaluation.signal_type` (deferred — would require touching `claude-agent.ts:295` and `db.ts:192`/`:335`)
- Migrating `NearMissEntry.signal_type` to the shared `SetupName` type
- Cleaning up `ACTIVATION_PCT` / `ATR_MULT`'s stray `'TREND'` key
