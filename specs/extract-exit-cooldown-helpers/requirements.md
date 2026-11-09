# Requirements — CHANGE split-2: extract the exit/cooldown helpers from claude-agent.ts (pure move, no behaviour change)

## Functional Requirements

### A. What moves (STEP 0 boundary; line numbers at HEAD e0fe38d)

FR-01: The system shall create the module `src/lib/exit-cooldown.ts`.
FR-02: The system shall move `getTradingDaysOpen` (`claude-agent.ts:91-97`) to the new module.
FR-03: The system shall move `computeCooldownUntil` (`claude-agent.ts:103-125`) to the new module.
FR-04: The system shall move the comment block above `computeCooldownUntil` (`claude-agent.ts:99-102`, the EDT/EST note) to the new module, directly above `computeCooldownUntil`.
FR-05: The system shall move `toExitReason` (`claude-agent.ts:137-153`, nested in `enforceExitRules`) to the new module as a top-level function.
FR-06: The system shall export `getTradingDaysOpen`, `computeCooldownUntil` and `toExitReason` from the new module.
FR-07: The system shall keep `COOLDOWN_UNKNOWN_EXIT_REASON` (`claude-agent.ts:859-861`) in `claude-agent.ts`.

### B. Pure move

FR-08: The system shall copy the body, the comments and the log strings of the three functions without any textual change, apart from the two mechanical differences listed in FR-09.
FR-09: The system shall allow only two mechanical differences between the old and the new text of the three functions: the `export` keyword before `function`, and the removal of the two-space indent of `toExitReason` that comes from its nesting.
FR-10: The system shall keep the signature `toExitReason(reason?: string | null): ExitReason`.
FR-11: The system shall keep the signatures of `getTradingDaysOpen` and `computeCooldownUntil` unchanged.
FR-12: The system shall not add any parameter, clock injection or logger injection to the three functions.
FR-13: The system shall not rename any of the three functions.
FR-14: The new module shall import only `import type { ExitReason } from './types'`.
FR-15: The new module shall not import from `claude-agent.ts`.
FR-16: The new module shall be written with LF line endings.

### C. Edits to claude-agent.ts (and only these)

FR-17: The system shall delete from `claude-agent.ts` the definition of `getTradingDaysOpen`.
FR-18: The system shall delete from `claude-agent.ts` the definition of `computeCooldownUntil` together with its comment block.
FR-19: The system shall delete from `claude-agent.ts` the nested definition of `toExitReason`.
FR-20: The system shall add exactly one import line to `claude-agent.ts` for `getTradingDaysOpen`, `computeCooldownUntil` and `toExitReason`.
FR-21: The system shall not change any call site (`claude-agent.ts:247`, `:455`, `:1318`, `:1387`, `:1509` before the move).
FR-22: The system shall not change any other line of `claude-agent.ts`.
FR-23: The system shall keep every touched line of `claude-agent.ts` in CRLF.
FR-24: The system shall keep the CR count of `claude-agent.ts` equal to its line count.

### D. Safety net

FR-25: The system shall record a baseline before any edit: `tsc --noEmit`, the characterization file three times and the five exit/cooldown test files.
FR-26: The system shall not change any golden under `src/lib/__tests__/__golden__/`.
FR-27: The system shall stop the work and report the diff if any golden changes.
FR-28: The system shall not regenerate, edit or delete any golden.

### E. New unit tests (`src/lib/__tests__/exit-cooldown.test.ts`)

