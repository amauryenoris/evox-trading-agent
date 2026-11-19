# Requirements — CHANGE split-8: extract enforceStopLosses (Capa B) from claude-agent.ts (pure move, no behaviour change)

Baseline (from the STEP 0 report, re-measured at implementation; any difference is reported and the work continues with the new values): the code of `claude-agent.ts` is the one of `f25c193`; HEAD is now `9bac6d1` (a docs-only commit on top of it), plus one uncommitted change, `specs/docs-5-selector-criteria/tasks.md` (not part of this change). Characterization 87/87; full suite 1252 tests in 81 files; 81 goldens under `src/lib/__tests__/__golden__/claude-agent/`. `claude-agent.ts` is CRLF, 1986 lines, 1986 CR (re-read at spec time: 1986 CRLF, 0 bare LF). New files are LF. Line numbers are those of `claude-agent.ts` at that HEAD and are re-read at implementation.

## Functional Requirements

### A. What moves

FR-01: The system shall create the module `src/lib/stop-loss-enforcement.ts`.
FR-02: The system shall move the block `claude-agent.ts:447-486` (banner "STOP LOSS ENFORCEMENT (Capa B — manual safety check each cycle)" at `:447-449`, blank line `:450`, and `enforceStopLosses` at `:451-486`) to the new module.
FR-03: The new module shall export `enforceStopLosses`.
FR-04: The new module shall export nothing else and shall contain no private helper.
FR-05: The system shall delete from `claude-agent.ts` lines `:447-487`, which includes the blank line after the function.
FR-06: The system shall leave `checkOvertradingLimit` (`:442-445`), its banner (`:438-440`) and `COOLDOWN_UNKNOWN_EXIT_REASON` (`:488-490`) in `claude-agent.ts` unchanged.
FR-07: The system shall leave the single call site in `runAgentCycle` (`:644`, `await enforceStopLosses(positions, cooldownDates?.nextTradingDay3 ?? null)`) unchanged.

### B. Pure move

FR-08: The system shall copy the moved block without any textual change, apart from the import block at the top of the module and the `export` keyword added to `enforceStopLosses`.
FR-09: The system shall convert only the line endings (CRLF to LF) when copying.
FR-10: The system shall keep the `STOP_LOSS_PCT` read and its fallback `'0.05'`, the `<=` comparison, every log text, the order of effects (context read, then per context: price check, warn, `closePosition`, then `upsertSymbolCooldown` and the `[COOLDOWN_PERSIST]` log only when the date is not null) and the single `catch` unchanged.
FR-11: The system shall keep the signature of `enforceStopLosses` unchanged and shall not rename any moved symbol.
FR-12: The new module shall contain exactly four imports: `closePosition` from `./alpaca`, `getAllOpenPositionContexts` from `./db`, `upsertSymbolCooldown` from `./db-cooldowns` and `import type { AlpacaPosition } from './types'`.
FR-13: The new module shall use the same module specifiers that `claude-agent.ts` uses for those names, so the harness mocks keep applying.
FR-14: The new module shall not import from `./claude-agent`.
FR-15: The system shall confirm that no local module imports `stop-loss-enforcement.ts` except `claude-agent.ts` (no import cycle).
FR-16: The new module shall be written with LF line endings and shall end with exactly one trailing newline.
FR-17: The system shall not fix or change anything it observes (see Out of Scope); observations are listed only.

### C. Edits to claude-agent.ts (and only these)

FR-18: The system shall add `import { enforceStopLosses } from './stop-loss-enforcement'` to `claude-agent.ts`, directly after the `./claude-call` import.
FR-19: The system shall keep the imports `closePosition`, `getAllOpenPositionContexts`, `upsertSymbolCooldown` and `AlpacaPosition` in `claude-agent.ts`, because it still uses them elsewhere.
FR-20: The system shall remove from the imports of `claude-agent.ts` only names that `tsc` or ESLint show as newly unused; none is expected.
FR-21: The system shall not add a re-export of `enforceStopLosses` to `claude-agent.ts`.
FR-22: The system shall not change any other line of `claude-agent.ts`.
FR-23: The system shall write every touched line of `claude-agent.ts` in CRLF and keep its CR count equal to its line count.

### D. Registration

