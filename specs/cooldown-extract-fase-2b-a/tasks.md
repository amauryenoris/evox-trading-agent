# Tasks — Fase 2b-A: Extract cooldown functions to db-cooldowns.ts

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed: None required

## Implementation Checklist

### Phase 1 — Create db-cooldowns.ts

- [x] T-01: Create `src/lib/db-cooldowns.ts`
  - Import `createClient, type SupabaseClient` from `'@supabase/supabase-js'`
  - Copy the private `getClient()` factory function verbatim from `db.ts` (lines 13–18)
  - Move `upsertSymbolCooldown()` exactly as-is (db.ts lines 750–764)
  - Move `getActiveCooldowns()` with `.limit(100)` added after `.gt(...)` (db.ts lines 766–783)
  - Move `cleanExpiredCooldowns()` exactly as-is (db.ts lines 785–794)
  - Confirm: zero imports from `db.ts`

### Phase 2 — Update db.ts

- [x] T-02: In `src/lib/db.ts`, replace lines 750–794 (the three function bodies) with:
  ```ts
  export {
    upsertSymbolCooldown,
    getActiveCooldowns,
    cleanExpiredCooldowns,
  } from './db-cooldowns'
  ```
  - Keep the section comment above (line 748–749) or remove it if it becomes orphaned
  - Do not touch any other line in `db.ts`

### Phase 3 — Verify

- [x] T-03: Confirm `db-cooldowns.ts` contains no `import ... from './db'` or `from '../lib/db'`
- [x] T-04: Count lines in `db.ts` — must be < 800
- [x] T-05: Run `npm run build` — must complete with zero TypeScript errors
- [x] T-06: Confirm existing call sites (if any currently import these functions from `./db`)
       still resolve without modification

## Post-Implementation

- [ ] Run `/review cooldown-extract-fase-2b-a` to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (`git diff src/lib/config.ts src/lib/claude-agent.ts src/lib/risk-manager.ts src/lib/indicators.ts` should be empty)
- [ ] Commit: `refactor: extract cooldown DB functions to db-cooldowns.ts (Fase 2b-A)`

## Verification Checklist (from spec)

- [x] `db-cooldowns.ts` imports supabase client directly — no db.ts import ✅
- [x] No circular dependency: `db-cooldowns.ts` does not import from `db.ts` ✅
- [x] Three functions moved exactly ✅
- [x] `getActiveCooldowns()` has `.limit(100)` ✅
- [x] `db.ts` re-exports all three from `db-cooldowns` ✅
- [x] `db.ts` under 800 lines after extraction ✅ (750 lines)
- [x] Existing `import { ... } from './db'` call sites unaffected ✅
- [x] Zero TypeScript errors ✅
- [x] `npm run build` passes ✅

## Estimated Complexity

**Low** — Pure mechanical extraction of 45 lines into a new file + 4-line re-export. No logic
changes, no schema changes, no Protected Zone files involved. The only non-trivial step is
the `getClient()` copy to avoid circular dependency, which the design resolves explicitly.
