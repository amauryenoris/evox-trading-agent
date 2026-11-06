# Requirements — docs-3: Align documentation and agent instructions with the code (DOCUMENTATION ONLY)

## Functional Requirements

### Signals and exits (CLAUDE.md, SDD.md)

FR-01: The system shall describe, in the CLAUDE.md signals section, exactly five setups: MEAN_REVERSION, TREND_PULLBACK, TREND_PULLBACK_3DAY, TREND_ZLE05 and EMA_RECLAIM.
FR-02: The system shall retitle the CLAUDE.md section "4 Trading Signals" so that it no longer states a count of four.
FR-03: The system shall state for MEAN_REVERSION the entry condition as the code evaluates it: z-score <= the effective threshold (base -1.3) and the ranging-ADX gate (blocked when regime is RANGING and ADX < 18) (`claude-agent.ts:1684-1703`, `:83`).
FR-04: The system shall not state RSI < 45 or %B < 0.2 as MEAN_REVERSION entry conditions unless the implementer finds code that enforces them.
FR-05: The system shall state for TREND_PULLBACK the entry condition: price > EMA50 > EMA200, z-score <= 0, EMA50 rising (or prior-close fallback), ADX >= 20 (or ADX unavailable) and MACD histogram > -2.0 (`claude-agent.ts:1744-1757`, `:84`).
FR-06: The system shall state for TREND_PULLBACK_3DAY the entry condition: previous close > SMA200, three consecutive lower closes before it, and current price not above SMA5 (`claude-agent.ts:1713-1742`, `sma5-exit.ts:7-14`).
FR-07: The system shall state that TREND_PULLBACK_3DAY reads no z-score, ADX or MACD condition.
FR-08: The system shall state for TREND_ZLE05 the entry condition: uptrend structure, 0 < z-score <= 1.25, EMA50 rising, ADX >= 18 (or ADX >= 15 with MACD histogram > 0.25) and MACD histogram > 0 (`claude-agent.ts:1665-1670`, `:1791-1801`, `:85`).
FR-09: The system shall state for EMA_RECLAIM the entry condition: price above EMA50 by more than 0.2%, previous close <= previous EMA50, z-score < 0 and momentum confirmed (`claude-agent.ts:1822-1829`).
FR-10: The system shall state the classification priority used when several setups match: TREND_PULLBACK_3DAY, MEAN_REVERSION, TREND_PULLBACK, TREND_ZLE05, EMA_RECLAIM (`claude-agent.ts:1887-1897`).
FR-11: The system shall state for MEAN_REVERSION the setup exit: the Kalman signal EXIT_LONG, i.e. z-score >= -0.8 (`MEAN_REVERSION_EXIT_STD` default 0.8, `config.ts:5`, `indicators.ts:195`, `claude-agent.ts:265-269`).
FR-12: The system shall state for TREND_PULLBACK and for EMA_RECLAIM the setup exit: price below EMA50 (`claude-agent.ts:272-276`, `:286-290`).
FR-13: The system shall state for TREND_ZLE05 the setup exit: z-score >= 1.25, and that price below EMA50 is not an exit for this setup (`claude-agent.ts:279-283`).
FR-14: The system shall state for TREND_PULLBACK_3DAY the setup exit: price strictly above SMA5, recorded as SMA5_RECLAIM (`claude-agent.ts:293-297`, `sma5-exit.ts:7-9`).
FR-15: The system shall state the profit target per setup: 5% for TREND_ZLE05 and 10% for every other setup including unknown (`protective-stop.ts:27-30`).
FR-16: The system shall state the 20-trading-day time stop as applying to every position (`claude-agent.ts:260-262`).
FR-17: The system shall state the MEAN_REVERSION profit floor: activation at +5%, minimum floor +3%, ratchet of 3 percentage points below the high, and that it replaces the ATR trailing stop for MEAN_REVERSION only (`protective-stop.ts:12-14`, `:93-98`, `claude-agent.ts:314-343`).
FR-18: The system shall state the ATR trailing activation and multiplier for the other setups: TREND_PULLBACK 6% and 1.5x, TREND_PULLBACK_3DAY 6% and 1.5x, TREND_ZLE05 3% and 1.0x, EMA_RECLAIM 4% and 1.0x, unknown 5% and 1.2x (`protective-stop.ts:17-24`, `claude-agent.ts:303-310`).
FR-19: The system shall state that the ATR trailing stop floors at the buy price (`claude-agent.ts:369-370`).
FR-20: The system shall replace the CLAUDE.md "Universal exits" list with a list that names which exits apply to all setups (profit target value per setup, time stop, stop loss in two layers) and which apply to a subset (profit floor MR only, ATR trailing all but MR).
FR-21: The system shall keep the stop-loss description as two layers: Alpaca GTC stop order and the manual cycle check.
FR-22: The system shall apply the FR-01 to FR-21 corrections to SDD.md section 4 (Signal Types table and the sentence after it) and section 5 (Trailing Stop System), and to the flow diagram line "any of 4 signal types" (`SDD.md:59`).
FR-23: The system shall add TREND_PULLBACK_3DAY and the MEAN_REVERSION profit floor to the SDD.md trailing activation table or its surrounding text, with the same values as FR-17 and FR-18.
FR-24: The system shall verify every other SDD.md statement about the five setups against the code and list any disagreement it does not change.

