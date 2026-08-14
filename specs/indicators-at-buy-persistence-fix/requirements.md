# Requirements — Persist effectiveThreshold, newsAdjustment, sectorRotation into indicatorsAtBuy

## Functional Requirements

FR-01: The system shall assign `effectiveThreshold`, `newsAdjustment`, `sectorRotation`, and `sectorRotationContext` onto `indicatorsAtBuy` before `saveOpenPositionContext()` is called at the immediate-buy call site.

FR-02: The system shall assign `effectiveThreshold`, `newsAdjustment`, `sectorRotation`, and `sectorRotationContext` onto `bestIndicatorsAtBuy` before `saveOpenPositionContext()` is called at the ranking/best-candidate call site.

FR-03: Where the ranking/best-candidate call site assigns `effectiveThreshold`/`newsAdjustment`, the system shall use the winning candidate's own value (captured at `buyQueue` push time), not the per-symbol loop variable's value at the time the ranking phase executes.

FR-04: Where either call site assigns `sectorRotation`/`sectorRotationContext`, the system shall reference the cycle-scoped variable directly, since this value is identical for every symbol in a given cycle.

FR-05: The system shall use a plain, unconditional key assignment for all four fields at both call sites (not a conditional-spread guard), since all four are always-defined at their point of use.

FR-06: The system shall leave every other field currently assigned to `indicatorsAtBuy`/`bestIndicatorsAtBuy` (`spx_price`, `spx_sma50`, `spx_sma200`, `spx_regime`, `state_fingerprint`, `tp_population_bucket`, `tp_zscore`, `zle05_population_bucket`, `zle05_zscore`) unchanged.

FR-07: The system shall NOT modify `saveOpenPositionContext()`, the `buyQueue` type declaration, or the construction of `indicatorsWithLearning`.

FR-08: The system shall NOT modify any file other than `claude-agent.ts` and its accompanying test file.

## Non-Functional Requirements

NFR-01: The fix shall compile cleanly under `npx tsc --noEmit` — any type-level obstacle to reading `effectiveThreshold`/`newsAdjustment` off `best.entry.indicators` (whose declared type is `TechnicalIndicators`, which does not include these fields) shall be resolved at the point of use, consistent with the existing `TechnicalIndicators & Record<string, unknown>` cast pattern already used for `indicatorsAtBuy`/`bestIndicatorsAtBuy` themselves.

NFR-02: The fix shall be covered by tests proving the call-site-2 scoping asymmetry actually matters — i.e., a test where a naive direct reference to the loop-scoped `effectiveThreshold`/`newsAdjustment` variables would produce a different (wrong) value than the winning candidate's own value.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. Pre-authorized by Amaury per the originating request.

C-02: `src/lib/db.ts` and the read-time (`getTradeEvaluations()`) fix are explicitly out of scope — covered by a separate, subsequent spec ("Prompt 2/2").

C-03: No gate, signal-detection, position-sizing, or trade-execution logic may be touched.

## Out of Scope

- The read-time whitelist-drop fix in `db.ts` (`getTradeEvaluations()`, `getAgentLog()`, `getAgentLogPrioritized()`) — separate spec.
- Backfilling any historical `open_position_contexts` or `trade_evaluations` row.
- Any change to `macroContext`'s duplicate-fetch pattern, `learnContext`'s dead-code status, or any other finding from the observability inventory not directly named in this spec's Goal.
- Promoting `effectiveThreshold`/`newsAdjustment`/`sectorRotation` to first-class typed fields on `OpenPositionContext`/`TradeEvaluation` — they remain ad-hoc keys on the existing `TechnicalIndicators & Record<string, unknown>` cast, matching the precedent already set by `spx_price`/`state_fingerprint`/`tp_*`/`zle05_*`.
