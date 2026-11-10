# Requirements — CHANGE split-3: extract the execution-gate helpers (pure move, no behaviour change)

Baseline: HEAD `a453f8c` (tsc clean, characterization 23/23 x3, full suite 1083 tests in 75 files). Line numbers are at that HEAD and are re-read at implementation.

## Functional Requirements

### A. What moves

FR-01: The system shall create the module `src/lib/execution-gates.ts`.
FR-02: The system shall move `checkLiquidity` (`claude-agent.ts:743-745`) to the new module as an exported function.
FR-03: The system shall move `checkTradingHours` (`claude-agent.ts:747-761`) to the new module as an exported function.
FR-04: The system shall move `guardMacroBars` (`claude-agent.ts:1021-1029`) into the existing module `src/lib/macro-bars-staleness.ts` as an exported function.
FR-05: The system shall leave `checkOvertradingLimit` (`claude-agent.ts:763-766`) in `claude-agent.ts`, unchanged.
FR-06: The system shall leave the gate error strings, the order of the `else if` chain and every call site in `claude-agent.ts` unchanged (`:2110`, `:2127`, `:1066-1070`).

### B. Pure move

FR-07: The system shall copy the body and the comments of the three functions without any textual change, apart from the `export` keyword.
FR-08: The system shall keep the signatures of the three functions unchanged.
FR-09: The system shall not rename any of the three functions.
FR-10: The system shall not add any parameter, clock injection or logger injection to the three functions.
FR-11: The new module `execution-gates.ts` shall have no import.
FR-12: The new module `execution-gates.ts` shall be written with LF line endings.
FR-13: The system shall add to `macro-bars-staleness.ts` only `import type { AlpacaBar } from './types'`, the `guardMacroBars` function and its `export`.
FR-14: The system shall not change `isMacroBarsStale` or `STALE_MACRO_BARS_MAX_DAYS`.
FR-15: The system shall keep `macro-bars-staleness.ts` in LF.
FR-16: The system shall confirm that `types.ts` does not import `macro-bars-staleness.ts` or `execution-gates.ts` (no import cycle).

### C. Edits to claude-agent.ts (and only these)

FR-17: The system shall delete the definition of `checkLiquidity` from `claude-agent.ts`.
FR-18: The system shall delete the definition of `checkTradingHours` from `claude-agent.ts`.
FR-19: The system shall delete the definition of `guardMacroBars` from `claude-agent.ts`.
FR-20: The system shall add `import { checkLiquidity, checkTradingHours } from './execution-gates'` to `claude-agent.ts`.
FR-21: The system shall change the existing `./macro-bars-staleness` import in `claude-agent.ts` so that it imports `guardMacroBars`.
FR-22: The system shall remove from the imports of `claude-agent.ts` only the names that become unused because of the move (`isMacroBarsStale`, and the type `AlpacaBar`), and no other name.
FR-23: The system shall keep `getTodayBuyExecutions` imported in `claude-agent.ts`.
FR-24: The system shall not change any call site, any comment or the section banner of the gates in `claude-agent.ts`.
FR-25: The system shall write every touched line of `claude-agent.ts` in CRLF.
FR-26: The system shall keep the CR count of `claude-agent.ts` equal to its line count.

### D. Registration

