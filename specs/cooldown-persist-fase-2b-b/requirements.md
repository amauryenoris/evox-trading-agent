# Requirements — Fase 2b-B: Add computeCooldownUntil() and persist cooldowns after exits

## Context

Prerequisite: Fase 2b-A committed (`db-cooldowns.ts` extracted, `upsertSymbolCooldown` available).

After each agent cycle, `enforceExitRules()` produces an `exitReasons` Map of
`symbol → ExitReason`. This phase wires that Map to the persistent `symbol_cooldowns`
table by adding a `computeCooldownUntil()` helper and a cooldown-write block in
`claude-agent.ts`. The result is that cooldowns survive across GitHub Actions runs,
closing the cross-run re-entry gap identified in the AVGO incident.

## Functional Requirements

FR-01: The system shall provide a synchronous function `computeCooldownUntil(reason, endOfTradingDay, nextTradingDay1, nextTradingDay3)` that returns `Date | null` based on the ExitReason.

FR-02: The system shall map exit reasons to cooldown durations as follows:
- `Z_SCORE_EXIT` → `endOfTradingDay`
- `PROFIT_TARGET` → `endOfTradingDay`
- `TRAILING_STOP` → `nextTradingDay1`
- `EMA_FAILURE` → `nextTradingDay1`
- `STOP_LOSS` → `nextTradingDay3`
- `TIME_STOP` → `null` (no cooldown)
- `UNKNOWN` → `null` (no cooldown)

FR-03: The system shall call `getNextTradingDay()` exactly once per cycle for each of `daysAhead=1` and `daysAhead=3`, using `Promise.all`, before iterating over exits.

FR-04: The system shall compute `endOfTradingDay` as the fixed 21:00 UTC wall-clock of the current day when `now < 21:00 UTC`, and fall back to `nextTradingDay1` otherwise.

FR-05: The system shall call `upsertSymbolCooldown(symbol, reason, cooldownUntil)` for every exit whose `computeCooldownUntil()` returns a non-null date.

FR-06: The system shall emit a `[COOLDOWN_PERSIST]` log line for each persisted cooldown including `symbol=`, `reason=`, `until=` (ISO string), and `source=enforceExitRules`.

FR-07: The system shall process all exits concurrently using `Promise.all` when writing to the database.

FR-08: The system shall wrap the entire cooldown-write block in a `try/catch` so that any DB failure does not abort the agent cycle.

FR-09: The system shall place the cooldown-write block immediately after the `enforceExitRules()` IIFE (line 886) and before the `cooldownSymbols` build block (line 976).

## Non-Functional Requirements

NFR-01: The Alpaca calendar API shall be called at most twice per agent cycle for cooldown purposes (once for `daysAhead=1`, once for `daysAhead=3`).

NFR-02: Zero TypeScript errors after the change.

NFR-03: `npm run build` shall complete successfully.

## Constraints

C-01: `claude-agent.ts` is a Protected Zone file. Amaury must confirm before implementation proceeds.

C-02: `enforceExitRules()` and its return type (`EnforceExitResult`) shall not be modified.

C-03: The `cooldownSymbols` build block (Fase 1b, lines 976–1006) shall not be modified.

C-04: `computeCooldownUntil()` shall be synchronous — it receives pre-fetched `Date` parameters, it does not call any async API internally.

C-05: `upsertSymbolCooldown` shall be imported from `'./db-cooldowns'` directly (not from `'./db'`).

C-06: `getNextTradingDay` shall be added to the existing alpaca import block — not as a separate import statement.

C-07: `ExitReason` shall not be re-imported — it is already imported from `'./types'` at line 49.

## Out of Scope

- Persisting cooldowns after entry-side signals (no entry cooldown writes in this phase)
- Reading cooldowns to gate entries (that is Fase 2c)
- `cleanExpiredCooldowns()` scheduling (that is Fase 2d)
- Timezone-aware market-close calculation (noted as Fase 3)
- Modifying the in-process `cooldownSymbols` Set (Fase 1b) behavior
