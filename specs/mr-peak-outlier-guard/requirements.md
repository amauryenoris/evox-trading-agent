# Requirements — Outlier Guard on the 1-Minute High + Split `applyProfitFloor`

Follow-up to the MR profit floor review (MEDIUM-1 and MEDIUM-2). The floor parameters (MR, activation +5%, floor +3%, ratchet margin 3 pp) do not change.

## Functional Requirements

### A. Bar-level guard (`src/lib/peak-high.ts`)

FR-01: The system shall ignore a 1-minute bar whose volume is zero.
FR-02: The system shall ignore a 1-minute bar whose high, close or volume is not a finite number.
FR-03: The system shall cap the high of each 1-minute bar at its close multiplied by `PEAK_CLOSE_CAP_RATIO` before the bar can count as a peak.
FR-04: The system shall define `PEAK_CLOSE_CAP_RATIO` as the named constant 1.01.
FR-05: The system shall keep counting only regular-session bars (09:30 inclusive to 16:00 exclusive, America/New_York).
FR-06: The system shall return null when no valid regular-session bar remains.

### B. Jump guard (per check)

FR-07: The system shall define `PEAK_MAX_JUMP_PP` as the named constant 10 (percentage points of entry), in the same module as `PEAK_CLOSE_CAP_RATIO`.
FR-08: The system shall ignore each peak candidate that exceeds `storedHigh + PEAK_MAX_JUMP_PP% × entry` (decision O-1 = B: reject, not cap), while keeping the valid candidates of the same check.
FR-09: The system shall emit one `console.warn` containing the symbol, the largest rejected candidate, the stored high, the entry and the jump limit when candidates are rejected.
FR-10: The system shall return the candidate unchanged when it does not exceed the jump limit.
FR-11: The system shall not emit the jump warning when the candidate does not exceed the jump limit.
FR-12: The system shall keep `highSinceEntry` at the larger of its stored value and the guarded peak.
FR-13: The system shall leave the current-price sample of `highSinceEntry` outside the guard.
FR-14: The system shall skip the jump guard when no stored high or no entry is supplied.
FR-15: The system shall pass the stored high (the persisted `highSinceEntry`, or the current price when none is stored) to the peak computation.
FR-16: The system shall pass the entry (`avg_entry_price`, falling back to the context buy price) to the peak computation.
FR-17: The system shall not raise `highSinceEntry` because of a bad print that stays inside the lookback window across consecutive checks.

### C. Unchanged behavior

FR-18: The system shall use at most one extra bars request per MR position per check.
FR-19: The system shall return null when the bars request fails, so the stored high and the current-price sample remain in force.
FR-20: The system shall apply the peak computation to `MEAN_REVERSION` positions only.
FR-21: The system shall keep the floor parameters (activation 5, floor 3, ratchet 3) unchanged.
FR-22: The system shall keep a call with the original three arguments valid.

### D. Function split (`src/lib/claude-agent.ts`)

FR-23: The system shall handle the `sell_now` branch of the profit floor in its own function.
FR-24: The system shall persist the same context state on `sell_now` as before the split (`highSinceEntry`, `trailingStop`, `trailingActivated: true`).
FR-25: The system shall return the same exit text, `Exit rule: profit floor $X (+Y%) breached`, on `sell_now` as before the split.
FR-26: The system shall return no exit reason on `sell_now` when another exit already fired in the same run.
FR-27: The system shall keep every function it adds or modifies in `claude-agent.ts` at 50 lines or fewer.

## Non-Functional Requirements

NFR-01: The guard shall be deterministic for a given set of bars, stored high and entry.
NFR-02: The existing profit-floor tests (`mr-profit-floor-exit-rules.test.ts`, `protective-stop.test.ts`) shall pass without edits.
NFR-03: New code shall reach at least 80% coverage; `peak-high.ts` shall reach 100% of lines.
NFR-04: `tsc`, the full Vitest suite and `npm run build` shall pass.
NFR-05: The change shall add no dependency.
NFR-06: The guard shall add no Alpaca request.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. Authorized: `src/lib/claude-agent.ts`. `src/lib/peak-high.ts` is not in the CLAUDE.md Protected Zone list but is named in the brief and treated as authorized.
C-02: No other Protected Zone file shall be touched.
C-03: `db.ts`, `types.ts`, the dashboard, entries, sizing, the initial stop, Capa B and every other setup shall not change.
C-04: `claude-agent.ts` shall import only `getPeakHighSinceLastCheck` from `peak-high.ts`, because the existing exit-rules test replaces that module with a one-function mock.
C-05: The guard constants shall live in `peak-high.ts` only; `config.ts` shall not be touched.
C-06: No live order is placed during implementation or verification.

## Out of Scope

- Any change to the floor parameters or to `computeProtectiveStop`.
- Guarding the current-price sample.
- Storing a last-check timestamp (needs a `db.ts` or schema change).
- Sampling peaks for setups other than `MEAN_REVERSION`.
- Dashboard text.
