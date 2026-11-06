# Design — CHANGE docs-2: fix wrong numbers in CLAUDE.md and SDD.md (documentation only)

## Architecture Decision

Documentation-only change in two files, `CLAUDE.md` and `SDD.md`. Each corrected statement is checked against the source file that defines it, and the report records the proof (file and line) next to every old and new text. A broader sweep of the two documents against the code produces a list of other disagreements for a follow-up change; nothing outside the three requested items is edited.

## Facts verified in the spec phase (source of truth, commit `618bef7`)

| Item | Value in code | Proof |
|---|---|---|
| `MAX_SPREAD_BPS` | **100** | `config.ts:3`; used by the gate at `claude-agent.ts:2172-2173` (`quote.spreadBps > MAX_SPREAD_BPS` blocks) and the retry gate at `claude-agent.ts:1034` (`spreadBps <= MAX_SPREAD_BPS`) |
| `MAX_QUOTE_AGE_SECONDS` | 60 | `config.ts:4`; `alpaca.ts:157-158` (`age < MAX_QUOTE_AGE_SECONDS`) |
| Who reads `MAX_POSITION_SIZE` | only the prompt | `prompt-builder.ts:134` (`maxPositionValue = equity x MAX_POSITION_SIZE`) and `:188` (`Max Position Size` line); no read in `claude-agent.ts`, `position-sizing.ts` or `risk-manager.ts` (grep of `src/` and `scripts/`) |
| Real per-position cap | `MAX_POSITION_EQUITY_FRACTION = 0.10` | `position-sizing.ts:1`, applied at `:72` (`equityCap`); a constant, not env |
| Buying-power cap | `BUYING_POWER_FRACTION = 0.95` | `position-sizing.ts:6`, applied at `:71` (`buyingPower`, not cash) |
| `claude-agent.ts` role | agent loop, signal detection, exit rules (`enforceExitRules`); calls `computeBuyQuantity` and `buildEnrichedPrompt` | `claude-agent.ts` (import lines 48-49, call at ~2205) |
| Workflow list sentence | names `security-audit.yml` in the "Other workflows not listed above" list although the previous sentence already names it | `CLAUDE.md:257-258` |

## Planned edits (old -> new)

| # | File : line | Old | New |
|---|---|---|---|
| E1 | `CLAUDE.md:148` | `MAX_SPREAD_BPS = 50             // Max bid-ask spread allowed` | `MAX_SPREAD_BPS = 100            // Max bid-ask spread allowed` (column alignment kept) |
| E2 | `CLAUDE.md:184` | `spread (≤ 50bps)` | `spread (≤ 100bps)` |
| E3 | `SDD.md:76` | `spreadBps ≤ MAX_SPREAD_BPS (50)` | `spreadBps ≤ MAX_SPREAD_BPS (100)` |
| E4 | `CLAUDE.md:178` | `\| MAX_POSITION_SIZE \| 0.10 \| Max position as % of equity \|` | description: only feeds the prompt text (`Max Position Size`, `Max Position Value Allowed`); does not limit the order quantity |
| E5 | `CLAUDE.md` (under the Risk Parameters table) | (none) | one short sentence: the real per-position cap is `MAX_POSITION_EQUITY_FRACTION = 0.10` of equity in `position-sizing.ts` (a constant, not env), next to the `BUYING_POWER_FRACTION = 0.95` cap |
| E6 | `CLAUDE.md:83` | `Main agent loop — runAgentCycle(), signal detection, exit rules, position sizing` | `Main agent loop — runAgentCycle(), signal detection, exit rules; the BUY quantity comes from position-sizing.ts and the prompt from prompt-builder.ts` |
| E7 | `CLAUDE.md:258` | `... position-health.yml, security-audit.yml and pr-review.yml ...` | the same list without `security-audit.yml` |

A search for other spread figures found only E1 to E3 (`grep` for `50 ?bps`, `BPS.{0,12}50`, `(50)`, `= 50` over both documents). `SDD.md:76` also compares with `≤` while the code blocks on `>`, so `≤` stays.

## Disagreements already seen (item D; to be re-verified, listed in the report, not edited)

