# Tasks — Central ACTIVE_SETUPS List, Fix Setup-Name Drift

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — **None required.** All 4 touched files (`setups.ts`, `types.ts`, `gate-importance.ts`, `system-status/route.ts`) are outside the Protected Zone.
- [x] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Central setup list

- [x] T-01: Create `src/lib/setups.ts`:
  - `ACTIVE_SETUPS` array, 5 entries in this order (matches `claude-agent.ts:1873-1883`'s selector priority): `TREND_PULLBACK_3DAY`, `MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`
  - Each entry: `name` (exact string used elsewhere), `criteria` (plain-language, sourced from `requirements.md`'s Background / `SDD.md` section 4 — not from memory), `active: true`
  - `export type SetupName = (typeof ACTIVE_SETUPS)[number]['name']`
  - No imports from `claude-agent.ts` or anywhere else in `src/lib`

### Phase 2 — Type corrections

- [x] T-02: `types.ts:137` — `import type { SetupName } from './setups'`; change `export type SignalType = 'MEAN_REVERSION' | 'TREND_FOLLOWING' | 'PULLBACK_EMA50' | 'OTHER'` to `export type SignalType = SetupName`. Do not rename or remove `AgentDecision.signal_type` itself.
- [x] T-03: `types.ts:195` and `types.ts:212` — leave the value sets unchanged (`'TREND'` stays). Add a one-line comment on each stating `'TREND'` is intentional legacy compatibility for positions opened before the `TREND` → `TREND_PULLBACK` rename, consumed by `claude-agent.ts:295` (not touched by this change).

### Phase 3 — gate-importance.ts

- [x] T-04: Add the `TREND_PULLBACK_3DAY` entry to `DIMENSION_IMPORTANCE`: `{ adx: 'not-gated', macd: 'not-gated', z: 'not-gated', regime: 'not-gated' }`.
- [x] T-05: Add a code comment above/beside the new entry stating the weighting is derived directly from `TREND_PULLBACK_3DAY`'s entry-condition code (`claude-agent.ts:1711-1728`) — not guessed, not borrowed from `TREND_ZLE05` or any other setup — and should be revisited once the setup reaches n>=20-30 closed trades (currently n=13).

### Phase 4 — Required companion fix

- [x] T-06: `src/app/api/system-status/route.ts:31-32` — update `e.decision.signal_type === 'TREND_FOLLOWING' || e.decision.signal_type === 'PULLBACK_EMA50'` to compare against real trend-setup names (`'TREND_PULLBACK'`, `'TREND_ZLE05'`, `'TREND_PULLBACK_3DAY'`) so it compiles against the narrowed `SignalType`. Required consequence of T-02, not independent scope creep.

### Phase 5 — Verification

- [x] T-07: Run `npx tsc --noEmit` — must be clean. If any other site is found comparing/assigning against a removed `SignalType` value, report the exact site and how it was resolved.
- [x] T-08: Run `git diff --stat` — confirm it touches exactly `src/lib/setups.ts` (new), `src/lib/types.ts`, `src/lib/gate-importance.ts`, `src/app/api/system-status/route.ts`. No other file.
- [x] T-09: Show the final `setups.ts` content in full in the implementation report.
- [x] T-10: Show `DIMENSION_IMPORTANCE`'s full content before and after in the implementation report, with the `TREND_PULLBACK_3DAY` reasoning spelled out (not just referenced via the code comment).
- [x] T-11: Confirm no behavior change anywhere except `compareFingerprints()`'s output for `TREND_PULLBACK_3DAY` trades specifically. State the prior behavior explicitly in the report: the "Context vs. current trade" comparison line was silently omitted from RECENT TRADE LESSONS for any trade involving a `TREND_PULLBACK_3DAY` fingerprint (trade summary line and lessons-learned bullets still rendered); after this change it renders using the new all-`'not-gated'` weights.
- [x] T-12: Run `npm test` — confirm no regressions, in particular `src/lib/__tests__/gate-relevance-context.test.ts` and any test referencing `DIMENSION_IMPORTANCE` or `SignalType`.

## Post-Implementation

- [ ] Run `/review active-setups-list` to verify implementation matches spec
- [ ] Confirm Protected Zone files (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) unchanged

## Estimated Complexity

**Low** — additive type/data changes plus one required one-line fix in a non-Protected-Zone file. No runtime/trading-logic changes. Main risk was the `'TREND'`-removal path into Protected Zone code, which has been resolved by keeping `'TREND'` and documenting it instead.
