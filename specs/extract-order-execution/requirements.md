# Requirements — CHANGE split-6: extract the IOC order-execution helpers from claude-agent.ts (pure move, no behaviour change)

Baseline: HEAD `3ee8cfa` plus one uncommitted change, `specs/docs-5-selector-criteria/tasks.md` (not part of this change). Full suite 1212 tests in 79 files; characterization 63/63; 61 golden files; three known ESLint warnings in `claude-agent.ts`. `claude-agent.ts` is CRLF (2162 lines, 2162 CR). Line numbers are at that HEAD and are re-read at implementation.

## Functional Requirements

### A. What moves

FR-01: The system shall create the module `src/lib/order-execution.ts`.
FR-02: The system shall move the block `claude-agent.ts:535-677` (banner "IOC FILL — error label constants" through the end of `executeIocWithRemainderRetry`) to the new module.
FR-03: The system shall delete from `claude-agent.ts` lines `:535-678`, which includes the blank line after the block.
FR-04: The new module shall export `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED` and `IOC_LATE_FILL`.
FR-05: The new module shall export `IOC_REMAINDER_RETRY_MAX`, `IOC_RETRY_MAX_DRIFT_BPS` and `IOC_RETRY_MIN_REMAINDER_USD`.
FR-06: The new module shall export `resolveIocFinalState` and `executeIocWithRemainderRetry`.
FR-07: The new module shall keep `buildFillAttempt` and `weightedAvgFillPrice` private (not exported).
FR-08: The system shall leave every call site in `runAgentCycle` unchanged (`:1828-1853` normal mode, `:2020-2046` ranking mode).

### B. Pure move

FR-09: The system shall copy the moved block without any textual change, apart from the import block at the top of the module and the `export` keyword where it is needed.
FR-10: The system shall convert only the line endings (CRLF to LF) when copying.
FR-11: The system shall keep every constant value, log text, error text, default parameter (`delayMs = 1500`, `maxAttempts = 4`) and order of operations unchanged.
FR-12: The system shall not rename any moved symbol.
FR-13: The new module shall import only `submitLimitOrder`, `getOrder`, `cancelOrder` and `getQuote` from `./alpaca`.
FR-14: The new module shall import only `MAX_SPREAD_BPS` from `./config`.
FR-15: The new module shall import only the types `AlpacaOrder` and `FillAttempt` from `./types`, with `import type`.
FR-16: The new module shall not import from `./claude-agent`.
FR-17: The new module shall not import from `./protective-orders`.
FR-18: The system shall confirm that none of `alpaca.ts`, `config.ts` and `types.ts` imports `order-execution.ts` (no import cycle).
FR-19: The new module shall be written with LF line endings.
FR-20: The new module shall end with exactly one trailing newline.
FR-21: The system shall not fix or change anything it observes (see Out of Scope); observations are listed only.

### C. Edits to claude-agent.ts (and only these)

FR-22: The system shall add to `claude-agent.ts` one import from `./order-execution` of `executeIocWithRemainderRetry`, `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED`, `resolveIocFinalState` and `IOC_LATE_FILL` (the last two are imported only for the re-export).
FR-23: The system shall add `resolveIocFinalState`, `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED` and `IOC_LATE_FILL` to the existing `export { submitStopWithRetry }` statement near `:80`.
FR-24: The system shall not re-export `IOC_REMAINDER_RETRY_MAX`, `IOC_RETRY_MAX_DRIFT_BPS` or `IOC_RETRY_MIN_REMAINDER_USD`.
FR-25: The system shall remove from the imports of `claude-agent.ts` only names that `tsc` or ESLint show as newly unused; expected: `submitLimitOrder`, `getOrder`, `cancelOrder` and `AlpacaOrder`.
FR-26: The system shall keep the imports `getQuote`, `MAX_SPREAD_BPS` and `FillAttempt` in `claude-agent.ts`.
FR-27: The system shall not change any call site, comment or other line of `claude-agent.ts`.
FR-28: The system shall write every touched line of `claude-agent.ts` in CRLF and keep its CR count equal to its line count.
FR-29: The system shall keep `ioc-fill-verification.test.ts` importing `resolveIocFinalState`, `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED`, `IOC_LATE_FILL` and `submitStopWithRetry` from `../claude-agent` without any edit.

### D. Registration