### Spread limit (.claude files)

FR-25: The system shall replace `MAX_SPREAD_BPS = 50` with `MAX_SPREAD_BPS = 100` in `.claude/agents/debug-agent.md:108`, `.claude/agents/trading-reviewer.md:42` and `.claude/skills/alpaca-patterns.md:59`.
FR-26: The system shall replace "≤ 50bps" with "≤ 100bps" in `.claude/agents/debug-agent.md:115` and `.claude/agents/trading-reviewer.md:72`.
FR-27: The system shall change in those three files nothing other than the spread figure and any other number proven wrong against the code.
FR-28: The system shall list in the report every extra number it changed in the .claude files, with the old value, the new value and the source file:line.

### README.md

FR-29: The system shall describe `MAX_POSITION_SIZE` in README.md (line 72-73 comment and line 224 table row) as a fraction of equity (default 0.10) that only feeds the prompt text and does not limit order quantity (`prompt-builder.ts:134,188`).
FR-30: The system shall replace the README.md example value `MAX_POSITION_SIZE=1000` with a fraction.
FR-31: The system shall check every other number in README.md against its source and correct only those it can prove wrong.
FR-32: The system shall list the README.md `RISK_PCT` example (0.02 / 2%) and the Exit Check / Trading Cycle times (lines 152-154) against `claude-agent.ts:2205` and the workflow files, and correct them only if the comparison proves them wrong.
FR-33: The system shall add TREND_PULLBACK_3DAY to the README.md setups table (lines 236-239) only if the implementer reads the table as a list of all live setups.

### Next.js version

FR-34: The system shall read the Next.js version from `package.json` (`^16.4.4`, line 27) before editing.
FR-35: The system shall update `AGENTS.md:4` and the `CLAUDE.md` Stack row (line 65) from 16.2.1 to the version in `package.json`.

### Report and process

FR-36: The system shall write `.tmp/docs-3-report.md` listing each change as old value, new value and source file:line.
FR-37: The system shall list in that report every remaining disagreement found and not changed, with file:line.
FR-38: The system shall read the source for each number before writing it.
FR-39: The system shall preserve the CRLF line endings of every edited file (all candidate files are 100% CRLF today).
FR-40: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: Every changed documentation statement shall be traceable to a file:line in the report.
NFR-02: Wording outside the listed corrections shall remain byte-identical.
NFR-03: The edited CLAUDE.md signals section shall stay concise (a table or short list per setup, no prose rewrite of unrelated sections).

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) — they are read only. No Protected Zone confirmation is needed because nothing in them changes.
C-02: Only these files may be edited: CLAUDE.md, SDD.md, AGENTS.md, README.md, `.claude/agents/*.md`, `.claude/skills/*.md`, plus the new `.tmp/docs-3-report.md`.
C-03: `.claude/settings.json`, hooks and permission files, source, tests, goldens, workflows, `config.ts` and package files shall not be edited.
C-04: A documented number shall not change without reading its source in this change.
C-05: Wording shall not be "improved" beyond the corrections.
C-06: Commit and push are forbidden.

## Out of Scope

- Any code, test, golden, workflow or package change, including fixing the code when it disagrees with its own documentation.
- `src/lib/setups.ts:17` (code string that still says RSI < 45 and %B < 0.2): reported, not edited.
- Resolving the unconfirmed MR entry criteria by changing the code.
- Doc files outside the allowed list (for example `specs/**`, `.github/**`).
- Other agent and skill files that have no wrong number.
