# Tasks — VIXY 1-Day % Change into Market Daily Briefing

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed — `claude-agent.ts` touch explicitly authorized by Amaury, confined to the two insertion points in this spec
- [ x] Database migrations drafted — N/A, `vix_proxy_change` column already exists (Fase 2)

## Implementation Checklist

### Phase 1 — New helper functions (market-daily-briefing.ts)
- [x] T-01: Add `computeVixyChangePct(bars: { t: string; c: number }[]): number | null` near the top of the file, after the `SpxSnapshot` interface — 1-day change using the anti-lookahead convention (`bars.length - 2` = yesterday's confirmed close vs. `bars.length - 3` = the prior confirmed close), returning `null` for fewer than 3 bars or a zero past-close
- [x] T-02: Add `formatVixyChangeContext(vixyChangePct: number | null): string` alongside the existing `format*` functions — "no data" message when `null`, signed-percentage message otherwise, always including the "directional only — not the real VIX level" caveat text

### Phase 2 — Thread vixyChangePct through the pipeline (market-daily-briefing.ts)
- [x] T-03: Add `vixyChangePct: number | null` as a new parameter to `synthesizeDailyBriefingNarrative()` (after `macroSentiment`); include `formatVixyChangeContext(vixyChangePct)` in the prompt text alongside the existing 3 formatted sections
- [x] T-04: Add `vixyChangePct: number | null` as a new parameter to `generateDailyBriefing()` (after `macroSentiment`, before the optional `synthesize` parameter); pass it through to both the `synthesize(...)` call and `buildBriefingRecord(...)` call
- [x] T-05: Add `vixyChangePct: number | null` as a new parameter to `buildBriefingRecord()` (after `narrative`); change the returned object's `vix_proxy_change: null` to `vix_proxy_change: vixyChangePct`

### Phase 3 — Wire VIXY fetch (claude-agent.ts, Protected Zone)
- [x] T-06: Add `computeVixyChangePct` to the existing import of `generateDailyBriefing` from `./market-daily-briefing`
- [x] T-07: Add a new `getBars('VIXY', '1Day', 400).catch((err: unknown) => { console.error('[BRIEFING] VIXY fetch failed:', err); return [] })` entry to the existing `Promise.all` array, destructured as `vixyBars`
- [x] T-08: Immediately after `sectorRotation`/`sectorRotationContext` are computed, add `const vixyChangePct = computeVixyChangePct(vixyBars)` and a `console.log('[BRIEFING] VIXY 1-day change:', vixyChangePct)` line
- [x] T-09: Update the `generateDailyBriefing(...)` call to pass `vixyChangePct` as the new 4th argument

### Phase 4 — Testing
- [x] T-10: Live-verify `getBars('VIXY', '1Day', 400)` against this project's actual Alpaca credentials/feed and report the result — re-confirmed at implementation time via a direct HTTP call: `200 OK`, real bars returned
- [x] T-11: Add tests for `computeVixyChangePct()`: normal case (correct percentage for a 3+ bar array), insufficient bars (< 3 → `null`), zero past-close (→ `null`)
- [x] T-12: Add tests for `formatVixyChangeContext()`: `null` case ("no data" message), positive-change case, negative-change case — all asserting the directional-only caveat text is present
- [x] T-13: Deliberately update `market-daily-briefing.test.ts:99-126`'s `buildBriefingRecord` test to pass a real `vixyChangePct` value and assert the matching `vix_proxy_change` in its expected `toEqual()` object — report this as an intentional update
- [x] T-14: Confirm `market-daily-briefing.test.ts`'s other 5 describe blocks and all of `db-market-briefing.test.ts` pass unmodified (with one caveat, see completion report — the 2 `generateDailyBriefing` tests needed a mechanical argument addition, not an assertion behavior change, since `vixyChangePct` is a new required parameter)

## Post-Implementation

- [x] Run `/review vixy-briefing-proxy` to verify implementation matches spec — APPROVED WITH WARNINGS, see review.md
- [x] Run `npx tsc --noEmit` and `npm run build` — both must pass
- [x] Confirm Protected Zone touch is confined to exactly the two authorized points in `claude-agent.ts` — no other line in that file changed
- [x] Confirm `sector-rotation.ts` and `db-market-briefing.ts` unchanged
- [x] Confirm no test assertion changed other than the one deliberate `buildBriefingRecord` update (plus the 2 mechanical argument additions in the `generateDailyBriefing` tests, required by the new non-optional parameter — see completion report)

## Estimated Complexity

Low-Medium — the compute/format functions and their tests are simple and low-risk. The main source of care needed is the Protected Zone touch in `claude-agent.ts` (must stay confined to exactly the two authorized points) and correctly threading one new parameter through 3 function signatures without disturbing any existing parameter's position or meaning. VIXY's live fetchability was the one open question, and it's already been resolved with a positive result during spec-writing.
