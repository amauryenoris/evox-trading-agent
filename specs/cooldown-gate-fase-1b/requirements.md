# Requirements — Cooldown Gate Fase 1b (Same-Process Re-entry)

## Background

Fase 1a (commit da93d93) added `exitReasons: ReadonlyMap<string, ExitReason>` to
`enforceExitRules()`. However, the call site in `runAgentCycle()` (line 872) only
destructures `decisions`, silently dropping `exitReasons`. Fase 1b captures that
Map and uses it to block same-process re-entry for every exit except `TIME_STOP`.

---

## Functional Requirements

FR-01: The system shall expose `exitReasons` at the `enforceExitRules()` call site
so it is available in the same function scope as the BUY symbol evaluation loop.

FR-02: The system shall declare a module-level boolean constant
`COOLDOWN_UNKNOWN_EXIT_REASON` with a default value of `false`.

FR-03: The system shall build a `cooldownSymbols` Set by iterating `exitReasons`
immediately after `enforceExitRules()` returns and before the BUY symbol loop begins.

FR-04: The system shall add a symbol to `cooldownSymbols` when its `ExitReason` is
not `TIME_STOP` and not `UNKNOWN`.

FR-05: The system shall emit a `[EXIT_COOLDOWN_ADD]` log entry for every symbol
added to `cooldownSymbols`.

FR-06: The system shall emit a `[EXIT_COOLDOWN_UNKNOWN_REASON]` warning when a
symbol's `ExitReason` is `UNKNOWN`.

FR-07: Where `COOLDOWN_UNKNOWN_EXIT_REASON` is `true`, the system shall add symbols
with `ExitReason === 'UNKNOWN'` to `cooldownSymbols`.

FR-08: The system shall NOT add symbols with `ExitReason === 'TIME_STOP'` to
`cooldownSymbols`.

FR-09: The system shall emit `[EXIT_COOLDOWN_READY]` with the total Set size after
the `cooldownSymbols` build loop completes.

FR-10: The system shall skip BUY evaluation for a symbol when that symbol is present
in `closedThisCycle` (GTC stop loss this cycle).

FR-11: The system shall skip BUY evaluation for a symbol when that symbol is present
in `cooldownSymbols` (exit fired by `enforceExitRules()` this process run).

FR-12: The system shall log `[AGENT] <symbol> skipped — cooldown: <skipReason>` where
`skipReason` is `GTC_STOP` for `closedThisCycle` hits or the mapped `ExitReason`
value for `cooldownSymbols` hits.

FR-13: The system shall emit `[EXIT_COOLDOWN_STATS]` once per cycle, immediately
after the BUY symbol loop ends, reporting: total blocked count, per-symbol
`symbol:reason` breakdown for active cooldowns, and per-symbol `symbol:reason`
breakdown for excluded exits (`TIME_STOP` and `UNKNOWN`).

---

## Non-Functional Requirements

NFR-01: Cooldown state is in-process memory only — no database reads or writes are
added by this feature.

NFR-02: The cooldown Set is rebuilt from scratch on every call to `runAgentCycle()`;
it does not persist between GitHub Actions runs.

NFR-03: `enforceExitRules()` must not be modified by this feature.

---

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation
from Amaury. The sole file changed is `src/lib/claude-agent.ts`.

C-02: The `closedThisCycle` Set and its existing GTC-stop logic must remain
unchanged in semantics; only the log message and skip check are consolidated.

C-03: No setup detection, position sizing, or `detectMarketRegime()` logic may
be touched.

---

## Out of Scope

- Cross-run cooldown persistence (Fase 2 — Supabase `symbol_cooldowns` table with
  per-reason durations).
- Per-reason cooldown duration differentiation.
- Dashboard display of current cooldown state.
- Any changes to `enforceExitRules()` or `toExitReason()`.
