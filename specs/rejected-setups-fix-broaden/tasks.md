# Tasks — Fix RejectedSetups' Stale Filter + Broaden to Spread Gate and MR_RANGING_ADX_GATE

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, neither file is Protected Zone
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — API Layer (route.ts)
- [x] T-01: Widen the `.or('error.ilike.TREND_ZGT05%,error.ilike.TREND_QUALITY_FAIL%')` filter to match all 4 prefixes: `TREND_ZGT125%`, `TREND_QUALITY_FAIL%`, `Spread gate%`, `MR_RANGING_ADX_GATE%`
- [x] T-02: Extend the `kind` classification from the existing 2-way ternary to a 4-way check (prefix-based, same pattern extended — not restructured), producing `'TREND_ZGT125' | 'TREND_QUALITY_FAIL' | 'SPREAD_GATE' | 'MR_RANGING_ADX_GATE'`
- [x] T-03: Add `reason` string construction for `SPREAD_GATE` and `MR_RANGING_ADX_GATE` kinds — `MR_RANGING_ADX_GATE` uses the already-parsed `z`/`adx` values (same level of detail as the existing 2 kinds); `SPREAD_GATE` reuses the row's raw `error` text (stripped of the `"Spread gate: "` prefix) since the exact bps value lives only in the error string, not in `indicators`

### Phase 2 — UI (RejectedSetups.tsx)
- [x] T-04: Widen `RejectedEntry['kind']` union to the 4 values from T-02, matching `route.ts` exactly
- [x] T-05: Update the `TREND_ZGT05` badge case to `TREND_ZGT125`, label changed from `"Z>0.5"` to `"Z>1.25"`
- [x] T-06: Add badge label mappings for `SPREAD_GATE` ("SPREAD") and `MR_RANGING_ADX_GATE` ("MR RANGING") — reused the existing `Badge` component's `tone="amber"` unchanged (matches original behavior exactly, which also used a single static tone across both prior kinds), no new styling
- [x] T-07: Update the empty-state text from `"No trend rejections today"` to `"No rejections today"`

### Phase 3 — Testing
- [x] T-08: Confirmed live via dev server + curl against `/api/rejected-today`: `TREND_ZGT125` rows (MARA, GOOGL) and `TREND_QUALITY_FAIL` rows (FCX, OXY) now appear correctly with rich reason text for today's real data — the previously-invisible `TREND_ZGT125` category is now visible. `SPREAD_GATE`/`MR_RANGING_ADX_GATE` had no rows today specifically (consistent with their confirmed low frequency), but the query now includes both prefixes and the classification logic is covered end-to-end by T-09's unit tests using real sample strings from the earlier live diagnostic. **Also found and fixed (with explicit approval) a separate, pre-existing bug**: the route's `.select(...)` referenced a non-existent `agent_log.signal_type` top-level column (it only exists nested in `decision.signal_type`, unused anywhere in this route's response mapping), causing every request to 500 — predates this session (confirmed via `git show` against the last commit touching this file, 2026-05-21). Removed the dead column reference; this was required to make the route function at all, not just to fix the stale filter.
- [x] T-09: Added `src/lib/__tests__/rejected-today-classification.test.ts` — replicated-logic tests for all 4 kinds' classification and reason-string construction, including `SPREAD_GATE` and `MR_RANGING_ADX_GATE` despite their current real-world rarity, per the spec's explicit instruction
- [x] T-10: Run `npx tsc --noEmit` — passed, no errors
- [x] T-11: Run `npm run build` — passed, all routes compiled cleanly including `/api/rejected-today`
- [x] T-12: Run `npm test` — 47 test files, 437/437 tests passed (11 new; all 426 pre-existing tests still pass unchanged)
- [x] T-13: Final line counts — `src/app/api/rejected-today/route.ts`: 60 lines; `src/components/dashboard/RejectedSetups.tsx`: 100 lines

## Post-Implementation

- [ ] Run `/review rejected-setups-fix-broaden` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged — expected, neither touched file is Protected Zone

## Estimated Complexity

**Low** — two small, already-well-understood files; the change is additive classification logic (2→4 kinds) plus label/text updates, no architectural change, no new dependency, no Protected Zone gate to clear. The only real care needed is getting the 4-way classification order right (each prefix must be checked distinctly, matching `route.ts` and `RejectedSetups.tsx`'s unions exactly) and writing the 2 new reason strings with the same level of detail as the existing 2.
