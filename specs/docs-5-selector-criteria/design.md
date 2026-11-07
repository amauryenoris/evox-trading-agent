# Design — docs-5: Close the docs thread + align the selector's setup criteria with the code

## Architecture Decision

Part A is documentation only: targeted line replacements in three files, with a script that detects and preserves each file's line ending. Part B changes only string values in `src/lib/setups.ts`. Those strings flow, unchanged in structure, into `SELECTION_SYSTEM_PROMPT` through `ACTIVE_SETUP_CRITERIA_TEXT` (`stock-selector.ts:47-50,66`), which `selectStocksForAnalysis` sends as `system:` to Claude when the screener returns at least 10 candidates (`claude-agent.ts:1159-1160`). The prompt frames the criteria as "one more factor ... not a requirement", so this change alters a soft preference input, not a trade gate. Tests are written first (RED against the old strings), then the strings are changed (GREEN).

## Data Flow

1. `setups.ts` `ACTIVE_SETUPS[*].criteria` -> `stock-selector.ts:47-50` builds one line `    * NAME: criteria` per active setup.
2. The lines are interpolated into `SELECTION_SYSTEM_PROMPT` (`:52-82`).
3. `selectStocksForAnalysis` passes it as `system` to `client.messages.create` (`:191-194`).
4. In the characterization harness `selectStocksForAnalysis` is replaced by a stub (`support/claude-agent/mocks.ts:48-50`), so no golden records this prompt (to be confirmed by running the suite, FR-32).

## Source facts (re-read at implementation)

| Fact | Source |
|------|--------|
| MR entry: `zScore <= effectiveThreshold`; blocked when `marketRegime === 'RANGING'`, valid ADX and `adx < 18` | `claude-agent.ts:1684-1703`; `mrRangingAdxFloor = 18` at `:83` |
| PULLBACK: price > EMA50 > EMA200, z <= 0, `momentumOk`, EMA50 slope up, `adxValue === null \|\| adx >= 20`, MACD histogram > `trendPullbackMacdFloor` (-2.0) | `:1661,1672,1744-1757`; `:84` |
| 3DAY: `prevClose > sma200`; `prevClose < close-2 < close-3 < close-4`; entry blocked when price is above SMA5 (fail-open if SMA5 unusable) | `:1715-1742` |
| ZLE05: price > EMA50 > EMA200, 0 < z <= 1.25, `momentumOk`, EMA50 slope up, ADX >= 18 (or >= 15 with histogram > `lowAdxMacdBoost` 0.25; ADX null fails), histogram > 0 | `:1665-1670,1791-1801`; `:85` |
| RECLAIM: price > EMA50, `prevClose <= ema50Prev`, z < 0, distance > 0.2%, `momentumOk`, prior-day data required | `:1817-1829` |
| `momentumOk`: `ema50 > ema50Prev`, or, without a previous EMA50, `price > prevClose * 0.999` | `:1646-1649` |
| Exits | `claude-agent.ts:255-297`; profit target `protective-stop.ts:27-30`; MR profit floor `:12-14` |
| Workflows | `.github/workflows/*.yml` (names and crons read 2026-11-07, see table below) |

## Proposed criteria text (to be re-verified line by line before editing)

| Setup | Old | Proposed new |
|-------|-----|--------------|
| `TREND_PULLBACK_3DAY` | `Price above SMA200 (uptrend) with exactly 3 consecutive lower daily closes immediately before entry; enters on the 4th day. No z-score, ADX, or MACD condition.` | `Previous close above SMA200 (uptrend) with 3 consecutive lower daily closes ending at the previous close; price not above SMA5. No z-score, ADX, or MACD condition.` |
| `MEAN_REVERSION` | `Ranging market regime, z-score <= -1.3 (or news-adjusted threshold), RSI < 45, %B < 0.2.` | `Z-score <= -1.3 (or news-adjusted threshold); not taken when the regime is RANGING and ADX < 18.` |
| `TREND_PULLBACK` | `Uptrend structure (price > EMA50 > EMA200), z-score <= 0, EMA50 slope rising, ADX >= 20, momentum confirmed.` | `Uptrend structure (price > EMA50 > EMA200), z-score <= 0, EMA50 slope rising, ADX >= 20 (or ADX unavailable), MACD histogram > -2.0, momentum confirmed.` |
| `TREND_ZLE05` | current text | unchanged if the re-check finds no difference (expected: matches) |
| `EMA_RECLAIM` | current text | unchanged if the re-check finds no difference (expected: matches) |

