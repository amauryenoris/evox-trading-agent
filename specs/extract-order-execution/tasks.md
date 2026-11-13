# Tasks — CHANGE split-6: extract the IOC order-execution helpers from claude-agent.ts (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: one block deletion, import changes, extended re-export; owner authorization in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`, `git rev-parse HEAD`; CR count and line count of `claude-agent.ts`, `CLAUDE.md`, `vitest.config.ts`, `pr-review.yml`; SHA-256 of all 61 goldens and of `specs/docs-5-selector-criteria/tasks.md`
- [x] T-02: `npx tsc --noEmit`; characterization file x3 (63/63); full `npx vitest run` (1212 in 79 files); `npx eslint src/lib/claude-agent.ts` (three known warnings)
- [x] T-03: Re-read `claude-agent.ts:535-678`; save the exact HEAD text outside the repo; confirm `alpaca`, `config` and `types` do not import the new module

### Phase 2 — Observe current behaviour
- [x] T-04: Disposable script on the current code with a mocked `alpaca` and fake timers: cases a to e of FR-46 to FR-50; record the observed values
- [x] T-05: Write the observed values into `design.md`
- [x] T-06: Delete the disposable script and temp files; confirm `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-07: Create `src/lib/__tests__/order-execution.test.ts` (LF): `vi.hoisted` mocks of `../alpaca` and `../config`, fake timers restored in `afterEach`; expected values from T-04
- [x] T-08: Add the happy path of `executeIocWithRemainderRetry`
- [x] T-09: Run it; confirm it fails only because `../order-execution` does not exist, and show the output

### Phase 4 — Move (GREEN)
- [x] T-10: Create `src/lib/order-execution.ts` (LF): import block, then `:535-677` copied byte for byte, one trailing newline; `buildFillAttempt` and `weightedAvgFillPrice` stay private
- [x] T-11: Run the new test: all pass
- [x] T-12: Edit `claude-agent.ts` with an EOL-aware script: delete `:535-678`, add the import, extend the `export { … }` statement, remove only the unused imports; show the final import and export lines
- [x] T-13: CR count equals line count; run `tsc` and note any other newly unused name

### Phase 5 — Registration
- [x] T-14: `pr-review.yml`: add `"src/lib/order-execution.ts"`; confirm YAML parses
- [x] T-15: `vitest.config.ts`: add the `coverage.include` entry
- [x] T-16: `CLAUDE.md`: File Structure row and "Confirm with Amaury" row (CRLF kept)
- [x] T-17: CR counts before and after for the three files

### Phase 6 — Verification
- [x] T-18: `npx tsc --noEmit`
- [x] T-19: Characterization x3 identical (63/63); if any golden or existing test changes, STOP and report
- [x] T-20: Full `npx vitest run`: 1212 + the new tests; `ioc-fill-verification.test.ts` and `ioc-remainder-retry.test.ts` pass unchanged
- [x] T-21: `npx eslint` on `order-execution.ts`, `claude-agent.ts` and the new test; nothing new
- [x] T-22: SHA-256 of the 61 goldens identical; `git status --short -- src/lib/__tests__/__golden__` empty
- [x] T-23: `git diff --name-only` only allowed files; `docs-5` `tasks.md` SHA unchanged
- [x] T-24: Diff review: the `claude-agent.ts` diff is only the block deletion, the import changes and the extended export; byte-compare the moved text with the saved HEAD block (apart from the import block and `export`)
- [x] T-25: CR counts per touched file; temp files deleted

### Phase 7 — Report
- [x] T-26: Write `specs/extract-order-execution/review.md` in the usual format
- [x] T-27: Final report: baseline vs final numbers, moved symbols old and new `file:line`, observed values, verification results, documents citing old lines (list, do not fix), pending observations, anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review extract-order-execution to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged apart from the authorized edits

## Estimated Complexity

Medium — about 143 lines move and the code places and force-cancels live BUY orders; `claude-agent.ts` is a CRLF Protected Zone file and four branches of the moved code are not pinned by any golden or real test. Mechanically it is a pure move with the same safety net as split-5.