FR-29: The system shall observe the current behaviour of the three functions before writing any expected value.
FR-30: The system shall use the observed values as the expected values, including the values the code returns for an invalid timestamp and at exactly 28 calendar days.
FR-31: The system shall delete any throwaway script used for the observation.
FR-32: The system shall confirm that the new test file fails before the module exists, and that the failure is the missing `../exit-cooldown` import.
FR-33: The test shall cover `getTradingDaysOpen` at 0 days, at about 1.4 days, at 28 calendar days and with an invalid timestamp, using fake timers.
FR-34: The test shall cover `computeCooldownUntil` for `Z_SCORE_EXIT`, `PROFIT_TARGET` and `SMA5_RECLAIM`, which return `endOfTradingDay`.
FR-35: The test shall cover `computeCooldownUntil` for `TRAILING_STOP` and `EMA_FAILURE`, which return `nextTradingDay1`.
FR-36: The test shall cover `computeCooldownUntil` for `STOP_LOSS`, which returns `nextTradingDay3`.
FR-37: The test shall cover `computeCooldownUntil` for `TIME_STOP` and `UNKNOWN`, which return `null`.
FR-38: The test shall cover the `default` branch of `computeCooldownUntil` with a value cast to `ExitReason`.
FR-39: The test shall use three distinct `Date` objects and assert identity with `toBe`.
FR-40: The test shall cover the eight mappings of `toExitReason` (PROFIT_FLOOR to TRAILING_STOP, PROFIT_TARGET, TIME_STOP, FAIR_VALUE to Z_SCORE_EXIT, MOVE_EXHAUSTED to Z_SCORE_EXIT, FELL_BELOW_EMA50 to EMA_FAILURE, TRAILING_STOP, CLOSED_ABOVE_SMA5 to SMA5_RECLAIM).
FR-41: The test shall cover the normalization of `toExitReason` for case, spaces and hyphens.
FR-42: The test shall cover the empty, null, undefined and whitespace-only inputs of `toExitReason` with a `console.warn` spy that asserts the exact `[EXIT_REASON_EMPTY]` text.
FR-43: The test shall cover an unmatched input of `toExitReason` with a `console.warn` spy that asserts the exact `[EXIT_REASON_UNMATCHED]` text.
FR-44: The test shall make no network call and use no key.

### F. Verification and review

FR-45: The system shall pass `tsc --noEmit` after the move.
FR-46: The system shall pass the characterization file three times with identical results.
FR-47: The system shall pass the full Vitest suite and report the count against the baseline plus the new tests.
FR-48: The system shall pass ESLint on `exit-cooldown.ts`, `claude-agent.ts` and `exit-cooldown.test.ts`.
FR-49: The system shall show `git status --short -- src/lib/__tests__/__golden__` empty.
FR-50: The system shall show in `git diff --name-only` only the allowed files.
FR-51: The system shall show that the `claude-agent.ts` diff contains only the deletions of FR-17 to FR-19 and the one import line of FR-20.
FR-52: The system shall compare the deleted text with the text now in `exit-cooldown.ts` and show that they are equal apart from the differences of FR-09 and the line ending.
FR-53: The system shall report the CR count per touched file.
FR-54: The system shall write `specs/extract-exit-cooldown-helpers/review.md` in the format of `specs/extract-prompt-builder/review.md`.
FR-55: The system shall list, without fixing them, the documents that cite `claude-agent.ts` line numbers that moved.
FR-56: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, threshold, flag, setup, gate, cooldown duration, log text or model parameter.
NFR-02: The new module shall have no import from `claude-agent.ts` and no import other than the `ExitReason` type (no circular import).
NFR-03: Verification shall make no live trading call and no network call.
NFR-04: The change shall print no secret value.
NFR-05: Coverage of the new module by its own unit tests shall be at least 80%.
NFR-06: The new test shall follow the repo patterns (AAA, `vi.hoisted` only if a mock is needed, no network, no keys).

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-17 to FR-22; the owner authorization for this edit is explicit and covers this change only.
C-02: The system shall not modify `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts` or `prompt-builder.ts`.
C-03: The system shall not modify `.github/workflows/*`, `vitest.config.ts`, `CLAUDE.md` or any golden.
C-04: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`; it shall stay exactly as it is now (modified, uncommitted).
C-05: The system shall not fix any quirk it finds (see "Out of Scope").
C-06: The system shall not commit, push, branch or open a PR.

## Out of Scope

- `COOLDOWN_UNKNOWN_EXIT_REASON` and the `cooldownSymbols` loop (`claude-agent.ts:1505-1517`): they stay.
- The ghost-close loop, `enforceStopLosses` and the cooldown persistence block: they stay.
- Adding `exit-cooldown.ts` to `coverage.include` (`vitest.config.ts`) or to the Protected Zone audit in `pr-review.yml`: not authorized in this change; listed in the report as a decision for the owner.
- Updating docs that cite moved line numbers (`gate-importance.ts`, `CLAUDE.md`, `.claude/agents/*`): listed only.
- Any bug found while observing behaviour (for example the NaN result for an invalid timestamp): pinned as observed, reported, not fixed.
