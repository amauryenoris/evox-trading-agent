# Tasks — CHANGE split-7: extract callClaudeWithRetry from claude-agent.ts (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: one block deletion and one import line; owner authorization in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`, `git rev-parse HEAD`; CR count and line count of `claude-agent.ts`, `CLAUDE.md`, `vitest.config.ts`, `pr-review.yml`; SHA-256 of all goldens, of `specs/docs-5-selector-criteria/tasks.md` and of every `src/lib/*.ts`
- [x] T-02: `npx tsc --noEmit`; characterization file x3 (87/87); full `npx vitest run` (1240 in 80 files); `npx eslint src/lib/claude-agent.ts` (same known warnings); stop and report if any number differs
- [x] T-03: Re-read `claude-agent.ts:437-466` and `:1525-1530`; save the exact HEAD text of `:437-466` outside the repo; confirm no other module imports the block's symbols

### Phase 2 — Observe current behaviour
- [x] T-04: Disposable test through the harness (`claude:` callback throwing errors with `status`, `pump`, `Math.random` fixed at 0, 0.5 and 1): cases a to e of FR-43 to FR-47
- [x] T-05: Case f (`maxRetries` 1 and 0) through a disposable copy of the current function text, per Q-2
- [x] T-06: Write the observed values into `design.md`
- [x] T-07: Delete the disposable test and copy; confirm `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-08: Create `src/lib/__tests__/claude-call.test.ts` (LF): hand-made fake client, `Math.random` spy, fake timers, `console.warn` spy, all restored in `afterEach`; expected values from T-04 to T-06
- [x] T-09: Run it; confirm it fails only because `../claude-call` does not exist, and show the output

### Phase 4 — Move (GREEN)
- [x] T-10: Create `src/lib/claude-call.ts` (LF): `import type Anthropic` and `:437-465` copied byte for byte, `export` added to `callClaudeWithRetry`, one trailing newline
- [x] T-11: Run the new test: all pass
- [x] T-12: Edit `claude-agent.ts` with an EOL-aware script: delete `:437-466`, add the import after `./order-execution`; show the final import lines
- [x] T-13: CR count equals line count; run `tsc` and note any newly unused import (none expected)

### Phase 5 — Registration
- [x] T-14: `pr-review.yml`: add `"src/lib/claude-call.ts"`; confirm YAML parses
- [x] T-15: `vitest.config.ts`: add the `coverage.include` entry
- [x] T-16: `CLAUDE.md`: File Structure row and "Confirm with Amaury" row (CRLF kept)
- [x] T-17: CR counts before and after for the three files

### Phase 6 — Verification
- [x] T-18: `npx tsc --noEmit`
- [x] T-19: Characterization x3 identical (87/87); if any golden or existing test changes, STOP and report
- [x] T-20: Full `npx vitest run`: 1240 + the new tests; report the exact numbers
- [x] T-21: `npx eslint` on `claude-call.ts`, `claude-agent.ts` and the new test; nothing new
- [x] T-22: SHA-256 of all goldens, of `docs-5` `tasks.md` and of every other `src/lib/*.ts` unchanged
- [x] T-23: Byte comparison of `claude-call.ts` (minus the type import and `export`) with the saved HEAD `:437-465`
- [x] T-24: Coverage of `claude-call.ts` from its test, output outside the repo (100% expected); CR counts per touched file
- [x] T-25: `git diff --name-only` and `git status`: only the allowed files; the `claude-agent.ts` diff is only the block deletion and the import
- [x] T-26: Delete temporary files and coverage output

### Phase 7 — Report
- [x] T-27: Write `specs/extract-claude-call/review.md` in the usual format
- [x] T-28: Final report: baseline vs final numbers, moved symbols old and new `file:line`, observed values, verification results, documents citing the symbol or old lines (list, do not fix), pending observations, anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review extract-claude-call to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged apart from the authorized edits

## Estimated Complexity

Low — 29 lines move, the function has no module state and a single call site, and the new module has no runtime import. The care goes to the CRLF Protected Zone edit and to pinning the retry path, which no test covers today.
