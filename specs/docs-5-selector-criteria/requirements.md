# Requirements — docs-5: Close the docs thread + align the selector's setup criteria with the code

## Functional Requirements

### Part A — documentation

FR-01: The system shall replace the "Universal exit conditions" block in `.claude/agents/test-agent.md` (currently lines 290-298) with a block of exit conditions per setup.
FR-02: The system shall state in that block that `MEAN_REVERSION` exits when the Kalman signal is `EXIT_LONG` (z-score >= -0.8).
FR-03: The system shall state in that block that `TREND_PULLBACK` and `EMA_RECLAIM` exit when price falls below EMA50.
FR-04: The system shall state in that block that `TREND_ZLE05` exits when z-score >= 1.25.
FR-05: The system shall state in that block that `TREND_PULLBACK_3DAY` exits when price closes above SMA5.
FR-06: The system shall state in that block that the profit target is 5% for `TREND_ZLE05` and 10% for every other setup.
FR-07: The system shall state in that block the `MEAN_REVERSION` profit floor with activation 5%, floor 3% and ratchet 3 pp.
FR-08: The system shall state in that block the time stop at 20 trading days using the comparison the code uses (`daysOpen >= 20`).
FR-09: The system shall state in that block the -5% stop loss as two layers (Alpaca GTC stop order and cycle check).
FR-10: The system shall change the ZLE05 fixture comment at `test-agent.md:267` so that it matches the code ceiling `zScore <= 1.25` (`claude-agent.ts:1797`).
FR-11: The system shall add `TREND_PULLBACK_3DAY` to the `SignalType` union example at `.claude/skills/typescript-patterns.md:102`.
FR-12: The system shall list all 8 workflows of `.github/workflows/` in the SDD.md section 15 table.
FR-13: The system shall take each workflow name, file name, trigger and cron expression in that table from the workflow file itself.
FR-14: The system shall give each cron expression in that table with its UTC time and its EDT and EST equivalents.
FR-15: The system shall describe the `pr-review.yml` row by its real trigger (pull request opened, synchronize or reopened on `main`) instead of a cron.

### Part B — selector setup criteria (`src/lib/setups.ts`)

FR-16: The system shall rewrite the `MEAN_REVERSION` criteria text so that it states the entry rule of `claude-agent.ts:1684-1703`: z-score at or below the effective threshold, blocked when the regime is RANGING and ADX is below 18.
FR-17: The system shall remove the conditions "Ranging market regime required", "RSI < 45" and "%B < 0.2" from the `MEAN_REVERSION` criteria text.
FR-18: The system shall rewrite the `TREND_PULLBACK` criteria text so that it states that ADX may be unavailable (`claude-agent.ts:1661`).
FR-19: The system shall rewrite the `TREND_PULLBACK` criteria text so that it states the MACD histogram floor of -2.0 (`claude-agent.ts:1744-1757`, `trendPullbackMacdFloor`).
FR-20: The system shall rewrite the `TREND_PULLBACK_3DAY` criteria text so that it states that the previous close, not the current price, is compared with SMA200 (`claude-agent.ts:1715-1718`).
FR-21: The system shall rewrite the `TREND_PULLBACK_3DAY` criteria text so that it states the SMA5 condition: price not above SMA5 (`claude-agent.ts:1733-1742`).
FR-22: The system shall rewrite the `TREND_PULLBACK_3DAY` criteria text so that it no longer says "exactly" 3 lower closes, because the code checks three falling closes and no fourth (`claude-agent.ts:1720-1727`).
FR-23: The system shall compare the `TREND_ZLE05` criteria text with `claude-agent.ts:1665-1670,1791-1801` and change it only if a difference is found.
FR-24: The system shall compare the `EMA_RECLAIM` criteria text with `claude-agent.ts:1822-1829` and change it only if a difference is found.
FR-25: The system shall keep each rewritten criteria text in the style and approximate length of the current text (one sentence, comma-separated conditions, no added instructions).
FR-26: The system shall not add thresholds, instructions or wording that changes how the selector should choose, beyond describing each setup accurately.
FR-27: The system shall change only the `criteria` string values in `src/lib/setups.ts` (no names, no `active` flags, no types, no comments).
FR-28: The system shall add a unit test that pins the exact criteria string of each of the 5 active setups.
FR-29: The system shall add a unit test that calls `selectStocksForAnalysis` with a mocked Anthropic client and checks that the `system` prompt sent contains every criteria line `* NAME: criteria`.
FR-30: The system shall add a unit test that checks that the `system` prompt sent does not contain "RSI < 45".
FR-31: The system shall add a unit test that checks that the `system` prompt sent does not contain "%B < 0.2".
FR-32: The system shall run the characterization suite three times and report whether any golden changes.
FR-33: The system shall stop the implementation and report the diff if any golden of the characterization harness changes.
FR-34: The system shall not regenerate, edit or delete any golden.

### Verification and report

FR-35: The system shall pass `tsc --noEmit`.
FR-36: The system shall pass the full Vitest suite.
FR-37: The system shall pass ESLint on every touched file.
FR-38: The system shall show in `git diff --name-only` only the allowed files (and `specs/docs-5-selector-criteria/`).
FR-39: The system shall preserve the line ending of every edited file (CRLF in `test-agent.md` and `SDD.md`; LF in `setups.ts`, `typescript-patterns.md` and `stock-selector.test.ts`).
FR-40: The system shall write `.tmp/docs-5-report.md` with each change as old -> new with source `file:line`.
FR-41: The system shall include in that report the exact old and new criteria text of every setup in `setups.ts`, including the setups whose text did not change.
FR-42: The system shall include in that report the results of every verification command.
FR-43: The system shall list in that report every statement that could not be verified from the code.
FR-44: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: Every number or rule written in the docs shall be read from its source file in the same session, with the `file:line` recorded in the report.
NFR-02: The new tests shall follow the existing Vitest patterns in `stock-selector.test.ts` (`vi.hoisted` mocks, AAA structure).
NFR-03: The new tests shall not depend on a network, a real Supabase client or a real Anthropic key.
NFR-04: Coverage of the touched code shall not decrease (the change adds no executable code in `src/`).

## Constraints

C-01: This feature must not modify the Protected Zone. `claude-agent.ts` and `config.ts` are read only.
C-02: `src/lib/stock-selector.ts` shall not be edited in any way.
C-03: No trading logic, threshold or flag shall change.
C-04: No golden, workflow, settings or hook file shall be touched.
C-05: Allowed files: `.claude/agents/test-agent.md`, `.claude/skills/typescript-patterns.md`, `SDD.md`, `src/lib/setups.ts` (criteria text only), `src/lib/__tests__/stock-selector.test.ts` and, if needed, a new `src/lib/__tests__/setups.test.ts`.
C-06: Wording changes outside the listed lines and outside the criteria text are not allowed.

## Out of Scope

- The stale workflow names in the SDD.md section 2 diagram (lines 14-16: `trading-cycle.yml`, `exit-only.yml`); listed in the report only (see Q-4 in design).
- Any change to `stock-selector.ts`, `SELECTION_SYSTEM_PROMPT` or how the selector chooses symbols.
- Other stale content in `test-agent.md` that is not in the two blocks above.
- The `types.ts` `SignalType` (`TREND` and `null` members).
- Committing or pushing.
