# Requirements — CHANGE 1: extract the prompt-builder from claude-agent.ts (pure move, no behaviour change)

## Functional Requirements

### A. What moves (STEP 0 boundary, section 6 step 1: lines 91-132, 810-857, 863-981)
FR-01: The system shall create the module `src/lib/prompt-builder.ts`.
FR-02: The system shall move the `SYSTEM_PROMPT` constant from `claude-agent.ts` to the new module.
FR-03: The system shall move the functions `rsiLabel`, `macdLabel`, `bbLabel`, `smaLabel` and `kalmanLabel` to the new module.
FR-04: The system shall move the function `buildEnrichedPrompt`, including the ACTIVE SETUP TYPE text it builds, to the new module.
FR-05: The system shall move each of those items with identical code: same text, same order, same template strings, same rounding, same conditions.
FR-06: The system shall not rename any identifier that affects behaviour.
FR-07: The system shall not move anything that is not named in FR-02 to FR-04.
FR-08: The system shall keep `callClaudeWithRetry`, the Claude call and its parameters, the parsing of Claude's reply and every trading decision in `claude-agent.ts`.

### B. Purity of the new module
FR-09: The new module shall not perform network calls.
FR-10: The new module shall not access the database.
FR-11: The new module shall not call `Date.now` or `Math.random`.
FR-12: The new module shall not read `process.env`.
FR-13: The system shall supply the values `MAX_POSITION_SIZE`, `MAX_POSITIONS` and `STOP_LOSS_PCT` to `buildEnrichedPrompt` as an argument.
FR-14: The system shall keep the expressions that use those values (parse, default, rounding) unchanged apart from where the value comes from.
FR-15: If a moved function needs another impure input that cannot be passed as an argument without a logic change, the system shall stop and report.

### C. Call site in claude-agent.ts
FR-16: The system shall import `SYSTEM_PROMPT` and `buildEnrichedPrompt` from the new module in `claude-agent.ts`.
FR-17: The system shall pass `process.env` as the new last argument of the `buildEnrichedPrompt` call.
FR-18: The system shall keep every other argument of that call, and the Claude call parameters, unchanged.
FR-19: The system shall remove from the existing import lines of `claude-agent.ts` only the names that become unused after the move.
FR-20: The system shall not change any export of `claude-agent.ts`.
FR-21: The system shall not add a re-export to `claude-agent.ts` unless a file outside the moved code imports a moved name.
FR-22: If a re-export is added, the system shall list it in the report.

### D. Safety net
FR-23: The characterization suite shall pass with no change to any golden file.
FR-24: The system shall not regenerate, edit or delete any golden file.
FR-25: If a golden differs, the system shall stop and report the diff without changing code or goldens.
FR-26: The characterization suite shall give identical results in three consecutive runs.

### E. New unit tests
FR-27: The system shall add unit tests for the new module that do not use the characterization harness.
FR-28: The tests shall assert the exact output string of each of the five label functions at every branch boundary.
FR-29: The tests shall assert the exact `buildEnrichedPrompt` output for a no-setup case and for each of the five setup types.
FR-30: The tests shall assert the optional sections: watchlist context, news-adjusted threshold, learn-mode flags, sector rotation, symbol news, current position.
FR-31: The tests shall assert that `buildEnrichedPrompt` reads the three env values only from its argument.
FR-32: The tests shall assert that `SYSTEM_PROMPT` equals its exact original text.
FR-33: The system shall add a differential test that compares the new module with a frozen verbatim copy of the original code over a grid of inputs (see design O-2).
FR-34: The tests shall not depend on the host time zone or locale beyond what the code itself uses.

### F. Process, CI and verification
FR-35: The system shall add `src/lib/prompt-builder.ts` to the protected-path list of the "Protected Zone audit" step in `.github/workflows/pr-review.yml`.
FR-36: The system shall change nothing else in `.github/workflows/pr-review.yml`.
FR-37: The system shall add `src/lib/prompt-builder.ts` to `coverage.include` in `vitest.config.ts`.
FR-38: The system shall pass `npx tsc --noEmit`.
FR-39: The system shall pass the full `npx vitest run`.
FR-40: The system shall pass `npm run build`.
FR-41: The system shall pass ESLint on every touched file with no new warning.
FR-42: The system shall show with `git diff` that the changes to `claude-agent.ts` are removed blocks, one added import, the import-name removals of FR-19, and the one added call argument of FR-17.
FR-43: The system shall report the line count of `claude-agent.ts` before and after.
FR-44: The system shall write the report to `.tmp/prompt-builder-extraction-report.md`.
FR-45: The report shall list what moved with original line ranges and new location, the golden status, the new tests, the verification results, the `pr-review.yml` change, and every value that needed an argument instead of a closure.
FR-46: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall not alter any prompt text, threshold, flag, sizing rule, gate, setup, model name or `max_tokens` value.
NFR-02: The new module shall have no import from `claude-agent.ts` (no circular import).
NFR-03: The new module shall import only `./position-sizing` (`regimeMultiplier`), `./config` (`ZSCORE_ENTRY_THRESHOLD`) and types.
NFR-04: The change shall print no secret value.
NFR-05: Verification shall make no live trading call and no network call.
NFR-06: Coverage of the new module by its own unit tests shall be at least 80%.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-16 to FR-19 and the removals of FR-02 to FR-04; the owner authorization for this edit is explicit and covers this change only.
C-02: The system shall not modify `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts` or `learning.ts`.
C-03: The system shall not change any exported name or signature that another file uses.
C-04: The system shall not fix any known quirk (for example the host-locale `toLocaleString` for volume, or the ATR percentile display).
C-05: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Any other extraction step from the STEP 0 plan (cooldowns, order execution, exit rules, and so on).
- `callClaudeWithRetry` and `claude-client.ts` (STEP 0 puts them in a separate module).
- Changing, rewording or "cleaning" any prompt text.
- Updating the permission matrix in `CLAUDE.md` or the hook (see design O-8).
- Repointing the 17 tests that replicate logic inline.
- Deleting `gate-importance.ts` or `checkOvertradingLimit`.
