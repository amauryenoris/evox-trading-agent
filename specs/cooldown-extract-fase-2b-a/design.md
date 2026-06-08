# Design — Fase 2b-A: Extract cooldown functions to db-cooldowns.ts

## Architecture Decision

The three cooldown functions currently live at the tail of `db.ts` (lines 750–794) as an
appendage from Fase 2a. They are a self-contained slice: they touch only the
`symbol_cooldowns` table and depend on a private `getClient()` factory that wraps
`createClient()` from `@supabase/supabase-js`. Extracting them to `src/lib/db-cooldowns.ts`
gives them their own cohesive module, brings `db.ts` back under the 800-line limit, and
prepares a clean import surface for Fase 2b agent wiring.

## Data Flow

```
Before extraction:
  claude-agent.ts  ──(import)──►  db.ts  ──(internal)──►  getClient()  ──►  @supabase/supabase-js
                                     │
                                     └── upsertSymbolCooldown()
                                     └── getActiveCooldowns()
                                     └── cleanExpiredCooldowns()

After extraction:
  [future: claude-agent.ts]  ──(import)──►  db.ts  ──(re-export)──►  db-cooldowns.ts
                                                                              │
                                                                       local getClient()
                                                                              │
                                                                    @supabase/supabase-js
```

Existing callers that import from `'./db'` are unaffected — `db.ts` re-exports transparently.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Copy `getClient()` into `db-cooldowns.ts` | No coupling to `db.ts`, zero circular risk, self-contained | Minor duplication of 4-line factory | **Chosen** |
| Export `getClient()` from `db.ts` and import it in `db-cooldowns.ts` | DRY | Creates `db-cooldowns → db.ts` import; combined with `db.ts → db-cooldowns` re-export, this is a circular dependency | **Rejected** |
| Move `getClient()` to a shared `supabase-server.ts` helper | Proper DRY for future modules | Requires modifying `db.ts` internals and potentially other callers — scope creep | **Rejected** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db-cooldowns.ts` | CREATE | New module: private `getClient()` copy + 3 cooldown functions moved exactly from `db.ts`; `getActiveCooldowns()` gains `.limit(100)` |
| `src/lib/db.ts` | MODIFY | Lines 750–794 (3 function bodies) replaced with a single barrel re-export block |

## Protected Zone Impact

None — this feature does not touch any Protected Zone file.

## Database Changes

None — no schema changes, no migrations, no new tables or columns.

## Open Questions

None — the implementation is fully determined by the requirements and Step 0 analysis.
The `getClient()` copy approach eliminates the only design ambiguity (circular dependency).

## Step 0 Verification (pre-implementation baseline)

```
db.ts line count : 794  (at 800-line limit)
upsertSymbolCooldown()   : lines 750–764
getActiveCooldowns()     : lines 766–783
cleanExpiredCooldowns()  : lines 785–794

Supabase client source:
  db.ts:1   import { createClient, type SupabaseClient } from '@supabase/supabase-js'
  db.ts:13  function getClient(): SupabaseClient { ... createClient(url, key) }
  getClient() is NOT exported — db-cooldowns.ts must define its own copy.

Circular dependency risk: NONE
  db-cooldowns.ts imports from '@supabase/supabase-js' (npm package)
  db.ts re-exports from './db-cooldowns'
  No cycle possible.
```
