# Requirements — Fix: checkAutoEntry() Bypasses MR_RANGING_ADX_GATE

## Context (from prior diagnostics — see `specs/` session history, not re-verified here)

Confirmed live incident: NVDA bought 2026-06-29T15:30:30Z via the near-miss auto-entry path
with `signal_type=null`, `marketRegime=RANGING`, `adx=17.17` — the exact disqualifying
condition (`RANGING` + `ADX < 18`) that `MR_RANGING_ADX_GATE` exists to block in the main
analysis loop. Root cause: `setup_detected = isAutoEntry || meanReversionSetup || ...`
(`claude-agent.ts:1490`) — when `isAutoEntry=true`, `setup_detected` becomes `true`
regardless of `meanReversionSetup`, which structurally skips the `if (!setup_detected)`
block (`claude-agent.ts:1566-1590`) where `MR_RANGING_ADX_GATE`'s HOLD decision is generated.
`checkAutoEntry()` (`watchlist-monitor.ts:145-187`) never independently enforces this gate —
it only checks z-score-vs-threshold, a regime check that no-ops for `signal_type=null`, and
position count.

## Functional Requirements

FR-01: The system shall exclude a near-miss entry from `readyForEntry` when `entry.signal_type === 'MEAN_REVERSION'` AND the current `marketRegime` for that symbol is `'RANGING'` AND the current ADX is a finite number less than `18`.

FR-02: The system shall exclude a near-miss entry from `readyForEntry` when `entry.signal_type === null`.

FR-03: The system shall continue to apply the existing `currentZScore <= threshold` check unchanged, as an additional (not replacement) condition.

FR-04: The system shall continue to apply the existing `regimeOk` check unchanged, as an additional (not replacement) condition.

FR-05: The system shall continue to apply the existing `openPositionsCount < maxPositions` check unchanged, as an additional (not replacement) condition.

FR-06: The system shall NOT apply the ADX/RANGING exclusion (FR-01) to any `signal_type` other than `'MEAN_REVERSION'` — `'TREND_PULLBACK'`, `'TREND_ZLE05'`, and `'EMA_RECLAIM'` entries are unaffected by FR-01.

FR-07: The system shall log a skip message in the form `[AUTO-ENTRY] {symbol}: skipped — MR_RANGING_ADX_GATE (ADX={adx} < 18, regime=RANGING)` whenever FR-01 excludes a symbol.

FR-08: The system shall log a skip message in the form `[AUTO-ENTRY] {symbol}: skipped — signal_type is null, no named setup` whenever FR-02 excludes a symbol.

FR-09: The system shall read the current-cycle ADX from the existing `currentIndicators` parameter already passed into `checkAutoEntry()` — no new data fetch shall be introduced.

## Non-Functional Requirements

NFR-01: After implementation, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After implementation, `npm run build` shall complete successfully.

NFR-03: The change shall touch exactly one source file: `src/lib/watchlist-monitor.ts`.

NFR-04: The ADX floor value (`18`) shall be defined as a local constant inside `watchlist-monitor.ts` with a comment noting it must stay in sync with `mrRangingAdxFloor` in `claude-agent.ts` — it shall not be imported cross-module from `claude-agent.ts`.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. `src/lib/watchlist-monitor.ts` IS in the Protected Zone — confirmation required before implementation.

C-02: `src/lib/claude-agent.ts` shall not be modified — `setup_detected`, `mrRangingAdxGateOk`, and all other gate logic in that file remain untouched.

C-03: The existing `regimeOk` logic (`signal_type === 'MEAN_REVERSION' ? regime === 'RANGING' : true`) shall not be modified or replaced — the new checks are additive.

C-04: The existing `currentZScore <= threshold` and `openPositionsCount < maxPositions` conditions shall not be modified.

C-05: `near_miss_watchlist` schema/columns shall not be modified — no migration.

C-06: `src/lib/db.ts`, `src/lib/types.ts`, and `src/lib/learning.ts` shall not be modified.

## Out of Scope

- Any change to `claude-agent.ts`'s `setup_detected` composition or `MR_RANGING_ADX_GATE`'s own condition.
- Extending the ADX/regime exclusion to `TREND_PULLBACK`, `TREND_ZLE05`, or `EMA_RECLAIM` signal types (their own quality gates — e.g. `TREND_QUALITY_FAIL` — already run unaffected for auto-entries, per prior diagnostic).
- Backfilling or correcting the NVDA position already opened — this spec only prevents recurrence.
- Any dashboard/UI surfacing of skipped auto-entries.
- Consolidating the duplicated `18` ADX-floor constant between `claude-agent.ts` and `watchlist-monitor.ts` into a shared module — explicitly deferred (NFR-04 keeps them as two independently-maintained literals with a sync-reminder comment).
