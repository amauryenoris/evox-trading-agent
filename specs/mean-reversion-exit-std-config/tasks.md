# Tasks — mean-reversion-exit-std-config

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] ⚠️ Protected Zone confirmation: Amaury has explicitly confirmed touching both `src/lib/config.ts` and `src/lib/indicators.ts` (the source prompt's claim that neither file needs authorization is incorrect — both are listed in CLAUDE.md's Protected Zone table — see requirements.md C-01)
- [ x] Database migrations drafted (if applicable) — N/A

## Implementation Checklist

### Phase 1 — Pre-check (verified during spec authoring, re-confirm at implementation time)
- [x] T-01: Confirm no env var named `MEAN_REVERSION_EXIT_STD` is already set anywhere in the repo's checked-in env files (including `.env.local`) with a conflicting value. (Re-confirmed absent — only this feature's own spec files reference the name.)

### Phase 2 — config.ts
- [x] T-02: Add `export const MEAN_REVERSION_EXIT_STD = parseFloat(process.env.MEAN_REVERSION_EXIT_STD ?? '0.8')` to `config.ts`, positioned after `MAX_QUOTE_AGE_SECONDS` and before `INSTRUMENT_BLACKLIST`. Do not modify the other 4 exports.

### Phase 3 — indicators.ts
- [x] T-03: Add `import { MEAN_REVERSION_EXIT_STD } from './config'` alongside the existing `./types` import.
- [x] T-04: Change `calculateKalman()`'s signature so `exitStd`'s default is `MEAN_REVERSION_EXIT_STD` instead of the literal `0.5`. Do not change `entryStd` or any other part of the function.

### Phase 4 — Verification
- [x] T-05: Confirm `config.ts` exports exactly 5 constants (the 4 existing plus the new one) at the described position. (Confirmed via diff.)
- [x] T-06: Confirm `indicators.ts`'s only changes are the new import and the `exitStd` default — the function body (computation logic) is byte-for-byte unchanged. (Confirmed via diff — 2 lines changed total.)
- [x] T-07: Run `npx tsc --noEmit` — confirm no new type errors.
- [x] T-08: Run `npm run build` — confirm it passes.
- [x] T-09: Run the full test suite (`npx vitest run`) — report pass count. Confirm no test imports `calculateKalman()` directly or asserts on `EXIT_LONG` signal computation in a way that would be affected by the threshold change. (298/298 passed, 30 files — unchanged count from before this change, confirming no test was affected. `trailing-stop-exit-reason-guard.test.ts` remains the only file referencing this logic, and it replicates the check via its own `kalmanSignal` test-input field, not a live call to `calculateKalman()`.)
- [x] T-10: State the resulting effective threshold explicitly in the completion report — confirm `EXIT_LONG` now fires at `zScore >= -0.8` (not `-0.5`). (Stated in completion report below.)

## Post-Implementation

- [x] Run `/review mean-reversion-exit-std-config` to verify implementation matches spec
- [x] Confirm Protected Zone files changed are limited to `config.ts` and `indicators.ts`, matching this spec exactly

## Estimated Complexity

Low — a 1-line constant addition and a 2-line signature/import change, with no logic changes. Complexity comes entirely from correctly handling the Protected Zone status of both files, which the source prompt mischaracterized.
