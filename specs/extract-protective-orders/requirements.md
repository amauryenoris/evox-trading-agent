# Requirements — CHANGE split-5: extract the protective-order / profit-floor helpers and the two stop-retry helpers (pure move, no behaviour change)

Baseline: HEAD `dc3c544` (full suite 1207 tests in 78 files; characterization 63/63; 61 golden files; three known ESLint warnings in `claude-agent.ts`). Line numbers are at that HEAD and are re-read at implementation.

## Functional Requirements

### A. What moves

FR-01: The system shall create the module `src/lib/protective-orders.ts`.
FR-02: The system shall move the block under the "PROTECTIVE ORDER HELPERS" banner (`claude-agent.ts:441-618`, banner included) to the new module.
FR-03: The system shall move `submitStopWithRetry` and `submitStopLimitWithRetry` (`claude-agent.ts:729-782`, with their header comment) to the new module.
FR-04: The new module shall export `applyProfitFloor`, `replaceProtectiveOrder`, `resolveEntryPrice`, `submitStopWithRetry` and `submitStopLimitWithRetry`.
FR-05: The new module shall export the types `ProtectiveOrderParams`, `ReplaceOrderParams`, `ProfitFloorParams`, `ProfitFloorOutcome` and `ReplaceOutcome`.
FR-06: The new module shall keep `logNakedStopAlert`, `cancelRegisteredStop`, `logContextPersistError`, `persistProtectiveStopSnapshot` and `handleFloorSellNow` private (not exported).
FR-07: The system shall leave `STOP_SUBMIT_FAILED`, the `IOC_*` constants, `resolveIocFinalState` and `executeIocWithRemainderRetry` in `claude-agent.ts`.

### B. Pure move

FR-08: The system shall copy bodies, comments, log strings and call order of the moved code without any textual change, apart from the `export` keyword.
FR-09: The system shall keep the texts `CANCEL FAILED`, `SUBMIT FAILED`, `trailing_stop_naked`, `[STOP]`, `[TRAILING]` and `[EXIT-RULES]` byte-identical.
FR-10: The system shall keep every signature and default (`retryDelayMs = 3000`) unchanged.
FR-11: The system shall not rename any moved symbol.
FR-12: The new module shall import only: `randomUUID` from `crypto`; `cancelOrder`, `submitStopOrder`, `submitStopLimitOrder` from `./alpaca`; `updatePositionContext`, `updatePositionProtectiveStop`, `insertAgentLogEntry` from `./db`; `computeProtectiveStop`, `buildProtectiveStopSnapshot` from `./protective-stop`; and the types it uses from `./types`.
FR-13: The new module shall not import from `./claude-agent`.
FR-14: The system shall confirm that none of `alpaca.ts`, `db.ts`, `protective-stop.ts` and `types.ts` imports `protective-orders.ts` (no import cycle).
FR-15: The new module shall be written with LF line endings.
FR-16: The system shall not fix or change anything it observes (see Out of Scope); observations are listed only.

### C. Edits to claude-agent.ts (and only these)

FR-17: The system shall delete from `claude-agent.ts` the "PROTECTIVE ORDER HELPERS" block with its trailing blank line.
FR-18: The system shall delete from `claude-agent.ts` `submitStopWithRetry`, `submitStopLimitWithRetry` and their header comment with the trailing blank line.
FR-19: The system shall add to `claude-agent.ts` one import from `./protective-orders` of the names still used there: `applyProfitFloor`, `replaceProtectiveOrder`, `resolveEntryPrice`, `submitStopWithRetry`.
FR-20: The system shall add one re-export line `export { submitStopWithRetry }` to `claude-agent.ts`, so that `ioc-fill-verification.test.ts` keeps importing it from `../claude-agent`.
FR-21: The system shall not re-export `submitStopLimitWithRetry`.
FR-22: The system shall remove from the imports of `claude-agent.ts` only names that `tsc` or ESLint show as newly unused; expected: `submitStopOrder`, `submitStopLimitOrder`, `updatePositionProtectiveStop`, `computeProtectiveStop`, `buildProtectiveStopSnapshot`.
FR-23: The system shall keep the imports `cancelOrder` (used by `resolveIocFinalState`), `updatePositionContext`, `insertAgentLogEntry`, `randomUUID`, `getProfitFloorSettings`, `roundDownToTick`, `isHigherByTick` and every other name still used.
FR-24: The system shall not change any call site, comment or other line of `claude-agent.ts`.
FR-25: The system shall write every touched line of `claude-agent.ts` in CRLF and keep its CR count equal to its line count.

### D. Registration

