# Requirements — STEP 0: BUY Sizing and Portfolio Limits Investigation (read-only)

The "system" below is the investigation: a set of throwaway read-only scripts in `.tmp/` plus a written report. Nothing in the repository, the database, the broker or the environment is changed.

## Functional Requirements

### A. Quantity formula (task 1)

FR-01: The system shall list every factor that determines the BUY quantity, in execution order, each with its file and line.
FR-02: The system shall include in that list the base risk percentage and the stop distance used by the formula.
FR-03: The system shall include in that list the regime multipliers, the Kalman-neutral halving and the confidence multiplier with its floor.
FR-04: The system shall include in that list the z-score override, the EMA_RECLAIM multiplier, the 10%-of-equity cap, the buying-power cap and the rounding.
FR-05: The system shall state whether TREND_PULLBACK_3DAY and EMA_RECLAIM are sized by the same formula as MEAN_REVERSION.
FR-06: The system shall state the effective values of `RISK_PCT`, `STOP_LOSS_PCT`, `MAX_POSITION_SIZE` and `MAX_POSITIONS` that were in force for the trades studied, with the source of each value.
FR-07: The system shall trace the exact code path that produces 250 sh (MP 2026-10-13), 159 sh (FCX), 1265 requested (UUUU), 173 requested (CRWV 2026-10-16) and 272 sh (MP 2026-10-20).
FR-08: The system shall state whether the ranking-mode path computes the quantity differently from the immediate-execution path.

### B. ATR percentile (task 2)

FR-09: The system shall document how `atrPercentile` is computed: the ATR definition, the window length and the population it is ranked against.
FR-10: The system shall document every place where the sizing depends on `atrPercentile`.
FR-11: The system shall explain with numbers why CRWV shows a percentile of 0.12 while its 14-day ATR is 9.8% of price.
FR-12: The system shall state whether the percentile or the absolute ATR% should drive sizing, with the evidence for that answer.

### C. Portfolio limits (task 3)

FR-13: The system shall list each portfolio-level limit with its value, its file and line, and the quantity it actually compares.
FR-14: The system shall state how `SECTOR_MAP` is used and what the `OTHER` bucket blocks.
FR-15: The system shall state whether the total-portfolio-risk gate can ever bind given the 10% position cap and the position limit.
FR-16: The system shall explain, with data from the dates in question, how SOFI, FCX, UUUU and CRWV were all bought near 10% within three days, and how MP was bought twice.
FR-17: The system shall name the limit that should have constrained those purchases, or state that none exists.

### D. Reconstructions (task 4)

FR-18: The system shall reconstruct the quantity step by step for MP (both entries), SOFI, FCX, UUUU, CRWV (2026-10-16 and 2026-10-20), INTC (2026-10-07 and 2026-10-13), NVDA, TSLA, EWZ and NKE.
FR-19: The system shall use for each reconstruction the stored indicators, the agent log row and the equity at the time of the entry.
FR-20: The system shall compare each reconstructed quantity with the requested quantity and with the filled quantity.
FR-21: The system shall flag every case where the three quantities differ and give the cause.
FR-22: The system shall state whether IOC partial fills or the remainder retry changed any final size.

### E. Stops (task 5)

FR-23: The system shall document the initial stop type, price rule, limit buffer and time in force.
FR-24: The system shall document the trailing stop type and the Capa-B check.
FR-25: The system shall report, from the Alpaca order history, the stop type, stop price, limit price, status, fill price and timestamp for the INTC 2026-10-13 position.
FR-26: The system shall report the same fields for the UUUU 2026-10-15 position.
FR-27: The system shall report the gap between the previous close and the open for each of those two losses.
FR-28: The system shall classify each of those two losses as a stop that filled at a gapped open, or a stop-limit that failed followed by a later market exit.
FR-29: The system shall report the stop type and stop prices currently on the open positions.

### F. Sizing table (task 6)

