# Design — CHANGE split-7: extract callClaudeWithRetry from claude-agent.ts (pure move, no behaviour change)

## Architecture Decision

Move 7 of the `claude-agent.ts` split. `callClaudeWithRetry` is a self-contained wrapper: it takes the client and the request parameters as arguments, retries on HTTP 429 and 529 with exponential backoff and jitter, and rethrows anything else. It reads nothing from `process.env` or config, uses no module-level state other than the constant status set, and has a single call site in `runAgentCycle`. It moves to `src/lib/claude-call.ts` with no runtime import: the SDK appears only as a type, so the module never loads the SDK and the harness mock of `@anthropic-ai/sdk` is not involved. The client construction (`new Anthropic`, `claude-agent.ts:538`), the call site and the literals (`model`, `max_tokens`, `SYSTEM_PROMPT`) stay in `claude-agent.ts`. The name `claude-call.ts` was chosen over the earlier plan's `claude-client.ts`, which would suggest client construction that does not move.

## What moves (HEAD `969be71`)

| Item | Lines | Becomes |
|------|-------|---------|
| Banner "CLAUDE API — RETRY WITH EXPONENTIAL BACKOFF" | `:437-439` | moves with the code |
| `RETRYABLE_STATUS_CODES` | `:441` | private |
| `callClaudeWithRetry(client, params, maxRetries = 4)` | `:443-465` | `export` |
| Blank line before the "EXECUTION GATES" banner | `:466` | deleted, not copied |

Delete range in `claude-agent.ts`: `:437-466`. The next banner starts at `:467`. The call site is `:1525-1530` and stays.

## Dependency audit

| Name | Use in the moved code | Use left in `claude-agent.ts` | Result |
|------|----------------------|-------------------------------|--------|
| `Anthropic` (SDK default export) | type only (`Anthropic`, `Anthropic.Message`) | `new Anthropic` at `:538` | import stays; the new module gets `import type` |
| `console.warn`, `setTimeout`, `Math.random`, `Math.min`, `Math.round` | runtime globals | many | none to import |
| `./db`, `./agent-log`, `./prompt-builder`, `Date`, `process.env` | not used | — | not imported |
| `RETRYABLE_STATUS_CODES` | `:455` only | none | private in the new module |

No import becomes unused in `claude-agent.ts`. No importer outside `claude-agent.ts` exists for any symbol of the block (checked in the STEP 0 report), so no re-export is added.

## Edits to claude-agent.ts (and only these)

1. Delete `:437-466`.
2. Add `import { callClaudeWithRetry } from './claude-call'` after the `./order-execution` import (`:27`), so it lands at `:28`, before `./agent-log`.

An EOL-aware script writes CRLF.

## Observation (to be filled at implementation, before any expected value)

A disposable test runs `runAgentCycle` through the harness with a `claude:` callback that throws `Object.assign(new Error(...), { status })`, using `pump` (2 s steps, up to 100 rounds, enough for the roughly 15 s of backoff) and `Math.random` fixed with a spy. Reading the code gives the expected shape; the values below are recorded from the run, not from the reading.

| Case | Code reference | To record |
|------|----------------|-----------|
| a. 429 then success | `:449-461` | calls (read: 2), the exact `console.warn` text, the delay with `Math.random` at 0, 0.5 and 1 (read: 1000 + 500·random) |
| b. 529 then success | `:455` | same as (a) |
| c. Retryable status on every attempt | `:457`, `:464` | total attempts with `maxRetries` 4 (read: 5), the thrown object is the last error, the last attempt does not wait; how the cycle records it (read: the `Analysis failed` HOLD) |
| d. Status 400 | `:455` | one call, no warn, thrown immediately |
| e. Error without status | `:454-455` | one call, thrown immediately; compare with golden (j) |
| f. `maxRetries` 1 and 0 | `:446`, `:457` | attempts (read: 2 and 1); the direct function is exercised through the RED test, since the call site always uses the default |

Observed values (2026-11-13, HEAD `969be71`; cases a to e through `runAgentCycle` with `pump`, the others through a disposable copy of the current text of the function; `Math.random` fixed with a spy; client calls counted by `claude.create`):

| Case | Observed |
|------|----------|
| a. 429 then success | 2 calls. One `console.warn`: `Claude API 429 (attempt 1/4) — retrying in 1000ms` with `Math.random` 0, `... 1250ms` with 0.5 and `... 1500ms` with 1 (delay = 1000 + 500·random). The cycle ends in a BUY of 100 shares, so the retry result is used |
| b. 529 then success | Same as (a): 2 calls, `Claude API 529 (attempt 1/4) — retrying in 1000ms` with random 0 |
| c. Retryable status on every attempt, default `maxRetries` | 5 calls. 4 warns, with random 0: `attempt 1/4 ... 1000ms`, `attempt 2/4 ... 2000ms`, `attempt 3/4 ... 4000ms`, `attempt 4/4 ... 8000ms`. The fifth call is followed by no warn and no wait. Direct run: calls at 0, 1000, 3000, 7000 and 15000 ms; the rejection happens at 15000 ms, with the same error object that the client threw. Through the harness the cycle records one HOLD, reasoning `Analysis failed`, error `Error: rate limited` |
| d. Status 400 | 1 call, no warn; the cycle records a HOLD `Analysis failed` with error `Error: bad request` |
| e. Error without `status` | 1 call, no warn; HOLD `Analysis failed` with error `Error: claude boom`. Same path as golden (j) |
| f. `maxRetries` 1 | 2 calls; warn `Claude API 429 (attempt 1/1) — retrying in 1000ms`; same error object thrown |
| f. `maxRetries` 0 | 1 call; no warn; same error object thrown |
| g. Success on the first call | 1 call; the returned value is the client's object itself; the client receives the parameters unchanged |
| h. Delay cap, `maxRetries` 8 | With random 0: 1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000 ms; with 0.5 each is 250 ms higher; with 1 each is 500 ms higher; 9 calls in total |

