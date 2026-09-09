# Tasks — Raise max_tokens for selectStocksForAnalysis() (CHANGE 1 of 3)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has decided the open placement question (design.md → Open Questions): **local constant in `stock-selector.ts`** (not Protected Zone) — confirmed via question at implementation start
- [x] Protected Zone changes confirmed — only applicable if `config.ts` is the chosen placement; N/A otherwise
- [x] Database migrations drafted — N/A, no schema changes

## Implementation Checklist

### Phase 1 — Constant + call site
- [x] T-01: Add the new named constant (`SELECTION_MAX_TOKENS = 8000` or equivalent name) at the location Amaury chose in Pre-Implementation — either `config.ts` (Protected Zone, only if explicitly confirmed) or as a local module-scoped constant in `stock-selector.ts` alongside `MAX_DAILY_CHANGE_PCT`/`HIGH_RELATIVE_VOLUME_THRESHOLD`/`MAX_POOL_A_CANDIDATES`. Added at `stock-selector.ts:23`, right after the other three local constants.
- [x] T-02: In `stock-selector.ts:168`, replace the inline `max_tokens: 3000` with `max_tokens: <the new constant>` — no other line in the `client.messages.create(...)` call changed. Done.
- [x] T-03: Confirm no other line in `selectStocksForAnalysis()` (screener-fetch, prompt construction, response parsing, Supabase write) was touched. Confirmed via `git diff` — exactly 2 lines changed (the new constant declaration + the one call-site line), nothing else.
- [x] T-04: Confirm `claude-agent.ts` was not modified. Confirmed via `git diff --stat` — empty output.

### Phase 2 — Test update
- [x] T-05: In `stock-selector.test.ts`, update the assertion at (currently) line 312 from `expect.objectContaining({ max_tokens: 3000 })` to `expect.objectContaining({ max_tokens: 8000 })`. Done; test description text also updated ("sets max_tokens to 8000...") for consistency.
- [x] T-06: Search the full `stock-selector.test.ts` file for any other reference to `3000` and confirm none remain (beyond the one now-updated assertion). Confirmed via grep — zero matches for `3000` anywhere in the file.

### Phase 3 — Verification
- [x] T-07: Run `npx tsc --noEmit` — must pass. Passed clean.
- [x] T-08: Run `npm run build` — must pass. Passed clean.
- [x] T-09: Run the full test suite. Report pass/fail counts, with explicit confirmation the updated `stock-selector.test.ts` assertion passes. Full suite: 44/44 files, 400/400 tests. `stock-selector.test.ts` isolated: 12/12 tests, including the updated `max_tokens: 8000` assertion.
- [x] T-10: Report the final line count of both modified files (the constant's host file and `stock-selector.ts`). Since the local-constant placement was chosen, both modified source files are the same one: `stock-selector.ts` — 221 lines. `stock-selector.test.ts` (also modified) — 315 lines.

## Post-Implementation

- [x] Run `/review selection-max-tokens-fix` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged, or changes approved (depends on Pre-Implementation's placement decision). Since the local-constant placement was chosen, no Protected Zone file was touched at all — `git status --porcelain` confirms only `src/lib/stock-selector.ts` and its test file changed.

## Estimated Complexity

Low — a one-value change plus one test-assertion update, fully specified. The only real decision point is the constant's placement (Protected Zone `config.ts` vs. a local constant in the already-not-Protected-Zone `stock-selector.ts`), which is a pre-implementation decision, not an implementation risk.
