# Requirements — TREND_PULLBACK_3DAY: No Entry When Price Is Above the SMA5 Exit Level

## Functional Requirements

### A. Entry gate

FR-01: The system shall not detect a TREND_PULLBACK_3DAY candidate when the TREND_PULLBACK_3DAY exit condition would fire at the candidate's current price and SMA5.
FR-02: The system shall decide the entry gate with the same comparison function that the TREND_PULLBACK_3DAY exit uses.
FR-03: The system shall decide the TREND_PULLBACK_3DAY exit with that same comparison function.
FR-04: The system shall treat a price strictly above the SMA5 as the exit condition being met (the operator the exit uses today; see O-1).
FR-05: The system shall allow a candidate whose price is equal to or below the SMA5.
FR-06: The system shall read the price and the SMA5 of the gate from the same indicator object that the other 3DAY conditions read.
FR-07: The system shall keep the SMA200 and the three-decreasing-closes conditions unchanged.
FR-08: The system shall apply the SMA5 gate only to candidates that already meet the SMA200 and three-decreasing-closes conditions.
FR-09: The system shall not block a candidate when its SMA5 is missing.
FR-10: The system shall not block a candidate when its SMA5 is not a finite number.
FR-11: The system shall emit one `console.warn` containing the symbol when it skips the gate for a missing or non-finite SMA5 on a candidate that meets the other 3DAY conditions.

### B. Blocked-candidate record

FR-12: The system shall record a HOLD entry for a candidate blocked by the SMA5 gate when no other setup is detected for that symbol.
FR-13: The system shall start the `error` field of that record with `TREND_3DAY_ABOVE_SMA5`.
FR-14: The system shall include the text `price $X >= SMA5 $Y (3DAY exit would fire immediately)` in that record, with X and Y rounded to two decimals.
FR-15: The system shall store the full indicator object, including `sma5` and `currentPrice`, in that record.
FR-16: The system shall set `orderExecuted` to false, `quantity` to 0 and `confidence` to 0 in that record.
FR-17: The system shall emit a `[SETUP-GATE]` console line naming the symbol and `TREND_3DAY_ABOVE_SMA5` when it blocks a candidate.
FR-18: The system shall skip further evaluation of a blocked symbol in the cycle when no other setup is detected, as the other blocked candidates do.
FR-19: The system shall continue to evaluate a blocked symbol under the other detected setup when another setup is detected (see O-2).
FR-20: The system shall write no HOLD record for a blocked symbol that continues under another setup.

### C. Unchanged behavior

FR-21: The system shall keep the TREND_PULLBACK_3DAY exit rule, its operator and its exit text unchanged.
FR-22: The system shall keep the detection of every other setup unchanged.
FR-23: The system shall keep sizing, stops and order submission unchanged for every entry.
FR-24: The system shall require no minimum distance between the price and the SMA5.
FR-25: The system shall require no database schema or type change to store the blocked record.

## Non-Functional Requirements

NFR-01: The comparison function shall be pure and deterministic.
NFR-02: The existing TREND_PULLBACK_3DAY tests shall pass without edits.
NFR-03: New code shall reach at least 80% coverage; the comparison module shall reach 100% of lines.
NFR-04: `tsc`, the full Vitest suite and `npm run build` shall pass.
NFR-05: The change shall add no dependency and no Alpaca request.
NFR-06: Functions added or changed shall be 50 lines or fewer.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. Authorized: `src/lib/claude-agent.ts` only, limited to the TREND_PULLBACK_3DAY detection, the blocked-candidate record, and the exit's SMA5 comparison.
C-02: No other Protected Zone file shall be touched.
C-03: `db.ts`, `types.ts`, the dashboard, learning files, workflows and migrations shall not change.
C-04: The 3DAY exit rule, the SMA200 condition and the three-decreasing-closes condition shall not change.
C-05: No live order is placed during implementation or verification.

## Out of Scope

- A minimum distance below the SMA5 (NVDA and AMZN entries 0.8–1.0% below the SMA5 stay allowed).
- Dashboard or report handling of the new prefix (it shows as a gate-blocked HOLD through the existing generic rule).
- Any change to rotation exits or other exit rules.
- Backfilling or reclassifying past trades.