Notes on the proposal:
- "enters on the 4th day" is dropped from 3DAY: it is a consequence of the streak, not a condition in the code. "Exactly" is dropped because the code does not test a fourth lower close.
- The SMA5 fail-open (gate skipped when SMA5 is unusable, `claude-agent.ts:1736-1738`) is not stated: it is a data-fault branch, and the criteria line stays at the current length.
- For ZLE05 and PULLBACK, "momentum confirmed" is implied by "EMA50 slope rising" in the code (`ema50SlopeOk` implies `ema50 > ema50Prev`, i.e. `momentumOk`). The word stays in PULLBACK because the current text already has it; no wording is added to ZLE05.
- Where a rewritten string equals the old one (ZLE05, EMA_RECLAIM), the file is not changed for that setup, and the test pins the string anyway.

## Test design

1. Add to `stock-selector.test.ts` (same mocks as the existing `selectStocksForAnalysis` describes) a `describe('selectStocksForAnalysis — setup criteria in the selection prompt')`:
   - Call `selectStocksForAnalysis(manyPoolACandidates(12), ACCOUNT, NO_POSITIONS)` with `mockClaudeSelection(['SYM00'])`.
   - Read `mockMessagesCreate.mock.calls[0][0].system`.
   - Assert it contains each line `    * NAME: <exact expected criteria>` (the expected strings are literals in the test, not imported from `setups.ts`, so the test fails if `setups.ts` drifts).
   - Assert it does not contain `RSI < 45` and does not contain `%B < 0.2`.
2. Add a small pin test for `ACTIVE_SETUPS` (5 entries, names in order, exact criteria, all active). It can live in the same file or in a new `setups.test.ts`; default is the same file to avoid a new file (Q-2).
3. RED first: run the new tests against the old `setups.ts` and record the failures (expected: MR, PULLBACK, 3DAY lines and both absence checks).

## Part A edit design

| File | Lines | Change |
|------|-------|--------|
| `.claude/agents/test-agent.md` (CRLF) | 290-298 | Heading "Universal exit conditions (test these for every signal)" -> "Exit conditions by setup"; replace the 5 fixtures with fixtures per rule: profit target 10% (default) and 5% (ZLE05), time stop `tradingDaysHeld: 20` (`>= 20`), stop loss -5% (two layers), MR `zscore >= -0.8` (`EXIT_LONG`) and profit floor 5/3/3 pp, PULLBACK/RECLAIM `price < EMA50`, ZLE05 `zscore >= 1.25`, 3DAY `price > SMA5` |
| `.claude/agents/test-agent.md` (CRLF) | 267 | `// in 0–0.5 band` -> comment that states `0 < z <= 1.25` |
| `.claude/skills/typescript-patterns.md` (LF) | 102 | Insert `'TREND_PULLBACK_3DAY'` in the union after `'TREND_PULLBACK'` |
| `SDD.md` (CRLF) | 259-269 | Replace the 3-row table by 8 rows (below); keep the intro line, the 60-day note and the Node 24 / `npm audit` sentence |

