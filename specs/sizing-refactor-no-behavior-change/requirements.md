# Requirements — Sizing Refactor With No Behavior Change (named cap, pure sizing function, z-override switch)

## Functional Requirements

### A. Behavior preservation (switch on)

FR-01: The system shall compute the same BUY quantity as the current code for every input when `Z_SIZING_OVERRIDE_ENABLED` is true.
FR-02: The system shall keep the base quantity as `floor(equity × RISK_PCT / (price × STOP_LOSS_PCT))`.
FR-03: The system shall return a base quantity of 0 when the risk per share is 0.
FR-04: The system shall keep the regime multipliers at TRENDING 1.0, TRANSITION 0.75, RANGING 0.5 and HIGH_VOLATILITY 0.25, and 1.0 for a missing or unknown regime.
FR-05: The system shall floor the quantity after applying the regime multiplier.
FR-06: The system shall halve the quantity with a floor when the Kalman signal is missing or `NEUTRAL`.
FR-07: The system shall cap the quantity at `floor(0.95 × buying power / price)`.
FR-08: The system shall cap the quantity at `floor(MAX_POSITION_EQUITY_FRACTION × equity / price)`.
FR-09: The system shall never return a negative base quantity.
FR-10: The system shall multiply the capped base quantity by `max(0.50, min(confidence, 1.0))` and round the result.
FR-11: The system shall set the quantity after the confidence step to the capped base quantity when the z-score is at or below −2.0 and the switch is true.
FR-12: The system shall multiply the quantity by 0.75 and round when the setup is `EMA_RECLAIM`.
FR-13: The system shall use the same final quantity for the order, for `requestedQty` and for the queue.
FR-14: The system shall keep the `[BUY SIZING]` log line unchanged in format and values.
FR-15: The system shall keep the prompt's "Position size multiplier" text unchanged.

### B. Named constants

FR-16: The system shall define `MAX_POSITION_EQUITY_FRACTION` with the value 0.10.
FR-17: The system shall use `MAX_POSITION_EQUITY_FRACTION` wherever the sizing used the literal 0.10 for the equity cap.
FR-18: The system shall define `Z_SIZING_OVERRIDE_ENABLED` with the value true.
FR-19: The system shall export `Z_SIZING_OVERRIDE_ENABLED` from one module only.
FR-20: The system shall apply the confidence step to every entry when `Z_SIZING_OVERRIDE_ENABLED` is false.
FR-21: The system shall leave the z-score condition in the ranking sort independent of `Z_SIZING_OVERRIDE_ENABLED`.

### C. Pure sizing function

FR-22: The system shall compute the quantity in a function that reads no environment variable, no clock and no network resource.
FR-23: The system shall return from that function a quantity and a breakdown.
FR-24: The system shall include in the breakdown `baseShares`, `regimeMultiplier`, `kalmanHalved`, `buyingPowerCap`, `equityCap`, `confidenceFactor`, `zOverrideApplied`, `setupFactor` and `final`.
FR-25: The system shall return the same output for the same input on every call.
FR-26: The system shall not mutate its input.
FR-27: The system shall call the pure function from the single sizing site used by the immediate path and the ranking queue.
FR-28: The system shall keep the ranking phase executing the queued quantity unchanged.
FR-29: The system shall keep `RISK_PCT` and `STOP_LOSS_PCT` read and parsed at the call site with the current defaults.

### D. Scope guards

FR-30: The system shall not persist the breakdown in the database, the agent log or the position context.
FR-31: The system shall not change the order type, the IOC execution, the remainder retry, the initial stop or any entry gate.
FR-32: The system shall not add a dependency.

## Non-Functional Requirements

NFR-01: The golden quantities shall come from the current code's outputs, recorded before any refactor edit.
NFR-02: The sizing tests shall cover every branch of the pure function.
NFR-03: New code shall reach at least 80% coverage; the pure module shall reach 100% of lines.
NFR-04: Every function added or changed shall be 50 lines or fewer.
NFR-05: `tsc`, the full Vitest suite and `npm run build` shall pass.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. Authorized: `src/lib/claude-agent.ts`, only the sizing code (`calculateBuyQuantity`, the sizing block, the `regimeMultiplier` helper and the imports it needs). `config.ts` only if a constant must live there; the design keeps it untouched.
C-02: No other Protected Zone file shall be touched.
C-03: `db.ts`, `types.ts`, the dashboard, learning files, workflows and migrations shall not change.
C-04: With the switch true there shall be no behavior change of any kind.
C-05: No live order is placed during implementation or verification.

## Out of Scope

- Changing any sizing rule (removing the z override, lowering the cap, volatility-based sizing).
- Using `MAX_POSITION_SIZE` in the sizing or aligning the prompt text with the constant.
- Persisting or displaying the breakdown.
- The ranking order and the `z <= -2.0` edge test in the ranking sort.
- Revisiting the z-override decision (planned at about 35 MR trades with z ≤ −2).
