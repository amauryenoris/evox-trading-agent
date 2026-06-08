# Requirements — Fase 2b-C: Merge Persistent Cooldowns + Cleanup

## Context

Fase 2b-B (committed) writes exits to `symbol_cooldowns` after `enforceExitRules()`.
Fase 2b-C reads those rows back and merges them into the in-memory `cooldownSymbols` set
so that cross-run re-entries (the original AVGO bug) are fully blocked.

## Functional Requirements

FR-01: The system shall snapshot the size of `cooldownSymbols` into `inMemoryCooldownCount`
       immediately after the in-memory build loop completes and before querying the database.

FR-02: The system shall call `getActiveCooldowns()` once per agent cycle to retrieve all
       symbols whose `cooldown_until` timestamp is in the future.

FR-03: For each row returned by `getActiveCooldowns()`, the system shall add the symbol to
       `cooldownSymbols` when the symbol is not already present in `cooldownSymbols`.

FR-04: The system shall increment `restoredCount` only when a symbol from the DB is added to
       `cooldownSymbols` (i.e. it was not already blocked by in-memory state).

FR-05: The system shall emit a `[COOLDOWN_RESTORE]` log line when a symbol is restored from
       the DB, including `symbol`, `exit_reason`, and `cooldown_until`.

FR-06: The system shall emit a `[COOLDOWN_RESTORE_SKIP]` log line when a symbol from the DB
       is already present in `cooldownSymbols`, including `symbol`, `exit_reason`, and
       `source=in_memory`.

FR-07: The system shall replace the existing `[EXIT_COOLDOWN_READY]` log in-place with a
       version that includes `inMemory`, `persistent`, `restored`, and `total` fields.

FR-08: The system shall call `cleanExpiredCooldowns()` once per agent cycle, after all symbol
       evaluation and near the `[EXIT_COOLDOWN_STATS]` log.

FR-09: The system shall wrap `cleanExpiredCooldowns()` in a try/catch and emit
       `[COOLDOWN_CLEAN_FATAL]` to stderr if the call throws.

FR-10: The system shall continue processing normally when `getActiveCooldowns()` returns an
       empty array due to a DB error (degraded-mode: in-memory cooldowns still apply).

## Non-Functional Requirements

NFR-01: The merge block must add no more than one `await` call to the hot path before the
        watchlist evaluation loop — `getActiveCooldowns()`.

NFR-02: `cleanExpiredCooldowns()` must not block the agent cycle return when it fails.

NFR-03: The implementation must produce zero TypeScript errors and pass `npm run build`.

## Constraints

C-01: The `cooldownSymbols` build loop from Fase 1b must not be modified.
C-02: The `COOLDOWN_UNKNOWN_EXIT_REASON` flag and its branch must not be modified.
C-03: The `closedThisCycle` logic must not be modified.
C-04: No changes to setup detection, position sizing, open positions, or `enforceExitRules()`.
C-05: `[EXIT_COOLDOWN_READY]` must appear exactly once — replaced in-place, not duplicated.

## Out of Scope

- Writing new rows to `symbol_cooldowns` (done in Fase 2b-B)
- Changing cooldown durations per exit reason (defined in Fase 2b-B)
- UI/dashboard changes
- Any DB schema migration (table already exists from Fase 2a)
