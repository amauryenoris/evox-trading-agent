# Design — Regime-Field Regression Test (market_regime vs spx_regime)

## Architecture Decision

This is a test-only addition confined to one existing describe block in
`src/lib/__tests__/gate-relevance-context.test.ts`. No architecture,
runtime behavior, or production code is affected — the fix closes a gap in
the test suite's ability to detect a specific future regression, using
fixtures and assertions in the same style already established in the file.

## Data Flow

Not applicable — this is a static test addition. At test-run time: the new
`it()` block builds two `StateFingerprint` fixtures via the existing
`makeFingerprint()` helper (equal `market_regime`, differing `spx_regime`),
calls the already-exported `buildLearningContext()` exactly as the other
tests in the file do, and asserts on the rendered "Regime" line.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add one test: `market_regime` equal / `spx_regime` differing → asserts "matches" (this spec) | Directly proves the code reads `market_regime`, not `spx_regime`; minimal, uses existing helpers | Only proves one direction (a `spx_regime`-swap bug would be caught, but doesn't independently re-prove the "differs" branch under this specific condition) | **Chosen** |
| Add both the primary case and its mirror (`market_regime` differing / `spx_regime` equal → asserts "differs") | Symmetric proof, closes the gap from both directions | Second case's marginal value is limited — the existing NOK/NFLX test (line 82-113) and the EMA_RECLAIM test (line 166-194) already exercise "Regime differs" paths (with `market_regime` varied), just not with `spx_regime` held misleadingly equal at the same time; adding a second dedicated case duplicates scaffolding for limited extra guarantee | Rejected — not required per spec's own C-02, judgment call: single case with a doc comment explaining why the mirror isn't needed is sufficient |
| Refactor `makeFingerprint()`'s defaults so `spx_regime` and `market_regime` always differ, forcing every future test to be field-precise | Would prevent this entire class of gap by construction | Modifies a shared helper used by all 7 existing tests — higher risk of unintended assertion changes in unrelated tests; also expands scope beyond "add one test" | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/__tests__/gate-relevance-context.test.ts` | MODIFY (additive) | One new `it()` block inside the existing `describe('buildLearningContext() — gate-aware relevance comparison', ...)`. No existing test case altered. |

## Protected Zone Impact

None — this file is not Protected Zone, and no production file is touched.

## Database Changes

None.

## Open Questions

None.
