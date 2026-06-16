# Requirements — Jun 17 Parte A: Remove Temp Logging ZLE05 + TREND_PULLBACK + EXIT_COOLDOWN

## Context

Temporary logging added during the Jun 2026 calibration experiments is no longer needed.
Analysis was completed on Jun 16. This spec removes that dead weight from `claude-agent.ts`.

The MACD floor infrastructure (`[TREND_PULLBACK_BLOCKED_MACD]`, `wouldPassWithoutMacdFloor`,
`trendPullbackBlockedMacd`) is permanent gate observability — it is explicitly out of scope.

---

## Functional Requirements

FR-01: The system shall not emit `[TREND_ZLE05]` ADX-null log lines during agent cycle execution.

FR-02: The system shall not emit `[TREND_ZLE05_ENTRY]` log lines during agent cycle execution.

FR-03: The system shall not emit `[TREND_ZLE05_REJECTED_Z]` log lines during agent cycle execution.

FR-04: The system shall not emit `[TREND_ZLE05_STATS]` log lines during agent cycle execution.

FR-05: The system shall not emit `[TREND_PULLBACK_ENTRY]` log lines during agent cycle execution.

FR-06: The system shall not emit `[TREND_PULLBACK_HIGH_VOL]` log lines during agent cycle execution.

FR-07: The system shall not emit `[EXIT_COOLDOWN]` log lines when a symbol's exit reason is mapped.

FR-08: The system shall not emit `[EXIT_COOLDOWN_ADD]` log lines when a symbol is added to the cooldown set.

FR-09: The system shall not emit `[EXIT_COOLDOWN_STATS]` log lines at end of cycle.

FR-10: The system shall continue to emit `[TREND_PULLBACK_BLOCKED_MACD]` log lines unchanged.

FR-11: The system shall continue to emit `[TREND_PULLBACK_STATS]` log lines unchanged.

FR-12: Where `[TREND_PULLBACK_STATS]` is emitted, the system shall reference only `trendPullbackBlockedMacd` and `mrBlockedRangingAdxSymbols.size` — both of which remain declared after cleanup.

FR-13: The system shall continue to execute `exitReasons.set()` after removing the `[EXIT_COOLDOWN]` log that followed it.

FR-14: The system shall continue to execute both `cooldownSymbols.add()` calls after removing the `[EXIT_COOLDOWN_ADD]` logs that followed them.

FR-15: The system shall continue to execute the `COOLDOWN_UNKNOWN_EXIT_REASON` conditional logic after removing its associated `[EXIT_COOLDOWN_ADD]` log.

---

## Non-Functional Requirements

NFR-01: After cleanup, `npx tsc --noEmit` shall produce zero errors — no dangling references to removed variables.

NFR-02: After cleanup, `npm run build` shall complete successfully.

NFR-03: The change shall touch exactly one file: `src/lib/claude-agent.ts`.

---

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.
       `src/lib/claude-agent.ts` IS in the Protected Zone — Amaury confirmation required before implementation.

C-02: No other file (`indicators.ts`, `risk-manager.ts`, `config.ts`, `db.ts`, UI components) shall be modified.

C-03: No trading logic, gate condition, or signal detection boolean shall be altered — only logging/observability code is removed.

---

## Out of Scope

- Removing `[TREND_PULLBACK_BLOCKED_MACD]` log — permanent, retained.
- Removing `wouldPassWithoutMacdFloor` variable — permanent, retained.
- Removing `trendPullbackBlockedMacd` counter — permanent, retained.
- Removing `mrBlockedRangingAdxSymbols` Set — permanent, retained.
- Removing `[TREND_PULLBACK_STATS]` log — permanent, retained.
- Any changes to signal detection conditions or exit logic.
- Any dashboard or API changes.
- Any database changes.
