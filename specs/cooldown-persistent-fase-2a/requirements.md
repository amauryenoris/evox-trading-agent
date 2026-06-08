# Requirements — Fase 2a: Persistent Cooldown — DB Functions + Calendar Helper

## Context

Fase 1b added in-process cooldowns (`cooldownSymbols`, `closedThisCycle`, `exitReasons`).
These are ephemeral — they reset every agent cycle. Fase 2a adds the persistence layer:
three DB functions in `db.ts` and one calendar helper in `alpaca.ts`. No agent wiring yet
(that is Fase 2b).

The Supabase table `symbol_cooldowns` and the SQL RPC function `upsert_symbol_cooldown`
are already deployed in production.

---

## Functional Requirements

FR-01: The system shall expose a `upsertSymbolCooldown(symbol, exitReason, cooldownUntil)` function that writes a cooldown record to the `symbol_cooldowns` table via the `upsert_symbol_cooldown` SQL RPC.

FR-02: Where a cooldown record already exists for the given symbol, the system shall preserve the longer cooldown (longer-wins semantics enforced by the DB RPC, not by application code).

FR-03: The system shall expose a `getActiveCooldowns()` function that returns all rows from `symbol_cooldowns` where `cooldown_until` is strictly greater than the current UTC timestamp.

FR-04: `getActiveCooldowns()` shall return an array of objects with shape `{ symbol: string, exit_reason: string, cooldown_until: string }`.

FR-05: The system shall expose a `cleanExpiredCooldowns()` function that deletes all rows from `symbol_cooldowns` where `cooldown_until` is less than or equal to the current UTC timestamp.

FR-06: The system shall expose a `getNextTradingDay(fromDate, daysAhead?)` function that returns midnight UTC of the Nth next trading day after `fromDate`, using the Alpaca `/v2/calendar` endpoint.

FR-07: `getNextTradingDay` shall exclude `fromDate` itself — only trading days strictly after `fromDate` are counted.

FR-08: Where the Alpaca calendar API returns fewer trading days than `daysAhead`, `getNextTradingDay` shall fall back to adding `daysAhead` calendar days to `fromDate` and returning midnight UTC of that date.

FR-09: Where the Alpaca calendar API call throws an error, `getNextTradingDay` shall fall back to adding `daysAhead` calendar days to `fromDate` and return midnight UTC of that date.

FR-10: Both fallback paths in `getNextTradingDay` shall return a `Date` in the form `YYYY-MM-DDT00:00:00Z` (midnight UTC, no DST dependency).

FR-11: The system shall log DB errors using structured console tags: `[COOLDOWN_WRITE_ERROR]`, `[COOLDOWN_READ_ERROR]`, `[COOLDOWN_CLEAN_ERROR]`.

FR-12: The system shall log calendar fallback events using console tags: `[CALENDAR_FALLBACK]`.

FR-13: Where `upsertSymbolCooldown` encounters a Supabase error, the system shall log the error and return without throwing.

FR-14: Where `getActiveCooldowns` encounters a Supabase error, the system shall log the error and return an empty array.

FR-15: Where `cleanExpiredCooldowns` encounters a Supabase error, the system shall log the error and return without throwing.

---

## Non-Functional Requirements

NFR-01: All three DB functions shall call `getClient()` internally and use the returned client — they must not rely on any module-level Supabase variable.

NFR-02: `getNextTradingDay` shall query the Alpaca calendar with an end date of `fromDate + daysAhead * 7` days to ensure the window is wide enough.

NFR-03: All new code shall compile without TypeScript errors (`npm run build`).

---

## Constraints

C-01: This feature must not modify any existing function in `db.ts` or `alpaca.ts`.

C-02: This feature must not modify `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `config.ts`, or any file in the Protected Zone.

C-03: This feature must not affect open positions (UUUU, NEM, GOOGL, TSLA) or `enforceExitRules()`.

C-04: The existing Fase 1b cooldown logic (`cooldownSymbols`, `closedThisCycle`, `exitReasons`, `COOLDOWN_UNKNOWN_EXIT_REASON`) must remain unchanged.

---

## Out of Scope

- Wiring the new DB functions into the agent cycle (Fase 2b).
- Any dashboard UI for cooldown state.
- Any API route for cooldown data.
- Migrations — the `symbol_cooldowns` table and `upsert_symbol_cooldown` RPC are already deployed.