FR-30: The system shall compute the position as a percentage of equity at entry for every closed trade.
FR-31: The system shall take the equity at entry from the agent log snapshot when the trade record lacks it, and say which source each trade used.
FR-32: The system shall group the closed trades by setup, z bucket (≤ -2, -2 to -1, > -1), ATR percentile bucket, absolute ATR% bucket (< 2.5, 2.5–4, 4–6, 6+), confidence bucket (< 45, 45–55, ≥ 55) and regime.
FR-33: The system shall report for each group the count, average position %, win rate, average pnl %, worst pnl % and dollar pnl.
FR-34: The system shall report, per setup, the correlation between position size and pnl %.
FR-35: The system shall report the share of total dollar P&L that comes from positions above 7% of equity.
FR-36: The system shall state that the sample size is small wherever a group has few trades.

### G. Risk and gap tables (tasks 7 and 8)

FR-37: The system shall compute, for each closed trade and for the current book, position value multiplied by ATR% as the typical daily dollar swing.
FR-38: The system shall report each position's share of the current book's daily swing.
FR-39: The system shall report the distribution of overnight gaps (open versus previous close) from `daily_bars` for every symbol traded.
FR-40: The system shall report, for closed trades, the worst loss relative to the nominal -5% stop.
FR-41: The system shall report how many closed trades lost more than the stop and by how much.
FR-42: The system shall report how many exits happened between 09:30 and 10:00 ET.

### H. Simulation (task 9)

FR-43: The system shall replay the closed trades with each of the five sizing schemes (a) to (e) defined in the brief.
FR-44: The system shall report, per setup and per scheme, total dollar pnl, maximum drawdown, worst single loss as a percentage of equity and the share of trades hitting the cap.
FR-45: The system shall state the replay assumptions, including that trade pnl % is held fixed and that overlapping positions are not re-simulated.
FR-46: The system shall state the caveats on sample size and overlap next to the simulation table.
FR-47: The system shall write nothing to the database or the repository during the simulation.

### I. Opening-window exits (task 10)

FR-48: The system shall list the closed trades that were sold between 09:30 and 10:00 ET and ended in a loss.
FR-49: The system shall report, for those trades, the exit price versus the 1-minute price at 09:35, 09:45, 10:00 and the close.
FR-50: The system shall report the average and worst difference per waiting time.
FR-51: The system shall report in how many cases waiting was worse than the actual exit.
FR-52: The system shall state which exit designs would need a Protected Zone file.

### J. Draft CHANGE (task 11)

FR-53: The system shall draft two to three CHANGE options (cap, equalize, risk-based, volatility-parity), each with its trade-offs.
FR-54: The system shall state for each option which Protected Zone files it touches.
FR-55: The system shall state whether the ATR percentile should be replaced by absolute ATR% in the sizing.
FR-56: The system shall state tests, rollback and the effect on open positions for each option.
FR-57: The system shall give one recommendation with its reasoning.
FR-58: The system shall report each hypothesis ("size rises with extreme z and low percentile and is not justified"; "the percentile misrepresents absolute volatility") as confirmed, refuted or inconclusive.

### K. Evidence quality

FR-59: The system shall label every finding as confirmed from code or data, plausible, or unknown.
FR-60: The system shall report any figure from the brief that the data does not reproduce.
FR-61: The system shall state "not checked" with the reason for any item it could not examine.

## Non-Functional Requirements

NFR-01: Every claim about code shall carry a file and line reference.
NFR-02: Scripts shall be re-runnable and shall produce the same output for the same data.
NFR-03: Scripts shall print no secret, key or token.
NFR-04: Database access shall use SELECT statements only.
NFR-05: Broker and market-data access shall use GET requests only.

## Constraints

C-01: Protected Zone files (`claude-agent.ts`, `risk-manager.ts`, `config.ts`, `indicators.ts`, others) are read only.
C-02: No file in the repository outside `specs/step0-buy-sizing-investigation/` shall be created or modified; throwaway scripts live in `.tmp/` (gitignored).
C-03: No commit, push, workflow dispatch, database write, order action, or environment or secret change.
C-04: The open positions and open orders shall not be touched.
C-05: The MR profit floor and the stop-hygiene items are out of scope.

## Out of Scope

- Implementing any sizing change (that is the later CHANGE).
- Changing environment variables in workflows or Vercel.
- Re-deciding the MR profit floor parameters or the initial -5% stop.
- Entry-signal quality (gates, thresholds) beyond what sizing depends on.
