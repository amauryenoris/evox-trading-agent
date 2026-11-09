# Tasks — CHANGE docs-6: close the three LOW findings of move 2 (docs + config + one warn log; no trading behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: the three-line guard only; `pr-review.yml` and `vitest.config.ts`: one entry each)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-6 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`; record the CR count and line count of `claude-agent.ts`, `CLAUDE.md`, `SDD.md`, `vitest.config.ts`, `pr-review.yml`, `gate-importance.ts` and the self-flagged test; note the SHA-256 of `specs/docs-5-selector-criteria/tasks.md`
- [x] T-02: `npx tsc --noEmit`; the characterization file three times; full `npx vitest run` (expected 1080); `npx eslint` on `claude-agent.ts` (record the 3 known warnings); record the results
- [x] T-03: Re-read every citation of L-1 and every target symbol (FR-01); record old and new location

### Phase 2 — L-1 citations
- [x] T-04: Grep `claude-agent\.ts:[0-9]` over `SDD.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `.claude`, `src`, `scripts`; record all hits; report any hit outside the four known without editing it
- [x] T-05: `SDD.md` line 284: replace the two citations (CRLF-aware script); show old -> new
- [x] T-06: `SDD.md` line 290: replace the citation and the three bare line references; show old -> new
- [x] T-07: `gate-importance.ts` line 10: comment only; show old -> new
- [x] T-08: `self-flagged-disqualifying-risk.test.ts` line 72: comment only; show old -> new
- [x] T-09: Re-run the grep of T-04; confirm only intended hits changed

### Phase 3 — L-2 config and docs
- [x] T-10: `vitest.config.ts`: add `'src/lib/exit-cooldown.ts'` to `coverage.include`
- [x] T-11: `pr-review.yml`: add `"src/lib/exit-cooldown.ts"` after `"src/lib/prompt-builder.ts"`; confirm the file still parses as YAML and the diff matches the shape of `2d96902`
- [x] T-12: `CLAUDE.md`: add the File Structure row (after `protective-stop.ts`) and the "Confirm with Amaury" row (after `prompt-builder.ts`); CRLF kept
- [x] T-13: CR counts before and after for the three files (T-01 vs now)

### Phase 4 — L-3 guard (tests first)
- [x] T-14: Create `src/lib/__tests__/time-stop-invalid-timestamp.test.ts` (LF) with the three assertions of FR-33 to FR-35
- [x] T-15: Run it; confirm the invalid-timestamp test fails because the warning is not emitted yet
- [x] T-16: Edit `claude-agent.ts` with an EOL-aware script: insert the three guard lines directly before `if (!exitReason && daysOpen >= 20)`; no other change
- [x] T-17: Run the new test: all pass
- [x] T-18: Show the `claude-agent.ts` diff (three added lines, zero deleted); confirm `daysOpen >= 20` and the lines around it are byte-identical; confirm CR count equals line count

### Phase 5 — Verification
- [x] T-19: `npx tsc --noEmit`
- [x] T-20: Characterization file three times, identical results; if any golden changes, STOP and report the diff
- [x] T-21: Full `npx vitest run`; report the count against 1080 plus the new tests
- [x] T-22: `npx eslint` on `claude-agent.ts`, `gate-importance.ts`, the self-flagged test and the new test; compare with the baseline warnings
- [x] T-23: `git status --short -- src/lib/__tests__/__golden__` is empty
- [x] T-24: `git diff --name-only` shows only the allowed files; `specs/docs-5-selector-criteria/tasks.md` SHA unchanged
- [x] T-25: CR counts per touched file reported (CRLF files still CRLF only, LF files still LF only)

### Phase 6 — Report
- [x] T-26: Write `specs/docs-6-move2-followups/review.md` in the format of `specs/extract-exit-cooldown-helpers/review.md`
- [x] T-27: Final report: each L-1 edit old -> new, any citation left, any other grep hit, the three-line diff, test counts, golden status, line endings, anything not verified; do not commit or push

## Post-Implementation

- [ ] Run /review docs-6-move2-followups to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

Low-Medium — each edit is small, but seven files with mixed line endings are touched and one is a Protected Zone CRLF file with a live exit path nearby, so the byte-identical and CR-count checks are most of the work.
