# Tasks — Fix getAgentLog()/getAgentLogPrioritized() Whitelist Bug

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, `db.ts` is not Protected Zone
- [x] Database migrations drafted — N/A, no schema changes

## Implementation Checklist

### Phase 1 — Data Layer (src/lib/db.ts)
- [x] T-01: In `getAgentLog()` (`db.ts:70-90`), add `...raw` as the first key in the `indicators` IIFE's returned object literal, immediately before the 16 existing explicit keys — no reordering, no change to any existing key's default expression.
- [x] T-02: In `getAgentLogPrioritized()`'s `mapRow` closure (`db.ts:118-138`), add `...raw` as the first key in the `indicators` IIFE's returned object literal, immediately before the 16 existing explicit keys (including their `as X` casts) — no reordering, no change to any existing key's default expression.
- [x] T-03: Confirm no other function in `db.ts` is modified (`getTradeEvaluations()`, `insertAgentLogEntry()`, etc. untouched). Confirmed via `git diff --stat` — exactly 2 lines added, nothing else touched.

### Phase 2 — Verification
- [x] T-04: Run `npx tsc --noEmit`. If it fails specifically on `getAgentLogPrioritized()`'s `...raw` spread (the one flagged uncertainty in design.md), report the exact error rather than silently changing `raw`'s type annotation or casting the spread — do not proceed past this without reporting. **Result: passed clean, zero errors.** The `Record<string, unknown>` spread compiled without any cast, confirming design.md's prediction.
- [x] T-05: Run `npm run build` — must pass. Passed clean.
- [x] T-06: Spot-check a real row known to carry `self_flagged_disqualifying_risk`, `spx_regime`, or `state_fingerprint` in its `indicators` jsonb (e.g. a recent `TREND_PULLBACK_3DAY` or `MEAN_REVERSION` entry) and confirm those fields are now present in both functions' returned objects. Confirmed via `npx supabase db query --linked` that real rows carry `self_flagged_disqualifying_risk` (e.g. MP `2026-09-04T18:44:59.054Z` → `true`). **Full live end-to-end execution of `getAgentLog()`/`getAgentLogPrioritized()` was attempted but blocked** by the same pre-existing `.env.local` `SUPABASE_SERVICE_ROLE_KEY` issue already flagged during `daily-bars-sync` implementation (`Invalid API key`, reproduced identically here, unrelated to this fix). Verification therefore combines: (a) live confirmation the raw data contains the field, and (b) structural confirmation via the code diff that `...raw` is now the first key in both IIFEs, before the 16 explicit overrides — by JS object-spread semantics this deterministically means any key in `raw` not among those 16 (including `self_flagged_disqualifying_risk`) now passes through unchanged. `tsc --noEmit` (T-04) independently confirms the resulting types are valid.
- [x] T-07: Confirm the 16 original fields' values are unchanged for existing data — the explicit keys still override whatever the spread contributes for those same key names. Confirmed by inspection: none of the 16 lines in either function were modified, reordered, or had their `?? default` expression changed — only the `...raw` line was inserted before them, and later object-literal keys always override earlier ones with the same name in JS, so all 16 fields' resolved values are unchanged. The CLI-confirmed sample row's `rsi` value (`50.321694224181016`) would resolve identically before and after this fix via the unchanged `rsi: raw.rsi ?? null` line.

### Phase 3 — Testing
- [x] T-08: Create a new test file (e.g. `src/lib/__tests__/db.agent-log-passthrough.test.ts`) covering, for both `getAgentLog()` and `getAgentLogPrioritized()`: (a) extra keys beyond the 16-field whitelist survive the round trip, (b) the 16 core fields' defaults are unchanged, (c) absent/null `indicators` still produces the same safe defaults as today. Created with 8 tests (4 per function), mirroring `trade-evaluations-buy-indicators-passthrough.test.ts`'s pattern. All 8 pass.
- [x] T-09: Confirm `src/lib/__tests__/agent-log.test.ts` (tests `appendAgentLogEntries()`, unrelated to these read functions) continues to pass unmodified. Confirmed — included in the full suite run below, passing, and not modified (not in `git status`).
- [x] T-10: Run the full existing test suite and confirm no regressions — report which files were run. `npx vitest run` — all 44 test files, 400/400 tests passed.
- [x] T-11: Report the final line count of `db.ts`.

## Post-Implementation

- [x] Run `/review agent-log-whitelist-fix` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (git diff shows only `db.ts` and the new test file)

## Estimated Complexity

Low — a two-expression change (one per function) mirroring an already-shipped, already-reviewed pattern (`getTradeEvaluations()`'s fix) with no new architecture and a full call-site audit already confirming no consumer breaks. The only genuinely open technical question — whether `getAgentLogPrioritized()`'s `Record<string, unknown>`-typed `raw` spreads cleanly — is a `tsc --noEmit`-verifiable fact, not a design decision.