FR-30: The system shall add `'src/lib/order-execution.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/protective-orders.ts'`.
FR-31: The system shall add `"src/lib/order-execution.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, after `"src/lib/protective-orders.ts"`, with the same indent.
FR-32: The system shall add one `order-execution.ts` row to the `src/lib/` File Structure table of `CLAUDE.md`, after the `protective-orders.ts` row.
FR-33: The system shall add one `src/lib/order-execution.ts` row to the "Confirm with Amaury before touching" table of `CLAUDE.md`, after the `protective-orders.ts` row.
FR-34: The reason text of both `CLAUDE.md` rows shall be "Places live BUY orders, polls and force-cancels them, and retries partial fills — an error can leave an unprotected or orphaned position".
FR-35: The system shall record the CR count and line count of `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` before and after, and keep their line endings (LF, LF, CRLF).
FR-36: The system shall not change any other line of those three files.
FR-37: The system shall confirm that `pr-review.yml` still parses as YAML.
FR-38: The system shall not edit any other document.

### E. Safety net

FR-39: The system shall record a baseline before any edit: `git status`, `git rev-parse HEAD`, `tsc --noEmit`, the characterization file three times (63/63), the full Vitest suite (1212 in 79 files), ESLint on `claude-agent.ts` (three known warnings), CR and line count of every file to touch, the SHA-256 of all 61 golden files and of `specs/docs-5-selector-criteria/tasks.md`.
FR-40: The system shall save the exact text of `claude-agent.ts:535-678` from HEAD to a temporary file outside the repo.
FR-41: The system shall not change, regenerate, edit or delete any golden under `src/lib/__tests__/__golden__/`.
FR-42: The system shall stop and report if any golden differs or if any existing test changes result.
FR-43: The system shall not touch `specs/docs-5-selector-criteria/tasks.md` and shall show its SHA-256 unchanged.
FR-44: The system shall not edit any existing test, including `ioc-remainder-retry.test.ts` and `ioc-fill-verification.test.ts`.

### F. Observation before the tests

FR-45: The system shall run a disposable script against the current code with a mocked `alpaca` before writing any expected value.
FR-46: The script shall observe a fill without `filled_avg_price`: the price used and the `console.warn` text (`:597-599`).
FR-47: The script shall observe whether `a.avgFillPrice ?? 0` is reachable (`:607`) and the value produced.
FR-48: The script shall observe a retry that fills 0 shares: the log text and that the loop stops (`:658-660`).
FR-49: The script shall observe a retry that throws: the `console.error` text and that the loop stops (`:663-664`).
FR-50: The script shall observe one normal path of `resolveIocFinalState` and compare it with what the existing tests expect.
FR-51: The system shall record the observed values in `design.md`.
FR-52: The system shall use the observed values as the expected values of the new tests.
FR-53: The system shall delete the disposable script and any temporary file afterwards.

### G. New unit tests (`src/lib/__tests__/order-execution.test.ts`)

FR-54: The system shall confirm that the new test fails before the module exists, and that the failure is the missing `../order-execution` module.
FR-55: The test shall cover the fill without `filled_avg_price` (FR-46).
FR-56: The test shall cover the weighted average with a 0-share attempt after a partial one (FR-47).
FR-57: The test shall cover the retry that fills 0 shares (FR-48).
FR-58: The test shall cover the retry that throws (FR-49).
FR-59: The test shall cover one happy path of `executeIocWithRemainderRetry`.
FR-60: The test shall use `vi.hoisted` mocks of `../alpaca` and `../config` (`MAX_SPREAD_BPS` = 100) and fake timers wherever `setTimeout` is involved, restored in `afterEach`.
FR-61: The test shall use no network and no key.

### H. Verification and report

FR-62: The system shall pass `tsc --noEmit` after the move.
FR-63: The system shall pass the characterization file three times with identical results (63/63).
FR-64: The system shall pass the full Vitest suite and report the exact count against 1212 plus the new tests.
FR-65: The system shall show `ioc-fill-verification.test.ts` and `ioc-remainder-retry.test.ts` passing unchanged.
FR-66: The system shall run ESLint on every touched file and report any warning that is not in the baseline.
FR-67: The system shall show the SHA-256 of the 61 goldens identical to the baseline.
FR-68: The system shall byte-compare the moved text (without the import block and the added `export` keywords) with the saved HEAD block after CRLF to LF.
FR-69: The system shall show the CR count per touched file (equal to the line count for `claude-agent.ts`, zero for the new files).
FR-70: The system shall show in `git diff --name-only` only the allowed files.
FR-71: The system shall write `specs/extract-order-execution/review.md` in the format of the previous reviews.
FR-72: The system shall report the old and new `file:line` of each moved symbol.
FR-73: The system shall list, without fixing them, the documents that cite old line numbers.
FR-74: The system shall list new observations as pending lines only.
FR-75: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, threshold, flag, log text, order call or call order.
NFR-02: Verification shall make no live trading call and no network call.
NFR-03: The change shall print no secret value.
NFR-04: Coverage of the moved code by the new tests plus the existing characterization and unit tests shall be at least 80%.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-03 and FR-22 to FR-28; the owner authorization (Amaury/Jorge) covers this change only.
C-02: The system shall edit `pr-review.yml` only as stated in FR-31, `vitest.config.ts` only as stated in FR-30, and `CLAUDE.md` only as stated in FR-32 and FR-33.
C-03: The system shall not modify `config.ts`, `alpaca.ts`, `types.ts`, `protective-orders.ts`, `protective-stop.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `prompt-builder.ts`, `exit-cooldown.ts`, `execution-gates.ts` or `signal-rotation.ts`.
C-04: The system shall not touch any golden, settings or hook file.
C-05: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-06: The system shall not commit, push, branch or open a PR.

## Out of Scope

- The ranking-mode execution path having no stale/spread/liquidity/hours gate (only a quote-exists check).
- The drift between normal-mode and ranking-mode execution code, and the duplicated stop submission (`:1848-1853`, `:2041-2046`).
- `ioc-remainder-retry.test.ts` replicating the logic instead of importing it.
- The uncovered ranking call-site branches (market closed, no quote, zero fill, partial-fill log, stop failure).
- Documents that cite old line numbers: `specs/fix-ioc-fill-verification/requirements.md:13`, `specs/prompt-threshold-language-gate/requirements.md:5`, `specs/sector-rotation-prompt-context/design.md:43`, `specs/self-flagged-disqualifying-risk/design.md:21` (listed only). `SDD.md:284` cites no line numbers.
