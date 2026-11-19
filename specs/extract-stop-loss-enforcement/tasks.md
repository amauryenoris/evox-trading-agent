# Tasks — CHANGE split-8: extract enforceStopLosses (Capa B) from claude-agent.ts (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: one block deletion and one import line; Amaury/Jorge authorization in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`, `git rev-parse HEAD`; CR count and line count of `claude-agent.ts`, `CLAUDE.md`, `vitest.config.ts`, `pr-review.yml`; SHA-256 of all goldens, of `specs/docs-5-selector-criteria/tasks.md` and of every `src/lib/*.ts`
- [x] T-02: `npx tsc --noEmit`; characterization file x3 (87/87); full `npx vitest run` (1252 in 81 files); `npx eslint src/lib/claude-agent.ts` (same known warnings); report any difference and continue with the new values unless it affects the move
- [x] T-03: Re-read `claude-agent.ts:447-487` and `:644`; save the exact HEAD text of `:447-487` outside the repo; confirm no other module imports `enforceStopLosses`

### Phase 2 — Observe current behaviour
- [x] T-04: Disposable test through the harness for what it can provoke (cases a, e, and whatever of b, c, d it allows); `Math.random` is not involved
- [x] T-05: Remaining cases (b, c, d as needed) through a disposable copy of the current function text, per Q-2, with `vi.stubEnv` for `STOP_LOSS_PCT`
- [x] T-06: Write the observed values into `design.md`, saying which method produced each
- [x] T-07: Delete the disposable test and copy; confirm `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-08: Create `src/lib/__tests__/stop-loss-enforcement.test.ts` (LF): `vi.hoisted` + `vi.mock` for `../alpaca`, `../db`, `../db-cooldowns`; `vi.stubEnv`/`vi.unstubAllEnvs`; console spies; all restored in `afterEach`; expected values from T-04 to T-06
- [x] T-09: Run it; confirm it fails only because `../stop-loss-enforcement` does not exist, and show the output

### Phase 4 — Move (GREEN)
- [x] T-10: Create `src/lib/stop-loss-enforcement.ts` (LF): the four imports and `:447-486` copied byte for byte, `export` added to `enforceStopLosses`, one trailing newline
- [x] T-11: Run the new test: all pass
- [x] T-12: Edit `claude-agent.ts` with an EOL-aware script: delete `:447-487`, add the import after `./claude-call`; show the final import lines
- [x] T-13: CR count equals line count; run `tsc` and note any newly unused import (none expected)

### Phase 5 — Registration
- [x] T-14: `pr-review.yml`: add `"src/lib/stop-loss-enforcement.ts"`; confirm YAML parses
- [x] T-15: `vitest.config.ts`: add the `coverage.include` entry
- [x] T-16: `CLAUDE.md`: File Structure row and "Confirm with Amaury" row (CRLF kept)
- [x] T-17: CR counts before and after for the three files

### Phase 6 — Verification
- [x] T-18: `npx tsc --noEmit`
- [x] T-19: Characterization x3 identical (87/87); if any golden or existing test changes, STOP and report
- [x] T-20: Full `npx vitest run`: 1252 + the new tests; report the exact numbers
- [x] T-21: `npx eslint` on `stop-loss-enforcement.ts`, `claude-agent.ts` and the new test; nothing new
- [x] T-22: SHA-256 of all goldens, of `docs-5` `tasks.md` and of every other `src/lib/*.ts` unchanged
- [x] T-23: Byte comparison of `stop-loss-enforcement.ts` (minus the import block and `export`) with the saved HEAD `:447-486`
- [x] T-24: Coverage of `stop-loss-enforcement.ts` from its test, output outside the repo (20/20 statements and 8/8 branches expected); CR counts per touched file
- [x] T-25: `git diff --name-only` and `git status`: only the allowed files; the `claude-agent.ts` diff is only the block deletion and the import
- [x] T-26: Delete temporary files and coverage output

### Phase 7 — Report
- [x] T-27: Write `specs/extract-stop-loss-enforcement/review.md` in the usual format
- [x] T-28: Final report: baseline vs final numbers, moved symbols old and new `file:line`, observed values, verification results, documents citing the symbol (list, do not fix), pending observations, anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review extract-stop-loss-enforcement to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged apart from the authorized edits

## Estimated Complexity

Low — 36 lines move, the function has no module state, no shared helper and a single call site. The care goes to the CRLF Protected Zone edit and to pinning the paths no test covers today (boundary, null cooldown date, cooldown failure, unset env) on a live-capital code path.
