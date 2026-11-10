# Requirements — CHANGE split-4: extract the legacy signal classifier and the rotation chooser (pure move, no behaviour change)

Baseline: HEAD `97584b5` (full suite 1114 tests in 77 files; characterization 23/23; three known ESLint warnings in `claude-agent.ts`). Line numbers are at that HEAD and are re-read at implementation.

## Functional Requirements

### A. What moves

FR-01: The system shall create the module `src/lib/signal-rotation.ts`.
FR-02: The system shall move `SignalResult` (`claude-agent.ts:624-627`) to the new module as an exported interface.
FR-03: The system shall move `generateSignalType` (`claude-agent.ts:629-660`) to the new module as an exported function.
FR-04: The system shall move `RotationDecision` (`claude-agent.ts:666-670`) to the new module as an exported interface.
FR-05: The system shall move `evaluateRotation` (`claude-agent.ts:672-707`) to the new module as an exported function.
FR-06: The system shall move the "SIGNAL TYPE DETECTOR" and "POSITION ROTATION" section banners with the code they head.
FR-07: The system shall keep `evaluateRotation` declared `async`.
FR-08: The system shall leave the call-site block of `runAgentCycle` (`claude-agent.ts:1523-1549`) unchanged: the `[SIGNAL]` log, the `positions.length >= 5 && signalResult.type !== 'NO_SIGNAL'` trigger, `closePosition`, `decisions.push`, the `splice`, and the `[ROTATION]` logs.

### B. Pure move

FR-09: The system shall copy the bodies, comments and string literals of the moved code without any textual change, apart from the `export` keyword.
FR-10: The system shall keep the priority-1 reason text `z-score ${zScore.toFixed(3)} reverted to fair value` byte-identical.
FR-11: The system shall keep every signature unchanged.
FR-12: The system shall not rename any moved symbol.
FR-13: The system shall not add any parameter, clock injection or logger injection.
FR-14: The new module shall import only `ZSCORE_ENTRY_THRESHOLD` from `./config` and the types `TechnicalIndicators` and `AlpacaPosition` from `./types`.
FR-15: The new module shall not import from `claude-agent.ts`.
FR-16: The system shall not edit `config.ts`.
FR-17: The new module shall be written with LF line endings.
FR-18: The system shall confirm that neither `config.ts` nor `types.ts` imports `signal-rotation.ts` (no import cycle).
FR-19: The system shall not fix or change any rule it observes (the legacy RSI and %B criteria, the literal `5`, the `z >= -0.8` rule, the stable sort).

### C. Edits to claude-agent.ts (and only these)

FR-20: The system shall delete from `claude-agent.ts` the block that runs from the "SIGNAL TYPE DETECTOR" banner to the end of `evaluateRotation`, with the blank line that follows it (about `:620-708`).
FR-21: The system shall add the line `import { generateSignalType, evaluateRotation } from './signal-rotation'` to `claude-agent.ts`, directly after the `./execution-gates` import.
FR-22: The system shall keep the imports of `ZSCORE_ENTRY_THRESHOLD`, `TechnicalIndicators` and `AlpacaPosition` in `claude-agent.ts`.
FR-23: The system shall remove from the imports of `claude-agent.ts` only a name that `tsc` or ESLint show as newly unused, and shall list each such name in the report.
FR-24: The system shall not change any call site, comment or other line of `claude-agent.ts`.
FR-25: The system shall write every touched line of `claude-agent.ts` in CRLF.
FR-26: The system shall keep the CR count of `claude-agent.ts` equal to its line count.

### D. Registration

