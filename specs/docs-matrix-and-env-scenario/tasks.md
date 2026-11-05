# Tasks — CHANGE 0c: docs matrix update + non-default-env scenario (no production code)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: none; `CLAUDE.md` and `SDD.md` are documentation)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-8 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: Record the baseline: `git status`, golden file hashes (`md5sum` of the 16 existing goldens), characterization result (22 tests), full `npx vitest run` count (1,045), and the line endings of `CLAUDE.md` and `SDD.md`.
- [x] T-02: Read `position-sizing.ts`, `protective-stop.ts` and `prompt-builder.ts` exports to write accurate file-table descriptions.
- [x] T-03: Check each workflow for `npm ci`, `npm audit` and `node-version` (grep) and confirm the facts in the design table.

### Phase 2 — Scenario first (RED)
- [x] T-04: Add scenario `(m)` to `claude-agent.characterization.test.ts` (based on (a); sets the three env values in the test body; five independent prompt assertions; two `toMatchFileSnapshot` calls) and confirm it writes only the two new golden files locally.
- [x] T-05: Inspect the two new goldens by eye: the prompt shows 7 / `$20000.00` / 20% / 7% / 7; the record shows the stop price at 7% below the buy and the quantity changed by the stop-loss value; the `MAX_POSITION_SIZE` effect is on the prompt only.
- [x] T-06: Prove the scenario bites: with an uncommitted temporary test that mocks `../prompt-builder` to forward all arguments except `env` replaced by `{}`, run the scenario and confirm it fails; delete the temporary file. Also change one env value and confirm a failure; restore.

### Phase 3 — Documentation
- [x] T-07: `CLAUDE.md`: add the matrix row, the three file-table rows, correct the workflow sentence (and add the pointer sentence per O-3), update the Position sizing paragraph. Preserve line endings.
- [x] T-08: `SDD.md`: change the diagram line and correct the §15 audit sentence (O-1); keep the 60-day note and the ranking text unchanged.
- [x] T-09: Grep both documents: no remaining "All workflows run ... `npm audit`" statement and no remaining "extreme edge override" as an active rule; `git diff` shows only the intended lines.

### Phase 4 — Hook check (read-only)
- [x] T-10: Inspect the project settings, the workspace `.claude/`, the user settings (keys only) and plugin hook files for hooks that name Protected Zone paths; record the finding without printing any value from a settings file.

### Phase 5 — Verification
- [x] T-11: `npx tsc --noEmit`.
- [x] T-12: Full `npx vitest run` (existing tests unchanged and passing, one new).
- [x] T-13: ESLint on the touched test file.
- [x] T-14: Characterization suite three times: identical results, no snapshot written or changed after the first generation; the 16 existing golden hashes equal T-01.
- [x] T-15: `git diff --name-only` shows only `CLAUDE.md`, `SDD.md` and the characterization test file; untracked files are only the two new goldens (and the spec folder).

### Phase 6 — Report
- [x] T-16: Write `.tmp/change-0c-report.md`: document diffs summarized, the hook finding, the new scenario and what each golden shows, the observation about `MAX_POSITION_SIZE`, and the verification results.

## Post-Implementation

- [ ] Run /review docs-matrix-and-env-scenario to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; commit is a separate request from Amaury

## Estimated Complexity

Low. Four small text edits in two documents, one scenario copied from an existing one, and a read-only hook check. The only subtle part is proving, without editing production code, that the new scenario detects a call that passes `{}`.
