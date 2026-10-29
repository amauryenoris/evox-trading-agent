# Tasks — Earnings Calendar Follow-up: Snapshot Wiring (T-17) + Migration File Alignment

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone confirmed: one property in `learning.ts`, one property in `claude-agent.ts` (given in the CHANGE text, O-3 = yes)
- [x] O-1 answered or default accepted (type import line in `learning.ts`)
- [x] Database migrations drafted (N/A: file alignment only; the owner already applied the DDL)

## Implementation Checklist

### Phase 1 — Tests first
- [x] T-01: Add wiring tests (RED): `buildLearningContext` forwards `earnings` into the snapshot; `OK` within 5 days gives the prompt line; `UNKNOWN` and `STALE` give no line and no throw; no `earnings` input gives the unchanged text and snapshot keys. Mock `getTradeEvaluations` as in `pattern-library-min-sample-gate.test.ts`; build each flag with `evaluateEarningsGate`.

### Phase 2 — Protected Zone (⚠️ only the two authorized lines)
- [x] T-02: `src/lib/learning.ts`: add `earnings?: EarningsFlag` to `LearningContextInput` and the type-only import it needs.
- [x] T-03: `src/lib/claude-agent.ts`: add `earnings: earningsFlag` to the existing `buildLearningContext` call.
- [x] T-04: Confirm with `git diff` that each Protected file changed only by those lines.

### Phase 3 — Migration file and task file
- [x] T-05: Replace `specs/earnings-calendar/migration.sql` with the applied DDL (do not apply).
- [x] T-06: Confirm `db-earnings.ts` and `scripts/earnings-calendar-sync.ts` use exactly the four columns and the types listed in design.md; no change expected.
- [x] T-07: In `specs/earnings-calendar/tasks.md`: untick the migration line and add "applied by the owner 2026-10-29"; tick T-17.

### Phase 4 — Verification
- [x] T-08: `npx tsc --noEmit` clean.
- [x] T-09: Full `npx vitest run` green.
- [x] T-10: `npm run build` green.

## Post-Implementation

- [ ] Run `/review earnings-calendar-followup` to verify the implementation matches the spec
- [ ] Confirm Protected Zone diff: two lines (plus the type import) and nothing else
- [ ] Report: diff of the Protected Zone lines, the tests added, the audit, and the column/type confirmation
- [ ] Note that no live cycle was run; the first live BUY with a symbol that has a report within 5 days is the first real check of the snapshot field

## Estimated Complexity

Low. Two one-line plumbing edits and tests for a path that is already implemented and covered at the `learning-context.ts` level. The only unverifiable part by unit test is the call-site mapping, covered by the type check and the first-live-day checklist.
