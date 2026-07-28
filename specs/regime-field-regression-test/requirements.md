# Requirements — Regime-Field Regression Test (market_regime vs spx_regime)

## Context

`gate-relevance-context`'s peer review (MEDIUM finding) confirmed
`getFingerprintDimensionValue()` ([learning.ts:300-305](../../src/lib/learning.ts#L300-L305))
correctly reads `fp.market_regime` for the "Regime" dimension — the code is
already correct, not a bug. The gap is in the test suite: every fixture
built via `makeFingerprint()` ([gate-relevance-context.test.ts:23-33](../../src/lib/__tests__/gate-relevance-context.test.ts#L23-L33))
leaves `spx_regime` at the same default (`'BULL'`) on both the current and
historical fingerprint in every existing test case, while only
`market_regime` is varied. Both existing "Regime" assertions
([:109](../../src/lib/__tests__/gate-relevance-context.test.ts#L109) and
[:192](../../src/lib/__tests__/gate-relevance-context.test.ts#L192)) pass
without distinguishing "matches because `market_regime` matches" from
"matches because `spx_regime` happens to also match." A future accidental
swap of `fp.market_regime` for `fp.spx_regime` inside
`getFingerprintDimensionValue()` would not be caught by any existing test.

This is a test-only fix — no production code changes.

## Functional Requirements

FR-01: The system shall include a test where `market_regime` is equal
       between the current and historical fingerprint while `spx_regime`
       differs between them, asserting the rendered "Regime" line states
       "matches."

FR-02: The system shall use the existing `makeFingerprint()` helper and the
       existing `describe`/`it` structure already present in
       `gate-relevance-context.test.ts`, without introducing new test
       scaffolding.

FR-03: The system shall NOT modify any existing test case in
       `gate-relevance-context.test.ts` — the new test is additive only.

FR-04: The system shall NOT modify any production code file (`learning.ts`,
       `claude-agent.ts`, `db.ts`, `gate-importance.ts`).

FR-05: The system shall NOT modify `db.trade-evaluations-fingerprint.test.ts`
       or any test file other than `gate-relevance-context.test.ts`.

## Non-Functional Requirements

NFR-01: The new test shall pass against the current (already-correct)
        production code.

NFR-02: The new test shall be verified, as a one-time manual check during
        implementation (not a permanent code change), to actually FAIL if
        `getFingerprintDimensionValue()`'s `'regime'` branch is temporarily
        changed to return `fp.spx_regime` instead of `fp.market_regime` —
        proving the test genuinely guards FR-06 of `gate-relevance-context`
        rather than passing vacuously.

NFR-03: All pre-existing tests in `gate-relevance-context.test.ts` shall
        continue to pass, unmodified.

NFR-04: `npx tsc --noEmit` shall report zero errors.

NFR-05: `npm run build` shall pass with no new errors.

## Constraints

C-01: This feature touches only `src/lib/__tests__/gate-relevance-context.test.ts`
      — not Protected Zone, no `CLAUDE.md`/`SDD.md` confirmation gate
      applies.

C-02: The mirror case (`market_regime` differing while `spx_regime`
      matches, asserting "differs") is optional — include only if it fits
      naturally without duplicating scaffolding; report which was done.

## Out of Scope

- Any change to production code
- Any change to the FR-06 finding's underlying implementation (already
  correct, per the peer review)
- Broader test-coverage improvements beyond this one regression-safety gap
- `db.trade-evaluations-fingerprint.test.ts` or any other test file
