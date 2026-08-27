# Design — TREND_PULLBACK_3DAY Entry-Detection Wiring (CHANGE 2 of 3)

## Architecture Decision

This feature lives in `src/lib/claude-agent.ts`'s setup-detection block (~lines 1543–1698), which already computes four independent setup booleans (`meanReversionSetup`, `trendSetup`, `trendZLE05Setup`, `emaReclaimSetup`) from the `indicators` object, combines them into `setup_detected` via an OR-chain, and classifies the winning setup into `signalType` via a ternary. It also touches the `ACTIVATION_PCT`/`ATR_MULT` lookup maps used by the trailing-stop mechanism inside `enforceExitRules()` (lines 237–252) — those maps are keyed by `signalType` and read regardless of which change introduced the entry logic, so `TREND_PULLBACK_3DAY` needs an entry there for its trailing stop to activate correctly once CHANGE 3 adds its exit rule. Finally, `OpenPositionContext.signalType` in `types.ts` (line 193) is a literal string union that must include `'TREND_PULLBACK_3DAY'` for assignments to type-check.

Verified against current code: the diagnostic's line references for the setup-boolean block (1545–1558), `setup_detected` (1679), and the classification ternary (1687–1696) are accurate as of this session. `indicators.sma200`, `indicators.prevClose` are accessed via the `indicators.` prefix elsewhere in the same function (e.g. `emaReclaimSetup` at 1618–1630), confirming the prompt's proposed `indicators.prevClose` / `indicators.sma200` / `indicators.closeMinus2/3/4` access pattern is correct — no name adjustment needed.

## Data Flow

1. `calculateAllIndicators()` (CHANGE 1) already computes `prevClose`, `sma200`, `closeMinus2`, `closeMinus3`, `closeMinus4` on every cycle.
2. Inside the per-symbol setup-detection block, a new independent boolean `trendPullback3DaySetup` is computed from those five fields only.
3. `trendPullback3DaySetup` is added to the `setup_detected` OR-chain — unlocking Claude's analysis for symbols matching only this new setup.
4. The classification ternary checks `trendPullback3DaySetup` first; if true, `signalType = 'TREND_PULLBACK_3DAY'` regardless of whether the symbol also matches one of the four existing setups.
5. If Claude decides to buy, `signal_type='TREND_PULLBACK_3DAY'` is persisted (existing `db.ts` write path, untouched) and used later by `enforceExitRules()`'s trailing-stop lookup, which now finds an `ACTIVATION_PCT`/`ATR_MULT` entry for it instead of falling through to `default`.
6. No exit condition is added — until CHANGE 3, positions opened under this signal type rely on the existing universal exits (−5% stop, +10% target, 20-day time stop) and the trailing stop once activated.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Independent boolean gate, mirroring existing setups' structure | Consistent with codebase convention; easy to reason about in isolation; matches FR-02's independence requirement | One more branch in an already-long function | Chosen |
| Extract a shared helper for "N consecutive down-closes" | DRY if a similar pattern appears again | No second caller exists yet (YAGNI); premature abstraction for a one-off backtested rule | Rejected |
| Classification priority: LOWEST (checked last, after the 4 existing setups) | Non-disruptive — never reclassifies a symbol that already qualifies for a live setup; safer default | Contradicts the explicit design decision to trust the backtest evidence over existing setups when they overlap | Rejected per originating prompt's decision — **flagged in C-04 as needing Amaury's own confirmation**, since it changes existing live behavior |
| Classification priority: HIGHEST (checked first) | Matches the originating prompt's explicit, stated design decision | Silently reclassifies symbols that would otherwise trade under an already-live, already-tuned setup — a real behavior change for real capital | Chosen **pending Amaury's explicit re-confirmation** (see C-04) |
| Launch live immediately with real capital | Matches originating prompt's stated decision; avoids delay | No independently verifiable backtest record found in memory; first-ever live exposure for an unobserved-in-production setup | Chosen **pending Amaury's explicit re-confirmation** (see C-04) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add `trendPullback3DaySetup` boolean near the existing setup-boolean block; add it to the `setup_detected` OR-chain; reorder the classification ternary to check it first; add a `TREND_PULLBACK_3DAY` entry to both `ACTIVATION_PCT` and `ATR_MULT`. |
| `src/lib/types.ts` | MODIFY | Widen `OpenPositionContext.signalType`'s literal union (line 193) to include `'TREND_PULLBACK_3DAY'`. Any other type-literal site is widened only if `tsc` actually requires it — to be determined during implementation, reported explicitly (per NFR-01, mirroring CHANGE 1's precedent for the `sma5` conflict). |