FR-24: The system shall add `'src/lib/stop-loss-enforcement.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/claude-call.ts'`.
FR-25: The system shall add `"src/lib/stop-loss-enforcement.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, after `"src/lib/claude-call.ts"`, with the same indent.
FR-26: The system shall add one `stop-loss-enforcement.ts` row to the `src/lib/` File Structure table of `CLAUDE.md`, after the `claude-call.ts` row.
FR-27: The system shall add one `src/lib/stop-loss-enforcement.ts` row to the "Confirm with Amaury before touching" table of `CLAUDE.md`, after the `claude-call.ts` row.
FR-28: The reason text of both `CLAUDE.md` rows shall be "Closes positions and writes the stop-loss cooldown when price falls through the -5% stop — an error can leave a losing position open or re-enterable".
FR-29: The system shall record the CR count and line count of `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` before and after, and keep their line endings.
FR-30: The system shall not change any other line of those three files.
FR-31: The system shall confirm that `pr-review.yml` still parses as YAML.
FR-32: The system shall not edit any other document.

### E. Safety net

FR-33: The system shall record a baseline before any edit: `git status`, `git rev-parse HEAD`, `tsc --noEmit`, the characterization file three times (87/87), the full suite (1252 in 81 files), ESLint on `claude-agent.ts` (the same known warnings), CR and line count of every file to touch, the SHA-256 of all golden files, of `docs-5` `tasks.md` and of every `src/lib/*.ts`.
FR-34: The system shall stop and report if the re-measured baseline differs in a way that affects the move; other differences are reported and the work continues with the new values.
FR-35: The system shall save the exact text of `claude-agent.ts:447-487` from HEAD to a temporary file outside the repo.
FR-36: The system shall not change, regenerate, edit or delete any golden.
FR-37: The system shall stop and report if any golden changes or if any existing test changes result.
FR-38: The system shall not edit any existing test.
FR-39: The system shall not touch `specs/docs-5-selector-criteria/tasks.md` and shall show its SHA-256 unchanged.

### F. Observation before the tests

FR-40: The system shall run the current code before writing any expected value, through `runAgentCycle` with the harness where it can provoke the case, and through a disposable copy of the current function text where it cannot, and shall say in `design.md` which was used for each case.
FR-41: The observation shall cover the boundary: `current_price` equal to the stop price computed with the same expression the code uses (`buyPrice * (1 - STOP_LOSS_PCT)`, not a hardcoded number), and one cent above it.
FR-42: The observation shall cover `nextTradingDay3 === null` with a fired stop: whether the position is closed, whether `upsertSymbolCooldown` is called, and the exact console output.
FR-43: The observation shall cover `upsertSymbolCooldown` throwing after a successful `closePosition`: the exact `console.error` text and the number of `closePosition` calls.
FR-44: The observation shall cover `STOP_LOSS_PCT` undefined: whether the fallback 0.05 applies, with one price just under and one just over the 5% stop.
FR-45: The observation shall record the exact `[COOLDOWN_PERSIST] ... source=enforceStopLosses` text on a fired stop with a cooldown date.
FR-46: The system shall record every observed value in `design.md` and shall use it as the expected value of the new tests.
FR-47: The system shall delete the disposable test or copy afterwards.

### G. New unit tests (`src/lib/__tests__/stop-loss-enforcement.test.ts`)

FR-48: The system shall confirm that the new test fails before the module exists, that the failure is the missing `../stop-loss-enforcement` module, and shall show that output.
FR-49: The test shall import `enforceStopLosses` from `../stop-loss-enforcement` and mock `../alpaca`, `../db` and `../db-cooldowns` with `vi.hoisted` and `vi.mock`.
FR-50: The test shall set the `STOP_LOSS_PCT` cases with `vi.stubEnv` and restore them with `vi.unstubAllEnvs` in `afterEach`.
FR-51: The test shall spy on `console.warn`, `console.error` and `console.log`, assert the exact texts observed, and restore the spies in `afterEach`.
FR-52: The test shall cover cases FR-41 to FR-45.
FR-53: The test shall cover a fired stop with a cooldown date, asserting that `closePosition` is called before `upsertSymbolCooldown('STOP_LOSS', date)`.
FR-54: The test shall cover `closePosition` failing: no cooldown call and the exact `console.error` text.
FR-55: The test shall cover a context with no matching Alpaca position: skipped, no calls.
FR-56: The test shall cover a price above the stop: no calls and no log.
FR-57: The test shall cover the first context read failing: the `CRITICAL` log and no other call.
FR-58: The test shall cover that the `positions` array passed in is not mutated.
FR-59: The test shall use no network and no key.

### H. Verification and report

FR-60: The system shall pass `tsc --noEmit` after the move.
FR-61: The system shall pass the characterization file three times with identical results (87/87).
FR-62: The system shall pass the full suite and report the exact count against 1252 plus the new tests.
FR-63: The system shall run ESLint on every touched file and report any warning that is not in the baseline.
FR-64: The system shall show the SHA-256 of all goldens identical to the baseline.
FR-65: The system shall byte-compare `stop-loss-enforcement.ts`, minus the import block and the `export` keyword, with the saved HEAD `:447-486` after CRLF to LF.
FR-66: The system shall measure the coverage of `stop-loss-enforcement.ts` from its own test and report statements and branches (20/20 and 8/8 expected).
FR-67: The system shall show the CR count per touched file (equal to the line count for `claude-agent.ts`, zero for the new files).
FR-68: The system shall show in `git diff --name-only` and `git status` only the allowed files.
FR-69: The system shall show the SHA-256 of `docs-5` `tasks.md` and of every other `src/lib/*.ts` unchanged.
FR-70: The system shall write `specs/extract-stop-loss-enforcement/review.md` in the format of the previous reviews.
FR-71: The system shall report the old and new `file:line` of each moved symbol and the observed values.
FR-72: The system shall list, without fixing them, the documents that mention the symbol (`SDD.md:145` in prose and the specs found by the search).
FR-73: The system shall list the pending observations without fixing them.
FR-74: The system shall delete the disposable test or copy and any temporary or coverage output.
FR-75: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, threshold, fallback, log text or order of effects.
NFR-02: Verification shall make no network call and use no key.
NFR-03: The change shall print no secret value.
NFR-04: Coverage of the moved code by its own test shall be 100% of statements and branches.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-05 and FR-18 to FR-23; the Amaury/Jorge authorization covers this change only.
C-02: The system shall edit `pr-review.yml` only as stated in FR-25, `vitest.config.ts` only as stated in FR-24, and `CLAUDE.md` only as stated in FR-26 and FR-27.
C-03: The system shall not modify any other production file.
C-04: The system shall not touch any golden, settings or hook file.
C-05: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-06: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Exit-only mode (`run-cycle.ts`) not running Capa B.
- The single `catch` labelling a cooldown failure as "Failed to close".
- `nextTradingDay3 === null` closing the position with no cooldown and no log.
- The `'0.05'` literal duplicated in five `STOP_LOSS_PCT` reads.
- `positions` not being refreshed after Capa B (pinned by golden (z3)).
- Verifying that Alpaca cancels the GTC stop when `closePosition` uses `cancel_orders=true`.
- Documents that mention the symbol: listed only.
