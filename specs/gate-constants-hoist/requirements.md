# Requirements — Hoist 3 Named Gate Constants + gate-importance.ts

## Context

Three gate thresholds inside `runAgentCycle()` (`claude-agent.ts`) already have
descriptive names — `mrRangingAdxFloor` (18), `trendPullbackMacdFloor` (-2.0),
`lowAdxMacdBoost` (0.25) — but are declared function-local, so nothing outside
`runAgentCycle()` can import them. Four other gate thresholds (TREND_PULLBACK's
ADX floor of 20; TREND_ZLE05's ADX floors of 18/15; TREND_ZLE05's MACD floor of
0) are unnamed inline literals.

This is step 1 of a 3-part series building toward a relevance-aware
"RECENT TRADE LESSONS" section in `buildLearningContext()`. This step only
hoists the 3 already-named constants to module scope and creates a new static
lookup table (`gate-importance.ts`) documenting per-setup dimension
importance — it does not wire that table into any runtime prompt-building
code. That wiring is prompt 2/3. Softening `self_flagged_disqualifying_risk`
wording is prompt 3/3. Neither is in scope here.

Verified live immediately before writing this spec (2026-07-24):
`lowAdxMacdBoost` at claude-agent.ts:1354, `mrRangingAdxFloor` at :1380,
`trendPullbackMacdFloor` at :1398 — all three still function-local to
`runAgentCycle()`, not exported. `src/lib/gate-importance.ts` does not exist.

---

## Functional Requirements

FR-01: The system shall expose `mrRangingAdxFloor`, `trendPullbackMacdFloor`,
       and `lowAdxMacdBoost` as module-level named exports from
       `claude-agent.ts`.

FR-02: The system shall preserve the existing numeric value of each relocated
       constant unchanged (`mrRangingAdxFloor = 18`,
       `trendPullbackMacdFloor = -2.0`, `lowAdxMacdBoost = 0.25`).

FR-03: The system shall continue to evaluate the MEAN_REVERSION RANGING+ADX
       gate, the TREND_PULLBACK MACD floor gate, and the TREND_ZLE05 low-ADX
       MACD boost condition identically to current behavior after the
       relocation.

FR-04: The system shall provide a new module, `src/lib/gate-importance.ts`,
       exporting a `GateImportance` type (`'hard-gated' | 'soft-referenced' |
       'not-gated'`) and a `DIMENSION_IMPORTANCE` lookup table classifying
       ADX/MACD/z/regime relevance for each of the 4 signal types.

FR-05: Where a `DIMENSION_IMPORTANCE` cell's classification is backed by one
       of the 3 relocated constants, the system shall source that value via
       import from `claude-agent.ts` rather than duplicating it as a literal.

FR-06: The system shall leave the 4 unnamed inline gate thresholds
       (TREND_PULLBACK ADX-20; TREND_ZLE05 ADX-18/15; TREND_ZLE05 MACD-0)
       unmodified, unnamed, and unextracted.

FR-07: The system shall not alter the behavior, evaluation order, or outcome
       of any gate condition in `runAgentCycle()`.

---

## Non-Functional Requirements

NFR-01: The change shall introduce zero TypeScript compilation errors
        (`npx tsc --noEmit`).

NFR-02: The change shall not introduce a circular import between
        `claude-agent.ts` and `gate-importance.ts`.

NFR-03: The change shall require zero test file modifications, since gate
        behavior is unchanged by construction.

NFR-04: `npm run build` shall pass with no new errors after this change.

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, which is Protected Zone
      per `SDD.md` §17 ("Decision pipeline, signal detection, exit rules,
      position sizing formula"). Scope is restricted to relocating 3 existing
      declarations and adding `export` — no condition, value, or ordering may
      change.

C-02: The 4 unnamed inline gate thresholds are explicitly out of scope for
      naming or extraction in this prompt and in prompts 2/3 and 3/3 of this
      series.

C-03: `gate-importance.ts` must not be imported by any runtime code path
      (`buildLearningContext`, prompt construction, etc.) in this prompt —
      wiring is reserved for prompt 2/3.

C-04: No test file may be modified as part of this change. If implementation
      reveals a test would need to change, implementation must stop and
      report rather than modify the test.

C-05: `state-fingerprint.ts`, `learning.ts`, and any `SYSTEM_PROMPT` text are
      out of scope for this prompt.

---

## Out of Scope

- Naming or extracting the 4 unnamed inline gate thresholds
- Wiring `DIMENSION_IMPORTANCE` into `buildLearningContext()` or any
  prompt-building code (prompt 2/3)
- Softening `self_flagged_disqualifying_risk` example wording (prompt 3/3)
- Any change to `state-fingerprint.ts`, `learning.ts`, or `SYSTEM_PROMPT` text
- Any change to gate condition values, thresholds, or logic
- Any database schema change