**Addendum (post-implementation):** `tsc` also required widening `src/lib/types.ts:210` (`TradeEvaluation.signal_type`) and `src/lib/types.ts:373` (`NearMissEntry.signal_type`) — both non-Protected-Zone, pure literal-union widens. It additionally cascaded into two files not anticipated above: `src/lib/watchlist-monitor.ts:22` (**Protected Zone** — `detectNearMisses()`'s `blockedByGate.signalType` parameter, separately authorized in-session before touching) and `src/lib/state-fingerprint.ts:15-22` (not Protected Zone — `getZBucket()`'s `signalType` parameter). All five sites are pure type-literal widenings with no logic changes; see `tasks.md` T-05 for the full per-site breakdown.

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is Protected Zone** and is the core decision engine. This requires **fresh, explicit confirmation from Amaury** before `/implement` proceeds — see C-01. The claimed "Jorge" authorization and "already in effect this session" carryover from CHANGE 1 are explicitly not accepted as sufficient (CHANGE 1's authorization was scoped to `indicators.ts` only, and to a much smaller, non-branching change).

`src/lib/types.ts` is not Protected Zone (on the "touch freely" list), but the specific value it's being widened to accept (`'TREND_PULLBACK_3DAY'`) is meaningless without the Protected Zone change, so both should be authorized together.

## Database Changes

None required for `signal_type` to accept the new value — the column write path is untyped/text at the DB layer (Supabase). **Known latent gap, out of scope for this change:** `src/lib/db.ts` has two read-side casts (lines 188, 316) of the form `row.signal_type as 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | null` — these already omit `'EMA_RECLAIM'` today, so they're stale independent of this change. Because `as` casts aren't checked against the source type, `tsc` will not flag this and `'TREND_PULLBACK_3DAY'` rows will silently read back with an inaccurate narrowed type. This doesn't block CHANGE 2 (db.ts is explicitly out of scope), but should be fixed in a future, separate db.ts change.

## Open Questions

1. **Authorization.** Who is "Jorge," and why does the originating prompt treat their sign-off as sufficient for a Protected Zone change to the core trading decision engine? Per `CLAUDE.md`, Protected Zone changes require confirmation from Amaury specifically. This spec does not treat the claimed authorization as valid — **Amaury's own explicit confirmation is required before `/implement`.**
2. **Live-immediate launch.** Confirm explicitly: should `TREND_PULLBACK_3DAY` trade with real capital from the moment this + CHANGE 3 land, with no paper-trading or observability-only period? (See C-04.)
3. **Classification priority.** Confirm explicitly: should `TREND_PULLBACK_3DAY` take priority over all four existing live setups when a symbol matches more than one, understanding this changes today's classification outcome for any overlapping candidate? (See C-04.)
4. **Backtest provenance.** Can the MFE analysis behind `ACTIVATION_PCT: 0.06` / `ATR_MULT: 1.5` (14.8% of trades reaching +5% MFE, n=29 big-runner tail, 2.54pp average giveback) be shared or pointed to? A memory search for this session found no record of it, so I can't independently verify the parameter choice — this doesn't block writing the spec, but it's worth having on hand before greenlighting live capital.
