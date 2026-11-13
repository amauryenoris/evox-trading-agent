# Requirements — CHANGE split-7: extract callClaudeWithRetry from claude-agent.ts (pure move, no behaviour change)

Baseline (from the STEP 0 report, re-measured at implementation; any difference stops the work and is reported): HEAD `969be71` plus one uncommitted change, `specs/docs-5-selector-criteria/tasks.md` (not part of this change). Characterization 87/87; full suite 1240 tests in 80 files; 81 goldens under `src/lib/__tests__/__golden__/claude-agent/`. `claude-agent.ts` is CRLF, 2015 lines, 2015 CR. New files are LF. Line numbers are those of `claude-agent.ts` at that HEAD and are re-read at implementation.

## Functional Requirements

### A. What moves

FR-01: The system shall create the module `src/lib/claude-call.ts`.
FR-02: The system shall move the block `claude-agent.ts:437-465` (banner "CLAUDE API — RETRY WITH EXPONENTIAL BACKOFF", `RETRYABLE_STATUS_CODES` and `callClaudeWithRetry`) to the new module.
FR-03: The new module shall export `callClaudeWithRetry`.
FR-04: The new module shall keep `RETRYABLE_STATUS_CODES` private (not exported).
FR-05: The system shall delete from `claude-agent.ts` lines `:437-466`, which includes the blank line after the block.
FR-06: The system shall leave the call site in `runAgentCycle` (`:1525-1530`) unchanged, including the literals `model: 'claude-sonnet-4-6'` and `max_tokens: 1024` and the `system: SYSTEM_PROMPT` argument.

### B. Pure move

FR-07: The system shall copy the moved block without any textual change, apart from the type import at the top of the module and the `export` keyword added to `callClaudeWithRetry`.
FR-08: The system shall convert only the line endings (CRLF to LF) when copying.
FR-09: The system shall keep the retry count default (`maxRetries = 4`), the status set (429 and 529), the delay formula, the jitter, the `console.warn` text and the order of operations unchanged.
FR-10: The system shall keep the signature of `callClaudeWithRetry` unchanged.
FR-11: The system shall not rename any moved symbol.
FR-12: The new module shall contain exactly one import, `import type Anthropic from '@anthropic-ai/sdk'`.
FR-13: The new module shall have no runtime import.
FR-14: The new module shall not import from `./claude-agent`.
FR-15: The system shall confirm that no other local module imports `claude-call.ts` except `claude-agent.ts` (no import cycle).
FR-16: The new module shall be written with LF line endings.
FR-17: The new module shall end with exactly one trailing newline.
FR-18: The system shall not fix or change anything it observes (see Out of Scope); observations are listed only.

### C. Edits to claude-agent.ts (and only these)

FR-19: The system shall add `import { callClaudeWithRetry } from './claude-call'` to `claude-agent.ts`, directly after the `./order-execution` import.
FR-20: The system shall keep `import Anthropic from '@anthropic-ai/sdk'` in `claude-agent.ts`.
FR-21: The system shall not add a re-export of `callClaudeWithRetry` to `claude-agent.ts`.
FR-22: The system shall remove from the imports of `claude-agent.ts` only names that `tsc` or ESLint show as newly unused; none is expected.
FR-23: The system shall not change any call site, comment or other line of `claude-agent.ts`.
FR-24: The system shall write every touched line of `claude-agent.ts` in CRLF and keep its CR count equal to its line count.

### D. Registration

