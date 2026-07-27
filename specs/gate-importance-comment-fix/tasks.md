# Tasks — Fix Stale Line-Number References in gate-importance.ts

## Pre-Implementation

- [x ] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed: N/A — gate-importance.ts is not
      Protected Zone
- [ x] Database migrations drafted: N/A

## Implementation Checklist

### Phase 1 — Comment correction (gate-importance.ts)
- [x] T-01: Read `src/lib/gate-importance.ts`'s current sourcing comment
      (lines 12-25) live and confirm it still reads exactly as captured in
      this spec's Context section (1350 / 1359-1360 / 1455 / "as of
      2026-07-24") before editing.
      Confirmed unchanged from spec-writing time.
- [x] T-02: Replace "claude-agent.ts line 1350" with
      "claude-agent.ts line 1355" (TREND_PULLBACK ADX floor citation).
- [x] T-03: Replace "claude-agent.ts lines 1359-1360" with
      "claude-agent.ts lines 1362-1363" (TREND_ZLE05 ADX floor citation).
- [x] T-04: Replace "claude-agent.ts line 1455" with
      "claude-agent.ts line 1456" (TREND_ZLE05 MACD floor citation).
- [x] T-05: Update the "as of 2026-07-24" date stamp in the comment header
      to the date this fix is applied. Set to 2026-07-27 (today).
- [x] T-06: Confirm no other word in the comment changed, and no code,
      import, export, or `DIMENSION_IMPORTANCE` value was touched.
      Single Edit call touched only the 4 line-number tokens + date stamp;
      all other comment wording, imports, exports, and DIMENSION_IMPORTANCE
      byte-identical.

### Phase 2 — Verification
- [x] T-07: `git diff` on `gate-importance.ts` shows only comment-text
      lines changed — zero code lines touched.
      Confirmed: diff is exactly 4 line substitutions inside the sourcing
      comment (date stamp + 3 line-number citations).
- [x] T-08: Grep the updated comment to confirm it now reads 1355, 1362,
      1363, 1456 (and no lingering 1350/1359/1360/1455).
      Confirmed via grep — only 1355/1362-1363/1456 present.
- [x] T-09: Run `npx tsc --noEmit` — confirm zero errors (expected
      unaffected, but confirm rather than assume).
      Result: clean, zero output/errors.
- [x] T-10: Run `npm run build` — confirm it passes (expected unaffected,
      but confirm rather than assume).
      Result: "Compiled successfully", all routes generated.

## Post-Implementation

- [x] Confirm `git status` shows only `src/lib/gate-importance.ts` modified
- [x] Run `/review gate-importance-comment-fix` to verify implementation
      matches spec
      Result: APPROVED — see specs/gate-importance-comment-fix/review.md

## Estimated Complexity

**Low** — a 4-number-plus-date text substitution inside one existing
comment block, in a file with no runtime consumers yet; zero logic change,
zero Protected Zone touch, zero test impact.
