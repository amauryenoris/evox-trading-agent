# Requirements — CHANGE docs-6: close the three LOW findings of move 2 (docs + config + one warn log; no trading behaviour change)

Findings closed: L-1, L-2 and L-3 of `specs/extract-exit-cooldown-helpers/review.md`. Line numbers below are at HEAD `43c8e67` and are re-read at implementation.

## Functional Requirements

### A. L-1 — replace moved line-number citations by symbol names

FR-01: The system shall re-read each citation in the code before replacing it.
FR-02: The system shall replace the citation `claude-agent.ts:945-982` in `SDD.md` (line 284) by the symbol `resolveIocFinalState` in `claude-agent.ts`.
FR-03: The system shall replace the citation `claude-agent.ts:2227-2243` in `SDD.md` (line 284) by the name of the code it points to (the `IOC_NOT_FILLED` branch of the buy path in `runAgentCycle`).
FR-04: The system shall replace the citation `claude-agent.ts:1612-1624` in `SDD.md` (line 290) by the name of the code it points to (the `positions.splice(...)` call in the rotation block of `runAgentCycle`).
FR-05: The system shall replace the bare citations `:1468`, `:2100` and `:1483` in `SDD.md` (line 290) by the names `openPositionsCount`, the max-positions gate and `slotsAvailable`.
FR-06: The system shall replace the citation `claude-agent.ts:1711-1728` in the comment of `src/lib/gate-importance.ts` (line 10) by the names `trendPullback3DayUptrendOk` and `trendPullback3DayStreakOk` in `claude-agent.ts`.
FR-07: The system shall replace the citation `claude-agent.ts:1652` in the comment of `src/lib/__tests__/self-flagged-disqualifying-risk.test.ts` (line 72) by the name of the code it points to (the unconditional `decision.action = 'HOLD'` assignment in `runAgentCycle`).
FR-08: The system shall keep the meaning of every sentence it edits.
FR-09: The system shall leave a citation unchanged and list it if it cannot be tied to a symbol with confidence.
FR-10: The system shall change only comment text in `gate-importance.ts` and in `self-flagged-disqualifying-risk.test.ts`.
FR-11: The system shall search `SDD.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `.claude/**`, `src/**` and `scripts/**` once more for the pattern `claude-agent.ts:\d`.
FR-12: The system shall report every hit other than the four known ones instead of editing it.
FR-13: The system shall not edit any file under `specs/` other than `specs/docs-6-move2-followups/`.
FR-14: The system shall report each L-1 edit as old text to new text.

### B. L-2 — register `exit-cooldown.ts` in config and docs

FR-15: The system shall add `'src/lib/exit-cooldown.ts'` to `coverage.include` in `vitest.config.ts`, after `'src/lib/prompt-builder.ts'`.
FR-16: The system shall add `"src/lib/exit-cooldown.ts"` to the `PROTECTED_ZONE` array in `.github/workflows/pr-review.yml`, directly after `"src/lib/prompt-builder.ts"`.
FR-17: The system shall make the `vitest.config.ts` and `pr-review.yml` edits in the same form as commit `2d96902` (one entry each).
FR-18: The system shall add a row for `src/lib/exit-cooldown.ts` to the "Confirm with Amaury before touching" table in `CLAUDE.md`, with the reason "Exit reason mapping and cooldown rules — decides when a symbol can be re-entered".
FR-19: The system shall add a row for `exit-cooldown.ts` to the `src/lib/` File Structure table in `CLAUDE.md`.
FR-20: The system shall record the CR count and line count of `vitest.config.ts`, `pr-review.yml` and `CLAUDE.md` before and after.
FR-21: The system shall keep the line ending of each of those files (LF, LF and CRLF).
FR-22: The system shall not change any other line of those three files.

### C. L-3 — one warning log for an invalid timestamp

FR-23: The system shall add one guard in `enforceExitRules` (`claude-agent.ts`), immediately before the time-stop check `if (!exitReason && daysOpen >= 20)`.
FR-24: The guard shall run when `daysOpen` is not a finite number and no exit reason is set yet.
FR-25: The guard shall call `console.warn('[TIME_STOP_SKIPPED_INVALID_TIMESTAMP] symbol=' + position.symbol + ' buyTimestamp=' + ctx.buyTimestamp)`.
FR-26: The guard shall not sell, return, `continue`, set `exitReason` or change any variable.
FR-27: The system shall not change the time-stop comparison `daysOpen >= 20`.
FR-28: The system shall keep the exit decision for finite `daysOpen` values byte-identical to today.
FR-29: The system shall show the added lines as a diff of three lines.
FR-30: The system shall not change `getTradingDaysOpen` or `exit-cooldown.ts`.
FR-31: The system shall write every line it adds or deletes in `claude-agent.ts` in CRLF.
FR-32: The system shall keep the CR count of `claude-agent.ts` equal to its line count.
FR-33: The system shall add a unit test that runs the real `enforceExitRules` with a position whose context has an invalid `buyTimestamp` and asserts the exact warning text.
FR-34: The test shall assert that no `closePosition` call is made for that position by the time stop.
FR-35: The test shall assert that a finite `buyTimestamp` produces no `[TIME_STOP_SKIPPED_INVALID_TIMESTAMP]` warning.

### D. Safety net and report

FR-36: The system shall record a baseline before any edit: `tsc --noEmit`, the characterization file three times, the full Vitest suite (expected 1080 tests) and ESLint.
FR-37: The system shall not change any golden under `src/lib/__tests__/__golden__/`.
FR-38: The system shall stop the work and report the diff if any golden changes.
FR-39: The system shall not regenerate, edit or delete any golden.
FR-40: The system shall pass `tsc --noEmit` after the change.
FR-41: The system shall pass the characterization file three times with identical results.
FR-42: The system shall pass the full Vitest suite and report the count against the baseline plus the new tests.
FR-43: The system shall run ESLint on every touched `.ts` file and report any warning that is not in the baseline.
FR-44: The system shall show `git diff --name-only` with only the allowed files.
FR-45: The system shall write `specs/docs-6-move2-followups/review.md` at the end, in the format of `specs/extract-exit-cooldown-helpers/review.md`.
FR-46: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The change shall not alter any trading behaviour, threshold, flag, gate, cooldown duration, order or prompt text.
NFR-02: The only runtime effect shall be one extra `console.warn` line when a position's `buyTimestamp` is invalid.
NFR-03: The new test shall follow the repo patterns (AAA, no network, no keys, mocks as in `mr-profit-floor-exit-rules.test.ts`).
NFR-04: The change shall print no secret value.

## Constraints

C-01: The system shall edit `src/lib/claude-agent.ts` only as stated in FR-23 to FR-27 and FR-31; the owner authorization covers this change only.
C-02: The system shall edit `.github/workflows/pr-review.yml` only as stated in FR-16, and `vitest.config.ts` only as stated in FR-15.
C-03: The system shall not modify `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `prompt-builder.ts` or `exit-cooldown.ts`.
C-04: The system shall not touch any golden, settings or hook file.
C-05: The system shall not fix any other quirk it finds.
C-06: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Making the time stop fire for an invalid timestamp, or any other change of the exit decision (the warning is log only).
- Changing `getTradingDaysOpen` (its `NaN` result stays pinned by `exit-cooldown.test.ts`).
- Citations of `claude-agent.ts` line numbers inside `specs/` (historical records).
- Any change to the characterization harness.
- Other pre-existing ESLint warnings of `claude-agent.ts`.