FR-26: The system shall add `"src/lib/protective-orders.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, after `"src/lib/macro-bars-staleness.ts"`, with the same indent.
FR-27: The system shall add `'src/lib/protective-orders.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/macro-bars-staleness.ts'`.
FR-28: The system shall add one `protective-orders.ts` row to the `src/lib/` File Structure table of `CLAUDE.md`, after the `signal-rotation.ts` row, saying: protective stop replacement, profit-floor application and stop-submit retries used by `enforceExitRules`.
FR-29: The system shall add one `src/lib/protective-orders.ts` row to the "Confirm with Amaury before touching" table of `CLAUDE.md`, after the `signal-rotation.ts` row, with the reason "Places, replaces and cancels live stop orders — an error can leave a position unprotected".
FR-30: The system shall record the CR count and line count of `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` before and after, and keep their line endings (LF, LF, CRLF).
FR-31: The system shall not change any other line of those three files.
FR-32: The system shall confirm that `pr-review.yml` still parses as YAML.

### E. Safety net

FR-33: The system shall record a baseline before any edit: `git status`, `tsc --noEmit`, the characterization file three times (63/63), the full Vitest suite (1207 in 78 files), ESLint on `claude-agent.ts` (three known warnings), CR and line count of every file to touch, the SHA-256 of all 61 golden files and of `specs/docs-5-selector-criteria/tasks.md`.
FR-34: The system shall not change, regenerate, edit or delete any golden under `src/lib/__tests__/__golden__/`.
FR-35: The system shall stop and report the diff if any golden changes, in particular goldens (u), (v), (w1), (w2), (x1), (x2), (ai) and (ak).
FR-36: The system shall not touch `specs/docs-5-selector-criteria/tasks.md` and shall show its SHA-256 unchanged.
FR-37: The system shall not edit `ioc-fill-verification.test.ts`, `mr-profit-floor-exit-rules.test.ts` or `orphaned-position-reconciliation.test.ts`.

### F. New unit tests (`src/lib/__tests__/protective-orders.test.ts`)

FR-38: The system shall observe the current behaviour of the moved code before writing any expected value, with a throwaway script run on the current text.
FR-39: The system shall use the observed values as the expected values.
FR-40: The system shall delete the throwaway script afterwards.
FR-41: The system shall confirm that the new test fails before the module exists, and that the failure is the missing `../protective-orders` module.
FR-42: The test shall cover `submitStopLimitWithRetry` succeeding on the first attempt (one call, no delay, no `failureReason`).
FR-43: The test shall cover `submitStopLimitWithRetry` failing once and then succeeding, with the 3000 ms delay driven by fake timers.
FR-44: The test shall cover `submitStopLimitWithRetry` failing twice, asserting the returned `failureReason` and the `warn` and `error` texts.
FR-45: The test shall cover `replaceProtectiveOrder` with `ctx.quantity` 0 returning outcome `skipped` with no `cancelOrder` and no submit call.
FR-46: The test shall assert the `cancelOrder` then submit call order for `replaceProtectiveOrder`.
FR-47: The test shall use `vi.hoisted` mocks of `../alpaca` and `../db`, restore fake timers in `afterEach`, and use no network and no key.

### G. Verification and report

FR-48: The system shall pass `tsc --noEmit` after the move.
FR-49: The system shall pass the characterization file three times with identical results (63/63).
FR-50: The system shall pass the full Vitest suite and report the count against 1207 plus the new tests.
FR-51: The system shall show `ioc-fill-verification.test.ts` and `mr-profit-floor-exit-rules.test.ts` passing unchanged.
FR-52: The system shall run ESLint on `protective-orders.ts`, `claude-agent.ts` and the new test and report any warning not in the baseline.
FR-53: The system shall show the SHA-256 of the 61 goldens identical and `git status --short -- src/lib/__tests__/__golden__` empty.
FR-54: The system shall show in `git diff --name-only` only the allowed files.
FR-55: The system shall show that the `claude-agent.ts` diff contains only the two block deletions, the import changes and the re-export line.
FR-56: The system shall byte-compare the moved text with HEAD and show that they differ only by `export`.
FR-57: The system shall show the final import lines of `claude-agent.ts` and the CR count per touched file.
FR-58: The system shall write `specs/extract-protective-orders/review.md` in the format of the previous reviews.
FR-59: The system shall report the old and new `file:line` of each moved symbol.
FR-60: The system shall list, without fixing them, any document that cites the moved lines.
FR-61: The system shall list its observations about the moved code, without fixing them.
FR-62: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, threshold, flag, log text, order call or call order.
NFR-02: Verification shall make no live trading call and no network call.
NFR-03: The change shall print no secret value.
NFR-04: Coverage of the moved functions by their own unit tests plus the existing exit-rule tests shall be at least 80%.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-17 to FR-25; the owner authorization covers this change only.
C-02: The system shall edit `pr-review.yml` only as stated in FR-26, `vitest.config.ts` only as stated in FR-27, and `CLAUDE.md` only as stated in FR-28 and FR-29.
C-03: The system shall not modify `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `prompt-builder.ts`, `exit-cooldown.ts`, `execution-gates.ts`, `signal-rotation.ts` or `protective-stop.ts`.
C-04: The system shall not touch any golden, settings or hook file.
C-05: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-06: The system shall not commit, push, branch or open a PR.

## Out of Scope

- The (w2) naked-position state after a failed replacement.
- The literal `0.005` limit offset at the trailing call site (`claude-agent.ts:344`).
- The duplication between `submitStopWithRetry` and `submitStopLimitWithRetry`.
- The unreachable `!snapshot` guard in `persistProtectiveStopSnapshot`.
- Moving the IOC constants, `resolveIocFinalState` or `executeIocWithRemainderRetry`.
- Documents that cite moved line numbers: listed only.
