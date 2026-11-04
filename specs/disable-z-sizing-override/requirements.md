# Requirements — Disable the z <= -2 sizing override

## Functional Requirements

### A. Flag
FR-01: The system shall define `Z_SIZING_OVERRIDE_ENABLED` as `false` in `src/lib/position-sizing.ts`.
FR-02: The system shall keep the `Z_SIZING_OVERRIDE_ENABLED` export in the same module.
FR-03: The system shall keep the override code path in `computeBuyQuantity` and the optional `zOverrideEnabled` input, so the override can be re-enabled by changing the flag.
FR-04: The system shall not change `Z_OVERRIDE_THRESHOLD`, `MAX_POSITION_EQUITY_FRACTION`, `BUYING_POWER_FRACTION`, `MIN_CONFIDENCE_FACTOR`, `MAX_CONFIDENCE_FACTOR`, the regime multipliers or the EMA_RECLAIM factor.

### B. Sizing behaviour with the flag false
FR-05: When the flag is false and no `zOverrideEnabled` input is given, the system shall apply the confidence factor to an entry whose z-score is -2.0 or lower.
FR-06: When the flag is false and the confidence is 0.32, the system shall use a confidence factor of 0.5 for an entry with z-score -2.13.
FR-07: When the flag is false and the confidence is 0.80, the system shall use a confidence factor of 0.80 for an entry with z-score -2.13.
FR-08: When the flag is false, the system shall compute the adjusted quantity of an entry with z-score -2.0 or lower as the rounded product of the capped base quantity and the confidence factor.
FR-09: When the flag is false, the system shall report `zOverrideApplied` as false in the sizing breakdown.
FR-10: When the flag is false, the system shall compute entries with z-score above -2.0 exactly as before the change.
FR-11: The system shall compute the capped base quantity (regime multiplier, Kalman halving, buying-power cap, equity cap) exactly as before the change.

### C. Flag true stays supported
FR-12: When `zOverrideEnabled` is true, the system shall discard the confidence factor for an entry with z-score -2.0 or lower, as before the change.
FR-13: The system shall keep a test that proves FR-12 against the production golden quantities.
FR-14: The system shall keep the differential test against the frozen pre-refactor code, running it with the override explicitly enabled.

### D. Tests
FR-15: The system shall have a test that the default flag value is false.
FR-16: The system shall have a test for FR-06 that does not pass `zOverrideEnabled`.
FR-17: The system shall have a test for FR-07 that does not pass `zOverrideEnabled`.
FR-18: The system shall have a test that the sizing breakdown of the MP 2026-10-13 case with the default flag reports a confidence factor of 0.5, adjusted shares equal to the rounded half of the base shares, and `zOverrideApplied` false.
FR-19: The system shall update only those existing test expectations that depend on the flag default.

### E. Callers, logs, prompts and snapshots (investigate and report)
FR-20: The system shall confirm that the call site of `computeBuyQuantity` in `src/lib/claude-agent.ts` does not pass `zOverrideEnabled`.
FR-21: The system shall list every log line, snapshot field, prompt text and document that says or implies that z <= -2 receives full size.
FR-22: The system shall not edit `src/lib/claude-agent.ts`, the prompt text or any Protected Zone file to remove such a mention.
FR-23: The system shall report the ranking comparator that prefers z <= -2 candidates as a separate mechanism that this change does not alter.

### F. Verification and report
FR-24: The system shall run `npx tsc --noEmit` and report the result.
FR-25: The system shall run the full `npx vitest run` and report the result.
FR-26: The system shall run `npm run build` and report the result.
FR-27: The system shall run ESLint on the touched files and report the result.
FR-28: The system shall confirm with `git diff --name-only` which files changed and that no Protected Zone file is among them.
FR-29: The system shall write the report to `.tmp/z-override-off-report.md`.
FR-30: The report shall state where the flag lives, every place it is read, the diff summary, the test results, and anything in logs, prompts or documents that still mentions the override.
FR-31: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall print no secret value.
NFR-02: Verification shall make no live trading call (no `npm run cycle`, `exit-only` or `report`) and no Alpaca or Supabase call.
NFR-03: The change shall not alter, resize, sell or otherwise touch any open position.
NFR-04: The report shall label any claim that could not be verified.

## Constraints

C-01: The change shall not modify `src/lib/config.ts` or any other Protected Zone file (the flag lives outside the Protected Zone).
C-02: The change shall edit only `src/lib/position-sizing.ts` and `src/lib/__tests__/position-sizing.test.ts`.
C-03: The change shall not change any other constant, rule, threshold or setup logic.
C-04: The change shall not commit, push, branch or open a PR.

## Out of Scope

- The ranking comparator in `claude-agent.ts` (lines 2628-2629) that orders queued candidates by `z <= -2.0` first.
- Editing `SDD.md` line 88 ("= baseShares if zScore <= -2.0 (extreme edge override)") or any other documentation (reported, not edited, unless Amaury asks).
- Changing the confidence floor of 0.5 or the equity cap of 10%.
- Resizing, selling or modifying positions already open (INTC, AAPL or others).
- Deleting the override code path or its optional input.
- Deployment: the flag takes effect for the scheduled workflows only once the change is on `main`.