FR-27: The system shall add `"src/lib/execution-gates.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, directly after `"src/lib/exit-cooldown.ts"`, in the form of commit `a453f8c`.
FR-28: The system shall add `'src/lib/execution-gates.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/exit-cooldown.ts'`.
FR-29: The system shall add one row for `execution-gates.ts` to the `src/lib/` File Structure table in `CLAUDE.md`, in the style of the `exit-cooldown.ts` row.
FR-30: The system shall add one row for `src/lib/execution-gates.ts` to the "Confirm with Amaury before touching" table in `CLAUDE.md`, in the style of the `exit-cooldown.ts` row.
FR-31: The system shall record the CR count and line count of `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` before and after.
FR-32: The system shall keep the line ending of each of those files (LF, LF, CRLF).
FR-33: The system shall not change any other line of those three files.

### E. Safety net

FR-34: The system shall record a baseline before any edit: `git status`, `tsc --noEmit`, the characterization file three times, the full Vitest suite (expected 1083), ESLint on `claude-agent.ts` (three known warnings) and the SHA-256 of `specs/docs-5-selector-criteria/tasks.md`.
FR-35: The system shall not change any golden under `src/lib/__tests__/__golden__/`.
FR-36: The system shall stop the work and report the diff if any golden changes.
FR-37: The system shall not regenerate, edit or delete any golden.

### F. New unit tests

FR-38: The system shall observe the current behaviour of the three functions before writing any expected value.
FR-39: The system shall use the observed values as the expected values.
FR-40: The system shall compute the UTC instants of the trading-hours cases from the `America/New_York` offset by program, not by hand.
FR-41: The system shall delete any throwaway script used for the observation.
FR-42: The system shall confirm that the new tests fail before the exports exist, and that the failure is the missing export or module.
FR-43: The test `execution-gates.test.ts` shall cover `checkLiquidity` at 999_999, at 1_000_000 and at 0.
FR-44: The test shall cover `checkTradingHours` at 9:44, 9:45, 15:30 and 15:31 ET in EST (after 2026-11-01).
FR-45: The test shall cover `checkTradingHours` at the same four times in EDT (before 2026-11-01).
FR-46: The test shall cover `checkTradingHours` at one instant around each DST change (2026-03-08 and 2026-11-01).
FR-47: The test shall cover `checkTradingHours` at midnight ET.
FR-48: The test `guard-macro-bars.test.ts` shall cover `guardMacroBars` with an empty bar array, asserting the exact `[STALE_MACRO_BARS] symbol=... lastBar=none ageDays=-1` warning.
FR-49: The test shall cover `guardMacroBars` with fresh bars, asserting that the same array reference is returned and that no warning is logged.
FR-50: The test shall cover `guardMacroBars` with stale bars that contain data, asserting that `[]` is returned and the exact warning text with the observed `lastBar` and `ageDays`.
FR-51: The tests shall use fake timers and restore them in `afterEach`.
FR-52: The tests shall make no network call and use no key.
FR-53: The system shall note in the report whether the tests depend on the host ICU and timezone data.

### G. Verification and report

FR-54: The system shall pass `tsc --noEmit` after the move.
FR-55: The system shall pass the characterization file three times with identical results.
FR-56: The system shall pass the full Vitest suite and report the count against 1083 plus the new tests.
FR-57: The system shall run ESLint on `execution-gates.ts`, `macro-bars-staleness.ts`, `claude-agent.ts` and the two new tests and report any warning that is not in the baseline.
FR-58: The system shall show `git status --short -- src/lib/__tests__/__golden__` empty.
FR-59: The system shall show in `git diff --name-only` only the allowed files.
FR-60: The system shall show the SHA-256 of `specs/docs-5-selector-criteria/tasks.md` unchanged.
FR-61: The system shall show that the `claude-agent.ts` diff contains only the deletions of FR-17 to FR-19 and the import changes of FR-20 to FR-22.
FR-62: The system shall compare the moved text with the deleted text and show that they differ only by `export`, indentation (if any) and line ending.
FR-63: The system shall report the CR count per touched file.
FR-64: The system shall write `specs/extract-execution-gates/review.md` in the format of the previous reviews.
FR-65: The system shall report the old and new `file:line` of each moved symbol.
FR-66: The system shall list, without fixing them, any document that cites the moved line numbers.
FR-67: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, threshold, flag, gate order, gate message, log text or model parameter.
NFR-02: The new module shall have no import and shall not import from `claude-agent.ts`.
NFR-03: `macro-bars-staleness.ts` shall import only a type from `./types`.
NFR-04: Verification shall make no live trading call and no network call.
NFR-05: The change shall print no secret value.
NFR-06: Coverage of the moved functions by their own unit tests shall be at least 80%.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-17 to FR-24; the owner authorization covers this change only.
C-02: The system shall edit `.github/workflows/pr-review.yml` only as stated in FR-27, `vitest.config.ts` only as stated in FR-28 and `CLAUDE.md` only as stated in FR-29 and FR-30.
C-03: The system shall not move, edit or delete `checkOvertradingLimit`.
C-04: The system shall not modify `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `prompt-builder.ts` or `exit-cooldown.ts`.
C-05: The system shall not touch any golden, settings or hook file.
C-06: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`; it stays modified and uncommitted.
C-07: The system shall not fix any quirk it finds (see "Out of Scope").
C-08: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Deleting `checkOvertradingLimit` (separate decision).
- Registering `macro-bars-staleness.ts` in `coverage.include` or in the Protected Zone audit.
- The existing `macro-bars-staleness.test.ts`, which replicates `isMacroBarsStale` inline and stays unchanged.
- Any change to the gate messages, the `else if` order, `maxBuysPerDay` or the harness.
- Quirks seen while observing behaviour (for example the two clock reads in `guardMacroBars`, or `hour12: false` returning hour 24 at midnight on some ICU versions): pinned as observed, reported, not fixed.
- Documents that cite moved line numbers: listed only.