FR-25: The system shall add `'src/lib/claude-call.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/order-execution.ts'`.
FR-26: The system shall add `"src/lib/claude-call.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, after `"src/lib/order-execution.ts"`, with the same indent.
FR-27: The system shall add one `claude-call.ts` row to the `src/lib/` File Structure table of `CLAUDE.md`, after the `order-execution.ts` row.
FR-28: The system shall add one `src/lib/claude-call.ts` row to the "Confirm with Amaury before touching" table of `CLAUDE.md`, after the `order-execution.ts` row.
FR-29: The reason text of both `CLAUDE.md` rows shall be "Retries the per-symbol Claude analysis call on 429/529 — a change alters how long and how often a symbol analysis waits".
FR-30: The system shall record the CR count and line count of `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` before and after, and keep their line endings (LF, LF, CRLF).
FR-31: The system shall not change any other line of those three files.
FR-32: The system shall confirm that `pr-review.yml` still parses as YAML.
FR-33: The system shall not touch `market-daily-briefing.ts` or any other copy of the retry function.
FR-34: The system shall not edit any other document.

### E. Safety net

FR-35: The system shall record a baseline before any edit: `git status`, `git rev-parse HEAD`, `tsc --noEmit`, the characterization file three times (87/87), the full suite (1240 in 80 files), ESLint on `claude-agent.ts` (the same known warnings), CR and line count of every file to touch, the SHA-256 of all golden files, of `docs-5` `tasks.md` and of every `src/lib/*.ts`.
FR-36: The system shall stop and report if the re-measured baseline differs from the one above.
FR-37: The system shall save the exact text of `claude-agent.ts:437-466` from HEAD to a temporary file outside the repo.
FR-38: The system shall not change, regenerate, edit or delete any golden.
FR-39: The system shall stop and report if any golden changes or if any existing test changes result.
FR-40: The system shall not edit any existing test.
FR-41: The system shall not touch `specs/docs-5-selector-criteria/tasks.md` and shall show its SHA-256 unchanged.

### F. Observation before the tests

FR-42: The system shall run the current code through the harness before writing any expected value, with a disposable script or test whose `claude:` callback throws errors that carry a `status`, using `pump` and fake timers.
FR-43: The observation shall cover a 429 followed by a success: the number of calls, the exact `console.warn` text and the delay value, with `Math.random` fixed at 0, 0.5 and 1.
FR-44: The observation shall cover a 529 and confirm that it behaves like a 429.
FR-45: The observation shall cover a retryable status on every attempt with the default `maxRetries`: the total number of attempts, that the thrown error is the same last error object, and that the last attempt does not wait.
FR-46: The observation shall cover a non-retryable status (400): thrown immediately, one call, no `console.warn`.
FR-47: The observation shall cover an error without `status`: thrown immediately, one call, and shall confirm that golden (j) pins it.
FR-48: The observation shall cover a custom `maxRetries` of 1 and of 0: the number of attempts.
FR-49: The system shall record every observed value in `design.md`.
FR-50: The system shall use the observed values as the expected values of the new tests.
FR-51: The system shall delete the disposable script or test afterwards.

### G. New unit tests (`src/lib/__tests__/claude-call.test.ts`)

FR-52: The system shall confirm that the new test fails before the module exists, and that the failure is the missing `../claude-call` module, and shall show that output.
FR-53: The test shall import `callClaudeWithRetry` from `../claude-call` and pass a hand-made fake client object, without mocking the SDK.
FR-54: The test shall fix `Math.random` with `vi.spyOn`, use fake timers, and restore both in `afterEach`.
FR-55: The test shall spy on `console.warn` and assert the exact text observed.
FR-56: The test shall cover the cases of FR-43 to FR-48.
FR-57: The test shall use no network and no key.

### H. Verification and report

FR-58: The system shall pass `tsc --noEmit` after the move.
FR-59: The system shall pass the characterization file three times with identical results (87/87).
FR-60: The system shall pass the full suite and report the exact count against 1240 plus the new tests.
FR-61: The system shall run ESLint on every touched file and report any warning that is not in the baseline.
FR-62: The system shall show the SHA-256 of all goldens identical to the baseline.
FR-63: The system shall byte-compare `claude-call.ts`, minus the type import and the `export` keyword, with the saved HEAD `:437-465` after CRLF to LF.
FR-64: The system shall measure the coverage of `claude-call.ts` from its new test and report statements and branches (100% expected).
FR-65: The system shall show the CR count per touched file (equal to the line count for `claude-agent.ts`, zero for the new files).
FR-66: The system shall show in `git diff --name-only` and `git status` only the allowed files.
FR-67: The system shall show the SHA-256 of `docs-5` `tasks.md` and of every other `src/lib/*.ts` unchanged.
FR-68: The system shall write `specs/extract-claude-call/review.md` in the format of the previous reviews.
FR-69: The system shall report the old and new `file:line` of each moved symbol and the observed values.
FR-70: The system shall list, without fixing them, the documents that mention the symbol or cite old lines.
FR-71: The system shall list the pending observations without fixing them.
FR-72: The system shall delete the disposable script and any temporary or coverage output.
FR-73: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any behaviour, status set, retry count, delay formula, jitter or log text.
NFR-02: Verification shall make no network call and use no key.
NFR-03: The change shall print no secret value.
NFR-04: Coverage of the moved code by its new test shall be 100% of statements and branches.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-05 and FR-19 to FR-24; the owner authorization (Amaury/Jorge) covers this change only.
C-02: The system shall edit `pr-review.yml` only as stated in FR-26, `vitest.config.ts` only as stated in FR-25, and `CLAUDE.md` only as stated in FR-27 and FR-28.
C-03: The system shall not modify `market-daily-briefing.ts`, `learning.ts`, `news-intelligence.ts`, `stock-selector.ts` or any other production file.
C-04: The system shall not touch any golden, settings or hook file.
C-05: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-06: The system shall not commit, push, branch or open a PR.

## Out of Scope

- The log text "attempt N/4" while up to 5 attempts happen.
- The wrapper stacking on the SDK's own retries (SDK `maxRetries` is 2).
- The duplicated copy in `market-daily-briefing.ts:25-50` (its log prefix is `[BRIEFING]`, so unifying would change a text).
- The other LLM calls that have no retry (`learning.ts`, `news-intelligence.ts`, `stock-selector.ts`).
- Moving the model, `max_tokens` or system prompt literals out of the call site.
- Documents that mention the symbol or cite old line numbers: listed only (`.claude/skills/claude-api-patterns.md:47`, `.claude/commands/implement.md:80`, `specs/fix-ioc-fill-verification/requirements.md:13` and the other specs named in the STEP 0 report).
