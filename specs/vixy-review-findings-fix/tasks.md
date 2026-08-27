# Tasks — Close 2 MEDIUM Findings from the VIXY Review

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed — N/A, none required
- [x ] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Text fixes (market-daily-briefing.ts)
- [x] T-01: In `formatVixyChangeContext()`'s `null` branch, change the returned string from `'VIX proxy (VIXY): no data'` to `'VIX proxy (VIXY, directional only — not the real VIX level): no data'`
- [x] T-02: In `NARRATIVE_SYSTEM_PROMPT`'s descriptive sentence, change `"You will receive an SPX trend snapshot, sector rotation data, and a macro news sentiment count."` to mention the VIX-proxy reading as a fourth input — final text used: "You will receive an SPX trend snapshot, sector rotation data, a macro news sentiment count, and a VIX proxy reading." (exact wording as specified, no adjustment needed)

### Phase 2 — Testing
- [x] T-03: Update the existing `formatVixyChangeContext` test that asserts the exact `null`-case string to match the new caveat-inclusive text
- [x] T-04: Confirm no other test in `market-daily-briefing.test.ts` or `db-market-briefing.test.ts` needs a change

## Post-Implementation

- [x] Run `/review vixy-review-findings-fix` to verify implementation matches spec — APPROVED, see review.md
- [x] Run `npx tsc --noEmit` and `npm run build` — both must pass
- [x] Confirm Protected Zone files unchanged
- [x] Confirm `computeVixyChangePct()`, `claude-agent.ts`, and every other part of the VIXY feature unchanged
- [x] Confirm only the one expected test assertion changed

## Estimated Complexity

Low — two literal string edits and one corresponding test-assertion update, zero logic or control-flow changes.
