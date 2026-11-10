# Tasks — CHANGE split-4: extract the legacy signal classifier and the rotation chooser (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: one block deletion and one import line; owner authorization given in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`; record CR count and line count of `claude-agent.ts`, `CLAUDE.md`, `vitest.config.ts`, `pr-review.yml`; SHA-256 of `specs/docs-5-selector-criteria/tasks.md`
- [x] T-02: `npx tsc --noEmit`; the characterization file three times; full `npx vitest run` (expected 1114 in 77 files); `npx eslint src/lib/claude-agent.ts` (three known warnings)
- [x] T-03: Re-read `claude-agent.ts:618-711` and `:1523-1549`; save the exact text of the block for the later byte comparison; grep that `ZSCORE_ENTRY_THRESHOLD`, `TechnicalIndicators` and `AlpacaPosition` have other uses in the file; grep that `config.ts` and `types.ts` do not import the new module

### Phase 2 — Observe current behaviour
- [x] T-04: Throwaway script on the current text, covering every case listed in FR-47 to FR-63; record the observed values
- [x] T-05: Delete the throwaway script; confirm `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-06: Create `src/lib/__tests__/signal-rotation.test.ts` (LF) with the `generateSignalType` cases; expected values from T-04
- [x] T-07: Add the `evaluateRotation` cases, including the exact priority-1 reason text
- [x] T-08: Run it; confirm it fails because `../signal-rotation` does not exist

### Phase 4 — Move (GREEN)
- [x] T-09: Create `src/lib/signal-rotation.ts` (LF) with the banners, the two interfaces and the two functions, `export` added, and the three imports
- [x] T-10: Run the new test: all pass
- [x] T-11: Edit `claude-agent.ts` with an EOL-aware script: delete the block (`:620-708`) and add the import line after `./execution-gates`; no other change
- [x] T-12: Confirm `claude-agent.ts` CR count equals its line count and the call-site block is byte-identical; run `tsc` and note any newly unused import name

### Phase 5 — Registration
- [x] T-13: `pr-review.yml`: add `"src/lib/signal-rotation.ts"` and `"src/lib/macro-bars-staleness.ts"` after `"src/lib/execution-gates.ts"`; check that the file still parses as YAML
- [x] T-14: `vitest.config.ts`: add the two entries to `coverage.include`
- [x] T-15: `CLAUDE.md`: add the File Structure row and the "Confirm with Amaury" row (CRLF kept)
- [x] T-16: CR counts before and after for the three files

### Phase 6 — Verification
- [x] T-17: `npx tsc --noEmit`
- [x] T-18: Characterization file three times, identical results; if any golden changes (including `h-rotation-close.json`), STOP and report the diff
- [x] T-19: Full `npx vitest run`; report the count against 1114 plus the new tests
- [x] T-20: `npx eslint` on `signal-rotation.ts`, `claude-agent.ts` and the new test; nothing new against the baseline
- [x] T-21: `git status --short -- src/lib/__tests__/__golden__` is empty
- [x] T-22: `git diff --name-only` shows only allowed files; `docs-5` `tasks.md` SHA unchanged
- [x] T-23: Diff review: the `claude-agent.ts` diff is only the block deletion and the import; byte-compare the moved text with the deleted text (apart from `export`); `git diff --stat`
- [x] T-24: CR counts per touched file

### Phase 7 — Report
- [x] T-25: Write `specs/extract-signal-rotation/review.md` in the usual format
- [x] T-26: Final report: moved symbols with old and new `file:line`, test counts, golden status, line endings, docs citing moved lines (list, do not fix), observations (do not fix), anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review extract-signal-rotation to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

Low-Medium — about 90 lines move, but the rotation chooser can close a live position, `claude-agent.ts` is a Protected Zone CRLF file, golden `h-rotation-close.json` pins the reason text, and registration touches a workflow.
