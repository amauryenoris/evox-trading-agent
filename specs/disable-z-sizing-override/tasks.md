# Tasks — Disable the z <= -2 sizing override

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: the flag is in `position-sizing.ts`, not in a Protected Zone file; none are edited)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Confirm and baseline
- [x] T-01: Re-run the grep for `Z_SIZING_OVERRIDE_ENABLED` and `zOverrideEnabled` (src, scripts, .github); confirm the definition, the single read and the caller that does not pass the input.
- [x] T-02: Run `npx vitest run src/lib/__tests__/position-sizing.test.ts` and the full suite to record the baseline (expected 968 passing).

### Phase 2 — Tests first (RED)
- [x] T-03: Update the `constants` test to assert the default is `false` (keep the 10% cap assertion).
- [x] T-04: Add default-flag tests: z -2.13 with confidence 0.32 -> factor 0.5; z -2.13 with confidence 0.80 -> factor 0.80; MP 2026-10-13 breakdown with the default flag (base 250, factor 0.5, adjusted 125, `zOverrideApplied` false); explicit `zOverrideEnabled: true` at confidence 0.32 returns `baseShares`.
- [x] T-05: Make the flag explicit (`zOverrideEnabled: true`) in the golden test, the differential test and the existing MP 2026-10-13 breakdown test.
- [x] T-06: Run the sizing test file and confirm the new default tests fail before the flag change (RED).

### Phase 3 — Flag (GREEN)
- [x] T-07: `src/lib/position-sizing.ts` line 4: `true` -> `false`; update the line 3 comment if O-1 is accepted. No other line changes.
- [x] T-08: Run the sizing test file (all pass).

### Phase 4 — Verification
- [x] T-09: `npx tsc --noEmit`.
- [x] T-10: Full `npx vitest run`; if a test outside the two files fails because of the new default, stop and report it (O-3).
- [x] T-11: `npm run build`.
- [x] T-12: ESLint on `position-sizing.ts` and `position-sizing.test.ts`.
- [x] T-13: `git diff --name-only` and `git diff --stat`: only the two files changed; no Protected Zone file; the `position-sizing.ts` diff is the flag line (and the comment if accepted).

### Phase 5 — Mentions and report
- [x] T-14: Search logs, snapshot fields, prompt text and docs for anything saying or implying z <= -2 gets full size; list matches (do not edit Protected Zone text).
- [x] T-15: Write `.tmp/z-override-off-report.md`: where the flag lives, every place it is read, diff summary, test results, remaining mentions (including `SDD.md:88` and the ranking comparator).

## Post-Implementation

- [ ] Run /review disable-z-sizing-override to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; commit is a separate request from Amaury

## Estimated Complexity

Low. One constant changes; the work is in making five existing tests explicit and adding four new ones. The main unknown is whether a test in another file depends on the old default (the full run settles it).
