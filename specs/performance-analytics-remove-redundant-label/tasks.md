# Tasks — Remove Redundant Signal-Type Label from PerformanceAnalytics.tsx

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, this file is not in the Protected Zone
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Render cleanup (only phase)
- [x] T-01: In `src/components/dashboard/PerformanceAnalytics.tsx`, remove `<span className="text-[11px] text-mute2">{s.label}</span>` (currently line 260) from the card-header `<div className="flex items-center gap-2.5">` block, leaving only `<SignalBadge signal={s.type} />` inside it.
- [x] T-02: Verify the `Sig` interface (line 160) and all 5 `label: '...'` assignments in the `sigs` array (lines 165, 174, 183, 192, 201) are byte-for-byte unchanged (diff review).
- [x] T-03: Verify the trades-count span, the `KVMini` grid, and the `Progress` bar are byte-for-byte unchanged (diff review).

### Phase 2 — Verification
- [x] T-04: Run `npx tsc --noEmit` — must pass (confirms `label` becoming unrendered does not produce a compiler error, since TypeScript does not flag unused object properties).
- [x] T-05: Run `npm run build` — must pass.
- [x] T-06: Manually confirm (via direct inspection of the rendered JSX / diff) that the label span is gone from all 5 potential card types (MR, TREND_PULLBACK, TREND_ZLE05, TREND_PULLBACK_3DAY, EMA_RECLAIM) — since they all go through the same single `.map()` block, one code change covers all 5.
- [x] T-07: Report the final line count of `PerformanceAnalytics.tsx`.

## Post-Implementation

- [x] Run `/review performance-analytics-remove-redundant-label` to verify implementation matches spec
- [x] Confirm exactly one file changed (`PerformanceAnalytics.tsx`)

## Estimated Complexity

Low — a single-line JSX removal in one render location, with no data model, type, or logic changes. No existing test touches this file (confirmed in an earlier diagnostic this session).
