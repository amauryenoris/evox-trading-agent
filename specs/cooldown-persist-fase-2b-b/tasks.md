# Tasks — Fase 2b-B: Add computeCooldownUntil() and persist cooldowns after exits

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed: `src/lib/claude-agent.ts` (additive only — new imports, new helper, new block)

## Implementation Checklist

### Phase 1 — Imports

- [x] T-01: Add `getNextTradingDay` to the existing alpaca import block in `claude-agent.ts` (lines 3–17)
  - Do NOT create a new import statement — append to existing destructure

- [x] T-02: Add a new import line for `upsertSymbolCooldown` from `'./db-cooldowns'`
  - Place after the `./db` import block
  - Exact form: `import { upsertSymbolCooldown } from './db-cooldowns'`

### Phase 2 — computeCooldownUntil() helper

- [x] T-03: Add `computeCooldownUntil()` helper near other top-of-file helpers in `claude-agent.ts`
  - Function is synchronous: `function computeCooldownUntil(reason, endOfTradingDay, nextTradingDay1, nextTradingDay3): Date | null`
  - Switch on all 7 ExitReason values (exhaustive, with `default: return null`)
  - Include the 4-line comment block explaining the 21:00 UTC approximation and Fase 3 note
  - Do NOT import ExitReason again — already imported from './types'

### Phase 3 — Cooldown-write block

- [x] T-04: Insert the cooldown-write block immediately after the enforceExitRules IIFE closing `})()` (line 886) and before line 976 (the Fase 1b cooldownSymbols comment block)
  - Outer `try/catch` wrapping the entire block
  - `Promise.all([getNextTradingDay(now, 1), getNextTradingDay(now, 3)])` — single calendar batch
  - `endOfTradingDay` computed from `nowUTC < marketCloseUTC ? marketCloseUTC : nextTradingDay1`
  - Inner `Promise.all([...exitReasons.entries()].map(...))` — concurrent DB writes
  - Each write: call `computeCooldownUntil()`, skip if `null`, else `upsertSymbolCooldown()` + log
  - Log format: `[COOLDOWN_PERSIST] symbol=X reason=Y until=Z source=enforceExitRules`
  - Catch: `console.error('[COOLDOWN_PERSIST_ERROR]', err)`

### Phase 4 — Verify

- [x] T-05: Confirm `ExitReason` not re-imported (still only at line 49)
- [x] T-06: Confirm `cooldownSymbols` build block (lines 976–1006) is untouched
- [x] T-07: Confirm `enforceExitRules()` function body (lines 102+) is untouched
- [x] T-08: Run `npm run build` — must complete with zero TypeScript errors

## Post-Implementation

- [ ] Run `/review cooldown-persist-fase-2b-b` to verify implementation matches spec
- [ ] Confirm no other Protected Zone files modified
- [ ] Commit: `feat: persist cooldowns after exits — Fase 2b-B`

## Verification Checklist (from spec)

- [x] `computeCooldownUntil()` is synchronous — takes dates as params ✅
- [x] Calendar API called once: `Promise.all([day1, day3])` before exits ✅
- [x] `endOfTradingDay` uses pre-fetched `nextTradingDay1` as fallback ✅
- [x] All 7 `ExitReason` values handled ✅
- [x] `TIME_STOP` and `UNKNOWN` return `null` — no write ✅
- [x] `Z_SCORE_EXIT`/`PROFIT_TARGET` → `endOfTradingDay` ✅
- [x] `TRAILING_STOP`/`EMA_FAILURE` → `nextTradingDay1` ✅
- [x] `STOP_LOSS` → `nextTradingDay3` ✅
- [x] Outer `Promise.all` for exits — concurrent ✅
- [x] Wrapped in `try/catch` — agent survives DB failure ✅
- [x] `[COOLDOWN_PERSIST]` includes `source=enforceExitRules` ✅
- [x] Placement: AFTER `enforceExitRules()`, BEFORE `cooldownSymbols` ✅
- [x] Zero TypeScript errors ✅
- [x] `npm run build` passes ✅

## Estimated Complexity

**Medium** — Touches `claude-agent.ts` (Protected Zone). Changes are purely additive (no existing
code modified), but the file is large (~1700 lines) and the insertion point must be located
precisely between two existing blocks.
