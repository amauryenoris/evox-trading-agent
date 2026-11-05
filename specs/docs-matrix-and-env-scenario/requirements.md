# Requirements — CHANGE 0c: docs matrix update + non-default-env scenario (no production code)

## Functional Requirements

### A. CLAUDE.md — permission matrix and file structure
FR-01: The system shall add a row for `src/lib/prompt-builder.ts` to the "Confirm with Amaury before touching" table of `CLAUDE.md`.
FR-02: The system shall state in that row that the module builds the exact text Claude receives and that changes alter analyst input.
FR-03: The system shall add a row for `prompt-builder.ts` to the `src/lib/` table of the File Structure section of `CLAUDE.md`.
FR-04: The system shall add a row for `position-sizing.ts` to that table if it is missing.
FR-05: The system shall add a row for `protective-stop.ts` to that table if it is missing.
FR-06: The system shall write each new row with a description that matches what the module does today (checked against the source).

### B. CLAUDE.md — workflow statement
FR-07: The system shall check every file under `.github/workflows/` for `npm ci`, `npm audit` and the Node version before editing the statement.
FR-08: The system shall replace the sentence "All workflows run `npm ci` + `npm audit --audit-level=critical` before executing." with a statement that matches what the workflows do today.
FR-09: The replacement shall state that every workflow installs dependencies with `npm ci` on Node 24.
FR-10: The replacement shall state that `npm audit` runs only in `security-audit.yml`, on weekdays, with the level `critical` unless a manual run chooses another.
FR-11: The replacement shall state that the other workflows do not run `npm audit`.
FR-12: The replacement shall not claim any behaviour that the workflow files do not show.

### C. CLAUDE.md — position sizing paragraph
FR-13: The system shall update the "Position sizing" paragraph of `CLAUDE.md` to state that the z <= -2 override is disabled.
FR-14: The paragraph shall name the flag `Z_SIZING_OVERRIDE_ENABLED` and its value `false` in `position-sizing.ts`.
FR-15: The paragraph shall state that the confidence factor `max(0.5, confidence)` applies to every entry.
FR-16: The paragraph shall state that the override code path is kept dormant.
FR-17: The system shall leave the rest of the formula in that paragraph unchanged.

### D. SDD.md
FR-18: The system shall change the sizing flow diagram in `SDD.md` so that the line "= baseShares if zScore <= -2.0 (extreme edge override)" no longer describes the override as active.
FR-19: The changed text shall state that the override is disabled (`Z_SIZING_OVERRIDE_ENABLED = false`), that the code path is kept dormant, and that the confidence factor applies to every entry.
FR-20: The system shall keep the 60-day inactivity note in section 15 of `SDD.md` unchanged.
FR-21: The system shall leave the ranking section (`z-score <= -2.0 wins over all`) of `SDD.md` unchanged, because the ranking comparator is independent of the sizing flag.
FR-22: If `SDD.md` repeats the stale "all workflows run `npm audit`" statement, the system shall correct it with the same facts as FR-09 to FR-11 (design O-1).
FR-23: The system shall preserve the line endings of `CLAUDE.md` and `SDD.md`.
FR-24: The system shall change no line of either document other than those named in FR-01 to FR-22.

### E. Hook check (report only)
FR-25: The system shall inspect `.claude/settings.json` of the project for `hooks` entries (PreToolUse or similar) that guard Protected Zone paths.
FR-26: The system shall inspect the other hook locations that STEP 0 named (workspace `.claude/`, the user settings and plugin hook files) for such entries.
FR-27: The system shall report whether `src/lib/prompt-builder.ts` is covered by any hook found.
FR-28: The system shall report "no hook found" explicitly if none exists, and shall not infer coverage.
FR-29: The system shall not edit any settings file.
FR-30: The system shall not print any token, key or other secret from any settings file, and shall report keys and structure only.

### F. New characterization scenario (M-2)
FR-31: The system shall add one scenario to the characterization test that runs `runAgentCycle` with `MAX_POSITIONS`, `MAX_POSITION_SIZE` and `STOP_LOSS_PCT` each set to a value different from its default.
FR-32: The scenario shall use the values `MAX_POSITIONS=7`, `MAX_POSITION_SIZE=0.20` and `STOP_LOSS_PCT=0.07`.
FR-33: The scenario shall record the prompt text sent to Claude as a golden file.
FR-34: The scenario shall record the usual record (decisions, orders, agent log, contexts, call log) as a golden file.
FR-35: The scenario shall assert, independently of the golden, that the prompt contains `Open Positions: 0/7`, `Max Position Value Allowed: $20000.00`, `Max Position Size: 20% of equity ($20000.00)`, `Stop Loss: 7% below entry` and `Max Simultaneous Positions: 7`.
FR-36: The system shall generate the two new golden files once from the current code.
FR-37: The system shall leave every existing golden file unchanged.
FR-38: The system shall show that a call passing `{}` instead of `process.env` would fail the new scenario, without editing any production file.
FR-39: The system shall restore the environment variables after the scenario.
FR-40: The report shall explain the new golden, including what each env value changes in the recorded output.

### G. Verification and report
FR-41: The system shall pass `npx tsc --noEmit`.
FR-42: The system shall pass the full `npx vitest run`.
FR-43: The system shall pass ESLint on every touched test file.
FR-44: The system shall run the characterization suite three times with identical results.
FR-45: The system shall show with `git diff --name-only` that the only tracked files changed are `CLAUDE.md`, `SDD.md` and test files.
FR-46: The system shall write the report to `.tmp/change-0c-report.md`.
FR-47: The report shall contain a summary of the document diffs, the hook finding, the new scenario and golden, and the verification results.
FR-48: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall modify no file under `src/lib` other than test files and test-support files.
NFR-02: The change shall print no secret value.
NFR-03: Verification shall make no network call and no live trading call.
NFR-04: Claims in the report that could not be verified shall be labelled as such.

## Constraints

C-01: The change shall edit only `CLAUDE.md`, `SDD.md`, the characterization test file, the harness support files if needed, and new golden files.
C-02: The change shall not modify any Protected Zone file.
C-03: The change shall not regenerate, edit or delete any existing golden file.
C-04: The change shall not change any threshold, flag or logic.
C-05: The change shall not edit `.claude/settings.json` or any hook.
C-06: The change shall not commit, push, branch or open a PR.

## Out of Scope

- Adding `position-sizing.ts` or `protective-stop.ts` to the "Confirm with Amaury" matrix (design O-2).
- Correcting other stale facts in the documents, for example `MAX_SPREAD_BPS = 50` in `CLAUDE.md` and `SDD.md` while `config.ts` has 100.
- Documenting the other extracted modules (`sma5-exit`, `peak-high`, `earnings-window`, `earnings-gate-context`, `learning-context` and so on) in the File Structure table.
- Installing or changing a hook that guards the new module.
- Fixing the observation that `MAX_POSITION_SIZE` changes only the prompt text and not the sizing cap.
- Any further extraction step of `claude-agent.ts`.
