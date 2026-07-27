# Requirements — Fix Stale Line-Number References in gate-importance.ts

## Context

`gate-importance.ts`'s sourcing comment (lines 12-25) documents which
`DIMENSION_IMPORTANCE` cells are backed by a real imported constant vs.
manually verified against a specific `claude-agent.ts` line. That comment
was written verbatim as required by the `gate-constants-hoist` spec
(commit `aab908a`), citing the file's line numbers *before* that same
commit's hoist shifted them. The `gate-constants-hoist` review flagged
this as a known, disclosed staleness (MEDIUM finding) at merge time.

Live re-verification (this session) confirms the current, correct line
numbers:
- TREND_PULLBACK ADX floor (`adxValue >= 20`): line 1355 (comment says 1350)
- TREND_ZLE05 ADX floor, `>= 18` branch: line 1362 (comment says 1359)
- TREND_ZLE05 ADX floor, `>= 15` branch: line 1363 (comment says 1360)
- TREND_ZLE05 MACD floor (`macdHistogram > 0`): line 1456 (comment says 1455)

This is a pure comment-text correction. No `DIMENSION_IMPORTANCE` value,
import, export, or gate logic is touched.

---

## Functional Requirements

FR-01: The system shall cite line 1355 (not 1350) for the TREND_PULLBACK
       ADX floor in `gate-importance.ts`'s sourcing comment.

FR-02: The system shall cite lines 1362-1363 (not 1359-1360) for the
       TREND_ZLE05 ADX floor branches in `gate-importance.ts`'s sourcing
       comment.

FR-03: The system shall cite line 1456 (not 1455) for the TREND_ZLE05
       MACD floor in `gate-importance.ts`'s sourcing comment.

FR-04: The system shall update the comment's "as of" date stamp to the
       date this fix is applied.

FR-05: The system shall not alter any other word in the sourcing comment
       beyond the 4 line-number citations and the date stamp.

FR-06: The system shall not alter any value in `DIMENSION_IMPORTANCE`,
       any import, or any export in `gate-importance.ts`.

---

## Non-Functional Requirements

NFR-01: The change shall introduce zero TypeScript compilation errors
        (`npx tsc --noEmit`).

NFR-02: `npm run build` shall pass with no new errors after this change.

NFR-03: The change shall require zero test file modifications.

---

## Constraints

C-01: This feature touches only `src/lib/gate-importance.ts`, which is
      not a Protected Zone file per `CLAUDE.md` / `SDD.md` §17 — no
      Amaury confirmation gate applies.

C-02: No file other than `src/lib/gate-importance.ts` may be modified.

C-03: This is a comment-text-only edit — no code logic, condition, or
      gate behavior anywhere in the codebase may change.

---

## Out of Scope

- Naming or extracting the 4 unnamed inline gate thresholds themselves
- Any "last verified against line N on DATE" convention enforced by a
  test (the open question raised in `gate-constants-hoist`'s design.md —
  belongs to prompt 2/3 or a dedicated follow-up, not this fix)
- Wiring `DIMENSION_IMPORTANCE` into `buildLearningContext()` (prompt 2/3)
- Any change to `claude-agent.ts` or any other file
