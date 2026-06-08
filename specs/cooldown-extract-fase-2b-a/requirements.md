# Requirements — Fase 2b-A: Extract cooldown functions to db-cooldowns.ts

## Context

`db.ts` is at 794/800 lines (project limit). Three cooldown DB functions added in Fase 2a
must be extracted into a dedicated module before Fase 2b agent wiring can proceed.

## Functional Requirements

FR-01: The system shall provide `upsertSymbolCooldown`, `getActiveCooldowns`, and
`cleanExpiredCooldowns` as exported functions in a new module `src/lib/db-cooldowns.ts`.

FR-02: The system shall limit `getActiveCooldowns()` query results to a maximum of 100 rows
by appending `.limit(100)` to the Supabase query chain.

FR-03: `src/lib/db-cooldowns.ts` shall import the Supabase client directly from
`@supabase/supabase-js` without importing anything from `src/lib/db.ts`.

FR-04: `src/lib/db.ts` shall re-export `upsertSymbolCooldown`, `getActiveCooldowns`, and
`cleanExpiredCooldowns` from `./db-cooldowns` using a barrel re-export statement.

FR-05: The system shall preserve all existing call sites that import the three cooldown
functions from `./db` without requiring any modification to those call sites.

FR-06: `src/lib/db.ts` shall contain fewer than 800 lines after the extraction.

## Non-Functional Requirements

NFR-01: `src/lib/db-cooldowns.ts` shall introduce no circular dependency with `src/lib/db.ts`
— neither file shall import from the other in a cycle.

NFR-02: The TypeScript compiler shall report zero errors after the extraction.

NFR-03: `npm run build` shall complete successfully after the extraction.

## Constraints

C-01: This feature shall not modify any file in the Protected Zone
(`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`).

C-02: The three function signatures shall remain byte-for-byte identical to their current
forms in `db.ts` — only `.limit(100)` is added to the `getActiveCooldowns()` query chain.

C-03: No file other than `src/lib/db.ts` and the new `src/lib/db-cooldowns.ts` shall be
modified.

## Out of Scope

- Wiring cooldown functions into the agent loop (that is Fase 2b)
- Any other refactoring of `db.ts`
- Adding tests for the moved functions (existing test coverage is unchanged by a pure extraction)
- Any DB schema or migration changes
