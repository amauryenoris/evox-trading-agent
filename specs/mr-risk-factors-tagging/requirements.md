# Requirements — Add mrRiskFactors Persisted Observability Tagging

## Functional Requirements

FR-01: The system shall add one new optional field, `mrRiskFactors: string[] | null`, to the `TechnicalIndicators` interface in `src/lib/types.ts`, with no change to any other field in that interface.
FR-02: The system shall compute a `mrRiskFactors` value of `null` for a symbol's Mean Reversion evaluation when `meanReversionSignal` is false for that symbol.
FR-03: Where `meanReversionSignal` is true for a symbol, the system shall compute `mrRiskFactors` as an array containing `'LOW_ADX'` when `hasValidAdx && adxValue < mrRangingAdxFloor`, independently of the other two tags.
FR-04: Where `meanReversionSignal` is true for a symbol, the system shall compute `mrRiskFactors` as an array containing `'RANGING'` when `indicators.marketRegime === 'RANGING'`, independently of the other two tags.
FR-05: Where `meanReversionSignal` is true for a symbol, the system shall compute `mrRiskFactors` as an array containing `'DEEP_EXTENSION'` when `indicators.distanceToEma50Pct !== null && indicators.distanceToEma50Pct < -15`, independently of the other two tags.
FR-06: The system shall persist the computed `mrRiskFactors` value into the `indicators` JSONB field of the `agent_log` entry written for a symbol when that symbol's evaluation reaches the happy-path `indicatorsWithLearning` construction (the block building the entry ultimately written via `insertAgentLogEntry`, currently ~lines 2282-2290).
FR-07: The system shall persist the computed `mrRiskFactors` value into the `indicators` JSONB field of the `agent_log` entry written for a symbol when that symbol's evaluation is blocked by the MR_RANGING_ADX_GATE early-exit path (currently ~lines 1937-1951).
FR-08: The system shall write `mrRiskFactors` as `null` (or omit the field) on any `agent_log` entry where `meanReversionSignal` was false for that symbol — never an empty array standing in for "not applicable."
FR-09: The system shall write `mrRiskFactors` as an empty array `[]` (not `null`, not omitted) on an `agent_log` entry where `meanReversionSignal` was true for that symbol but none of the three tags fired.
FR-10: The system shall reuse the existing exported `mrRangingAdxFloor` constant (`src/lib/claude-agent.ts:65`, value `18`) for the `LOW_ADX` threshold — not introduce a new numeric literal.
FR-11: The system shall reuse the existing `hasValidAdx` local variable (computed ~line 1689-1691) for the ADX-validity check — not duplicate that null/finite check.
FR-12: The system shall NOT modify `emaReclaimRiskFactors`, its `'LOW_ADX'` threshold (`< 20`), or the two `console.log` statements that use it (~lines 1830-1854).
FR-13: The system shall NOT modify `meanReversionSetup`, `mrRangingAdxGateOk`, or any BUY/HOLD/SELL decision outcome.
FR-14: The system shall NOT modify the `MR_BLOCKED_RANGING_ADX` `console.log` statement (~lines 1758-1766).

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero new errors after the change.
NFR-02: The change shall be confined to `src/lib/types.ts` and `src/lib/claude-agent.ts` — no other file modified, and no database migration added.
NFR-03: Attaching `mrRiskFactors` to any `indicators`/`AgentLogEntry` object literal shall type-check without an `as unknown as TechnicalIndicators` (or equivalent unsafe) cast — since `mrRiskFactors` becomes a genuine, typed field on `TechnicalIndicators` per FR-01, no escape-hatch cast is needed anywhere this field is attached.

## Constraints

C-01: `src/lib/claude-agent.ts` **is** in the Protected Zone (`CLAUDE.md`). Implementation shall not begin until Amaury has given fresh, explicit, in-conversation confirmation to touch this specific file — spec approval alone does not constitute that confirmation.
C-02: `src/lib/types.ts` is listed as "Touch freely" in `CLAUDE.md`'s File Permission Matrix — no special confirmation is required for that file specifically, only for `claude-agent.ts`.
C-03: The system shall not modify `src/lib/risk-manager.ts` or `src/lib/indicators.ts`.
C-04: The system shall not add a database migration, a new table, or a new column — `mrRiskFactors` rides in the already-persisted `indicators` JSONB field only.
C-05: The system shall not rename, merge, or otherwise conflate `mrRiskFactors` with `emaReclaimRiskFactors` — they are separate arrays with a deliberately different `LOW_ADX` threshold (18 vs 20).

## Out of Scope

- Attaching `mrRiskFactors` at the two rare early-exit paths where a `meanReversionSignal === true` symbol could theoretically be intercepted by a *different* setup type's near-miss/quality-fail check before reaching the MR gate check (`EMA_RECLAIM_NEAR`, ~line 1902-1915; `TREND_QUALITY_FAIL`, ~line 1917-1932) — analyzed in `design.md` as a known, low-probability, accepted gap; not included by default (see `design.md` → Open Questions).
- Attaching `mrRiskFactors` at the two post-Claude-call portfolio-gate-blocked paths (`max_positions`, ~line 2043-2059; `max_buys`, ~line 2061-2077) — flagged in `design.md` as a recommended addition, not included in the mandatory scope by default (see `design.md` → Open Questions).
- Adding a `console.log` display of `mrRiskFactors` (unlike `emaReclaimRiskFactors`, which is console.log-only) — not requested; this field is persisted-only per the Context's stated purpose.
- Any change to gate thresholds, gate logic, or trading decisions of any kind.
- The actual Phase 3 gate-validation analysis itself — this spec only accumulates the data needed for it.