Proposed SDD §15 rows (cron strings and names re-read from the files at implementation; commands read from each workflow's `run:` step):

| Workflow (name in file) | File | Schedule |
|-------------------------|------|----------|
| Trading Agent Cycle | `agent-cron.yml` | `0 14-20 * * 1-5` — hourly 14–20 UTC (10am–4pm EDT / 9am–3pm EST) |
| Exit Check — Open and Close | `agent-exits.yml` | `30 13 * * 1-5` (9:30am EDT / 8:30am EST) and `55 19 * * 1-5` (3:55pm EDT / 2:55pm EST) |
| Position Health Check | `position-health.yml` | `45 13 * * 1-5` (9:45am EDT / 8:45am EST) and `10 20 * * 1-5` (4:10pm EDT / 3:10pm EST) |
| Daily Bars Sync | `daily-bars-sync.yml` | `0 21 * * 1-5` (5:00pm EDT / 4:00pm EST) |
| Earnings Calendar Sync | `earnings-calendar-sync.yml` | `17 11 * * 1-5` (7:17am EDT / 6:17am EST) |
| Security Audit | `security-audit.yml` | `0 12 * * 1-5` (8:00am EDT / 7:00am EST) |
| Weekly Trading Report | `weekly-report.yml` | `0 21 * * 5` Fridays (5pm EDT / 4pm EST) |
| PR Review | `pr-review.yml` | no cron; pull request opened, synchronize or reopened on `main` |

The table keeps the existing columns (Workflow, File, Schedule, Command); the Command cell comes from each file's `run:` step and is `—` or the step text where there is no npm script.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Change only the 3 inaccurate strings; pin all 5 | Minimal diff; unchanged strings stay byte-identical | The instruction says "rewrite EVERY setup" | Chosen (the re-check is performed for every setup; identical result is reported) |
| Rewrite all 5 strings with new wording | Uniform | Changes prompt text that is already accurate | Rejected |
| Test imports expected strings from `setups.ts` | Short | Passes when the file drifts; does not pin | Rejected |
| Read `SELECTION_SYSTEM_PROMPT` by exporting it | Direct | Requires editing `stock-selector.ts` (forbidden) | Rejected |
| Capture `system` from the mocked `messages.create` | No source change | Needs a 12-candidate call | Chosen |
| Also fix the SDD §2 diagram names | Closes the stale names | Outside "section 15" | Rejected (report only) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.claude/agents/test-agent.md` | MODIFY | Exit block (290-298) and ZLE05 comment (267) |
| `.claude/skills/typescript-patterns.md` | MODIFY | Line 102 union |
| `SDD.md` | MODIFY | Section 15 table |
| `src/lib/setups.ts` | MODIFY | `criteria` strings only |
| `src/lib/__tests__/stock-selector.test.ts` | MODIFY | New describe (prompt contains criteria; absence checks; pin) |
| `src/lib/__tests__/setups.test.ts` | CREATE (optional) | Only if Q-2 is answered "separate file" |
| `.tmp/docs-5-report.md` | CREATE | Changes, criteria old/new, test results (git-ignored) |
| `specs/docs-5-selector-criteria/` | CREATE | This spec |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `claude-agent.ts` and `config.ts` are read only. `setups.ts` and `stock-selector.test.ts` are not in the Protected Zone list; `setups.ts` is edited under explicit owner authorization (criteria text only). `stock-selector.ts` is not edited.

## Database Changes

None.

## Risk and effect

- Prompt effect: the selection prompt changes in 3 lines. It can shift which symbols the selector prefers (MR is described more widely: any regime except RANGING with ADX < 18; PULLBACK and 3DAY gain a gate each). It cannot change an entry: entries are decided by `claude-agent.ts`.
- The change is live on the next cycle where the screener returns at least 10 candidates (`claude-agent.ts:1159`).
- Rollback: revert the `setups.ts` strings.

## Open Questions

- **Q-1 (ZLE05 and EMA_RECLAIM):** the re-check expects both strings to match the code, so they would stay byte-identical. Default: do not edit them; pin them in the test and show "old = new" in the report. Confirm, or say if you want them reworded anyway.
- **Q-2 (test location):** default is to add all new tests to `stock-selector.test.ts`. Alternative: pin test in a new `setups.test.ts`. Confirm.
- **Q-3 (3DAY wording):** the proposal drops "exactly" and "enters on the 4th day" and adds the SMA5 gate and "previous close". Confirm, or keep "enters on the 4th day".
- **Q-4 (SDD §2 diagram):** lines 14-16 still name `trading-cycle.yml` and `exit-only.yml`. Default: leave and list in the report. Confirm, or authorize fixing them in this change.
- **Q-5 (MR wording):** the proposal says "not taken when the regime is RANGING and ADX < 18". The old text said "Ranging market regime". Because the selector may have used that wording to prefer ranging stocks, the new text reverses that bias. This is the point of the change; confirm the wording.
- **Q-6 (SDD Command column):** for workflows with no npm script (`security-audit.yml`, `pr-review.yml`, the two syncs, `position-health.yml`) the Command cell would be taken from each `run:` step. Default: short factual text from the file. Confirm.