FR-27: The system shall add `"src/lib/signal-rotation.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, after `"src/lib/execution-gates.ts"`, with the same indent.
FR-28: The system shall add `"src/lib/macro-bars-staleness.ts"` to the same array, after `"src/lib/signal-rotation.ts"`, with the same indent.
FR-29: The system shall add `'src/lib/signal-rotation.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/execution-gates.ts'`.
FR-30: The system shall add `'src/lib/macro-bars-staleness.ts'` to `coverage.include`, after `'src/lib/signal-rotation.ts'`.
FR-31: The system shall add one row for `signal-rotation.ts` to the `src/lib/` File Structure table in `CLAUDE.md`, after the `execution-gates.ts` row.
FR-32: The File Structure row shall say that the module is the legacy signal classifier (RANGING/TRENDING criteria) and the position-rotation chooser, used only for the `[SIGNAL]` log and the rotation trigger, and not the live setup detection.
FR-33: The system shall add one row for `src/lib/signal-rotation.ts` to the "Confirm with Amaury before touching" table in `CLAUDE.md`, after the `execution-gates.ts` row, with the reason "Rotation trigger and rotation candidate choice — can close a live position".
FR-34: The system shall record the CR count and line count of `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` before and after.
FR-35: The system shall keep the line ending of each of those files (LF, LF, CRLF).
FR-36: The system shall not change any other line of those three files.
FR-37: The system shall confirm that `pr-review.yml` still parses as YAML after the edit.

### E. Safety net

FR-38: The system shall record a baseline before any edit: `git status`, `tsc --noEmit`, the characterization file three times, the full Vitest suite (expected 1114), ESLint on `claude-agent.ts` (three known warnings) and the SHA-256 of `specs/docs-5-selector-criteria/tasks.md`.
FR-39: The system shall not change any golden under `src/lib/__tests__/__golden__/`.
FR-40: The system shall stop the work and report the diff if any golden changes, including `h-rotation-close.json`.
FR-41: The system shall not regenerate, edit or delete any golden.
FR-42: The system shall not touch `specs/docs-5-selector-criteria/tasks.md` and shall show its SHA-256 unchanged.

### F. New unit tests (`src/lib/__tests__/signal-rotation.test.ts`)

FR-43: The system shall observe the current behaviour of the moved functions before writing any expected value.
FR-44: The system shall use the observed values as the expected values.
FR-45: The system shall delete any throwaway script used for the observation.
FR-46: The system shall confirm that the new test fails before the module exists, and that the failure is the missing `../signal-rotation` module.
FR-47: The test shall cover the `generateSignalType` MEAN_REVERSION branch with z just below and exactly at `ZSCORE_ENTRY_THRESHOLD`.
FR-48: The test shall cover that branch with RSI 44, 45 and null, and with %B 0.19 and 0.2.
FR-49: The test shall cover the MEAN_REVERSION confidence `min(|z|/3, 1)`, including the cap.
FR-50: The test shall cover the TREND_FOLLOWING branch with ADX 25 and 25.01.
FR-51: The test shall cover that branch with MACD histogram 0 and positive, and with `macdLine` above and not above `signalLine`.
FR-52: The test shall cover that branch with price against `sma50` null, below and above.
FR-53: The test shall cover that branch with RSI 50, 50.01, 74.99 and 75.
FR-54: The test shall cover the TREND_FOLLOWING confidence `min(adx/50, 1)`, including the cap.
FR-55: The test shall cover NO_SIGNAL, a null `kalman` and a null `macd`.
FR-56: The test shall cover `evaluateRotation` with confidence 0.69 and 0.70 (the "Signal too weak" path).
FR-57: The test shall cover priority 1 at z = -0.8 and -0.81, asserting the exact reason text.
FR-58: The test shall cover priority 2 at P&L 0.05 and 0.0501 with confidence 0.80 and 0.81.
FR-59: The test shall cover the "No rotation candidates" path.
FR-60: The test shall cover a position without `kalman`, which is skipped.
FR-61: The test shall cover a tie of two priority-1 candidates, where the first in the array wins.
FR-62: The test shall cover priority 1 beating priority 2.
FR-63: The test shall cover an empty `openPositions` array.
FR-64: The test shall not use the network, any key or fake timers.

### G. Verification and report

FR-65: The system shall pass `tsc --noEmit` after the move.
FR-66: The system shall pass the characterization file three times with identical results.
FR-67: The system shall pass the full Vitest suite and report the count against 1114 plus the new tests.
FR-68: The system shall run ESLint on `signal-rotation.ts`, `claude-agent.ts` and the new test and report any warning that is not in the baseline.
FR-69: The system shall show `git status --short -- src/lib/__tests__/__golden__` empty.
FR-70: The system shall show in `git diff --name-only` only the allowed files.
FR-71: The system shall show that the `claude-agent.ts` diff contains only the block deletion and the import changes.
FR-72: The system shall compare the moved text with the deleted text and show that they differ only by `export`.
FR-73: The system shall report the CR count per touched file.
FR-74: The system shall write `specs/extract-signal-rotation/review.md` in the format of the previous reviews.
FR-75: The system shall report the old and new `file:line` of each moved symbol.
FR-76: The system shall list, without fixing them, any document that cites the moved lines.
FR-77: The system shall list its observations about the moved code in the report, without fixing them.
FR-78: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, threshold, flag, log text, gate or model parameter.
NFR-02: The new module shall have no import from `claude-agent.ts`.
NFR-03: The new module shall not change `ZSCORE_ENTRY_THRESHOLD`; it only reads the binding.
NFR-04: Verification shall make no live trading call and no network call.
NFR-05: The change shall print no secret value.
NFR-06: Coverage of the moved functions by their own unit tests shall be at least 80%.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-20 to FR-24; the owner authorization covers this change only.
C-02: The system shall edit `.github/workflows/pr-review.yml` only as stated in FR-27 and FR-28, `vitest.config.ts` only as stated in FR-29 and FR-30, and `CLAUDE.md` only as stated in FR-31 and FR-33.
C-03: The system shall not modify `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `prompt-builder.ts`, `exit-cooldown.ts`, `execution-gates.ts` or `macro-bars-staleness.ts`.
C-04: The system shall not touch any golden, settings or hook file.
C-05: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-06: The system shall not fix any quirk it finds (see "Out of Scope").
C-07: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Any change to the rotation trigger, the literal `5`, the thresholds 0.70, 0.80, 0.05 and -0.8, the sort, or the criteria of `generateSignalType`.
- Any change to what happens after a rotation (the `splice`, `openPositionsCount`, the context row, the cooldown).
- Closing `specs/docs-5-selector-criteria/tasks.md` (a separate decision).
- Adding a row for `macro-bars-staleness.ts` to `CLAUDE.md` (not authorized).
- Documents that cite moved line numbers: listed only.