Case (f) was observed through a disposable copy of the function text (Q-2), since the call site never passes `maxRetries`. The copy was deleted.

## Tests (new)

`src/lib/__tests__/claude-call.test.ts` (LF), written before the module (RED). A hand-made fake client (`{ messages: { create: vi.fn() } }` cast to the SDK type), `Math.random` fixed with `vi.spyOn`, fake timers, `console.warn` spied; spies and timers restored in `afterEach`. Cases a to f. Existing coverage stays untouched: golden (j) pins the error without status through `runAgentCycle`; no test pins the retry path today (STEP 0: 9/15 statements and 3/7 branches of the block are covered by any test).

## Registration (authorized)

| File | EOL | Edit |
|------|-----|------|
| `.github/workflows/pr-review.yml` | LF | `"src/lib/claude-call.ts"` after `"src/lib/order-execution.ts"`, same indent |
| `vitest.config.ts` | LF | `'src/lib/claude-call.ts'` appended to `coverage.include` |
| `CLAUDE.md` | CRLF | File Structure row and "Confirm with Amaury" row after the `order-execution.ts` rows; reason "Retries the per-symbol Claude analysis call on 429/529 — a change alters how long and how often a symbol analysis waits" |

## Order of calls

The moved function is reached only from the per-symbol loop (`:1525`), after the market-closed early return (`:640-646`). The daily briefing (`:585`) and the dynamic selection (`:611`) run before that check but do not use this function (the briefing has its own copy; the selector calls the client directly). The move changes none of that order.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `claude-call.ts` with only the retry wrapper | Matches the content; no runtime import | One small module | Chosen |
| `claude-client.ts` (earlier plan) | Room for client construction and parsing | `new Anthropic` does not move; name overpromises | Rejected |
| Unify with the copy in `market-daily-briefing.ts` | Removes duplication | Its log prefix differs; changes a text and touches another file | Rejected |
| Re-export from `claude-agent.ts` | Safety for importers | There are none | Rejected |
| Move the model, `max_tokens` and prompt into the module | Fewer literals at the call site | Not a pure move | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-call.ts` | CREATE | Moved code; LF |
| `src/lib/claude-agent.ts` | MODIFY | One block deletion and one import line; CRLF; Protected Zone, authorized |
| `src/lib/__tests__/claude-call.test.ts` | CREATE | Direct tests (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | One line |
| `vitest.config.ts` | MODIFY | One entry |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `specs/extract-claude-call/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `market-daily-briefing.ts`, every other production file, existing tests, `specs/docs-5-selector-criteria/tasks.md`.

## Risks

- Delay uses `Math.random`; the observation and the test must fix it, or the expected values would vary.
- Backoff relies on `setTimeout`; the harness `pump` and the new test use fake timers, and the move does not change that.
- `import type Anthropic from '@anthropic-ai/sdk'` must still allow `Anthropic.Message` as a type; `tsc` decides. If it does not, the work stops and is reported instead of changing the import.
- `claude-agent.ts` is CRLF (2015 lines). Mitigation: EOL-aware script and CR-count check.
- The retry path is not pinned by any golden or real test today; the byte comparison and the new tests are the only guard.
- Documents citing the symbol or old lines: listed at the end, not fixed.

## Pending observations (to be listed in `review.md`, not fixed)

- The log says "attempt N/4" while up to 5 attempts happen (the last one never waits).
- The wrapper stacks on the SDK's own retries (SDK `maxRetries` is 2, SDK version 0.80.0), so one analysis can make up to 15 HTTP requests.
- `market-daily-briefing.ts:25-50` has a duplicated copy with the `[BRIEFING]` log prefix.
- `learning.ts`, `news-intelligence.ts` and `stock-selector.ts` call the client without retry.
- An error without `status` (for example a network error) is never retried.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-05, FR-19 to FR-24). The request states the Amaury/Jorge authorization for this change only; it also authorizes the `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` edits. No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (trailing blank line):** the request says to copy `:437-465` and to delete `:437-466`. Default: copy `:437-465` and delete `:437-466`, the same as in split-6; the module ends with one newline. Confirm.
- **Q-2 (case f through the harness):** the call site never passes `maxRetries`, so cases with `maxRetries` 1 and 0 cannot be observed through `runAgentCycle`. Default: observe them through a disposable copy of the current text of the function (as in split-5), delete it afterwards, and record that in `review.md`. Confirm.
- **Q-3 (import position):** place the new import right after `./order-execution` (`:27`). Confirm.
- **Q-4 (YAML check):** if no YAML parser is available locally, use `js-yaml` (a transitive dependency, used in the previous splits) or report as not verified.