| Where | Documented | Code says |
|---|---|---|
| `CLAUDE.md:159`, `SDD.md:107` MEAN_REVERSION condition | "RANGING, z <= -1.3, RSI < 45, %B < 0.2" | the setup is `z <= effectiveThreshold` blocked only when regime RANGING and ADX < 18 (`mrRangingAdxFloor`, `claude-agent.ts` setup block); RSI < 45 and %B < 0.2 are in `generateSignalType`, used only for rotation |
| `CLAUDE.md:161`, `SDD.md:109` TREND_ZLE05 exit | "price falls below EMA50" | z-score >= 1.25 exhaustion exit (`claude-agent.ts` exit rules) |
| `CLAUDE.md:165`, `SDD.md:112` "+10% profit target" for all signals | 10% for all | TREND_ZLE05 uses 5% (`protective-stop.ts` `PROFIT_TARGET_PCT`) |
| `CLAUDE.md:155` "4 Trading Signals", `SDD.md` signal table | 4 signals | a fifth, `TREND_PULLBACK_3DAY`, exists (`claude-agent.ts`, `protective-stop.ts`); MEAN_REVERSION also has a profit floor (`PROFIT_FLOOR_CONFIG`) |
| `SDD.md:90` caps | "95% of cash / price" | `buyingPower x 0.95 / price` (`position-sizing.ts:71`) |
| `SDD.md:77` quote freshness | `age ≤ MAX_QUOTE_AGE_SECONDS (60)` | strict `<` (`alpaca.ts:157-158`) |
| `CLAUDE.md` Stack row | "Next.js 16.2.1" | `package.json` `^16.4.4` (installed 16.4.4) |
| Outside the two documents (list only) | `README.md:73,224` `MAX_POSITION_SIZE=1000` "$1,000 max dollar size"; `.claude/skills/alpaca-patterns.md:59` `MAX_SPREAD_BPS = 50`; `AGENTS.md:4` "16.2.1" | see above |

Confirmed as agreeing (no edit): `ZSCORE_ENTRY_THRESHOLD -1.3`, `MAX_QUOTE_AGE_SECONDS 60`, `MAX_POSITIONS 5` default, `RISK_PCT 0.01`, `STOP_LOSS_PCT 0.05`, max 5 buys per day, liquidity 1,000,000, trading hours 9:45 to 15:30 ET, confidence factor 0.50 to 1.0, EMA_RECLAIM 0.75, regime multipliers, risk gates (drawdown -15%, total risk 10%, correlation 3 per sector), 20-day time stop.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Fix only the three requested items and list the rest (chosen) | Small, reviewable, matches the request | Leaves known wrong lines for a second change | Chosen |
| Also fix the MEAN_REVERSION, ZLE05 and signal-count lines now | Docs fully consistent | Larger rewrite of strategy descriptions, outside the request | Rejected (proposed as docs-3) |
| Make `MAX_POSITION_SIZE` actually cap orders | Removes the confusing variable | A code change that alters live sizing; forbidden | Rejected |
| Remove the `MAX_POSITION_SIZE` row | Avoids documenting a misleading variable | Hides an env var that exists and is read | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `CLAUDE.md` | MODIFY | Edits E1, E2, E4, E5, E6, E7 |
| `SDD.md` | MODIFY | Edit E3 |
| `.tmp/docs-2-report.md` | CREATE | Deliverable (gitignored) |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `config.ts` is read, not edited.

## Database Changes

None.

## Open Questions

- **O-1** The request's item 3 places the duplicate `security-audit.yml` mention "in the File Structure table", but it lives in the workflow sentence of `CLAUDE.md` (line 258). Default: remove it from that list and leave the table alone. Say if you meant something else.
- **O-2** Where to document `MAX_POSITION_EQUITY_FRACTION`. The Risk Parameters table is for env variables, so a code constant does not belong in it. Default: describe `MAX_POSITION_SIZE` in its row and add one sentence below the table naming the real cap and the buying-power cap.
- **O-3** Wording of the `claude-agent.ts` row (E6). Default as in the table above.
- **O-4** The larger stale items (MEAN_REVERSION condition, ZLE05 exit and profit target, fifth signal, `95% of cash`, Next.js version) are only listed. Default: propose a follow-up docs-3 for them; the out-of-scope files (`README.md`, `AGENTS.md`, skills) would need their own authorization.
- **O-5** All line numbers above are from commit `618bef7` and are re-checked at implementation time before editing.
