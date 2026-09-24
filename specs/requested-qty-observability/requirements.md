# Requirements — Persist requestedQty Alongside filledQty for Observability

## Functional Requirements

FR-01: The system shall add one new optional field, `requestedQty?: number`, to the `TechnicalIndicators` interface in `src/lib/types.ts`, with no change to any other field in that interface.
FR-02: The system shall capture the originally-computed BUY quantity into a variable visible at every point where it must later be persisted, for both the immediate-execution and ranking-queue code paths.
FR-03: The system shall persist `requestedQty` into the `agent_log.indicators` JSONB for a symbol's decision entry whenever a BUY quantity was computed for that symbol during that cycle — regardless of whether the resulting order filled fully, partially, or not at all.
FR-04: The system shall persist `requestedQty` into the `open_position_contexts.indicators` JSONB for a symbol's buy-context record whenever `saveOpenPositionContext()` is called following a successful (full or partial) IOC fill, on both the immediate-execution path and the ranking-queue path.
FR-05: The system shall leave `requestedQty` unset (absent from the persisted JSONB) for any symbol whose evaluation never reaches the sizing computation — e.g. HOLD due to no setup, gate-blocked, already in position, or insufficient buying power before an order is ever built.
FR-06: Where the immediate-execution path is taken, the system shall derive `requestedQty` from `qty` — the same value passed to `submitLimitOrder()`.
FR-07: Where the ranking-queue path is taken, the system shall derive `requestedQty` from `best.qty` — the value captured at `buyQueue.push()` time, identical to what is passed to `submitLimitOrder()` in the ranking-resolution phase.
FR-08: The system shall NOT modify `decision.quantity`'s existing behavior — it shall continue to reflect `filledQty` exactly as today. `requestedQty` is additive, not a replacement.
FR-09: The system shall NOT modify `submitLimitOrder()`, `resolveIocFinalState()`, or any BUY/HOLD/REJECT decision logic.
FR-10: The system shall NOT modify the `IOC_PARTIAL_FILL` or `IOC_NOT_FILLED` `console.log` statements.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero new errors after the change.
NFR-02: The change shall be confined to `src/lib/types.ts` and `src/lib/claude-agent.ts` — `src/lib/db.ts` requires no modification (see `design.md` for the verified reason), and no database migration or new column shall be added.
NFR-03: Attaching `requestedQty` to any `indicators`-shaped object literal shall type-check without an `as unknown as TechnicalIndicators` (or equivalent unsafe) cast, since it becomes a genuine typed field on `TechnicalIndicators`.

## Constraints

C-01: `src/lib/claude-agent.ts` **is** in the Protected Zone (`CLAUDE.md`). Implementation shall not begin until Amaury has given fresh, explicit, in-conversation confirmation to touch this specific file — spec approval alone does not constitute that confirmation.
C-02: `src/lib/types.ts` is listed as "Touch freely" in `CLAUDE.md`'s File Permission Matrix — no special confirmation required for that file.
C-03: The system shall not modify `src/lib/risk-manager.ts` or `src/lib/indicators.ts`.
C-04: The system shall not add a database migration, a new table, or a new column — `requestedQty` rides in the already-persisted `indicators` JSONB field only, on both `agent_log` and `open_position_contexts`.

## Out of Scope

- Modifying `src/lib/db.ts` — verified unnecessary (see `design.md`): both the write paths (`insertAgentLogEntry`, `saveOpenPositionContext`) and the read paths (`getAgentLog`, `getAgentLogPrioritized`, `getOpenPositionContexts`) already pass the entire `indicators` JSONB blob through untouched, so `requestedQty` rides along automatically once it exists on `TechnicalIndicators` — the same mechanism that already carries `mrRiskFactors` through with zero `db.ts` changes.
- Adding `requestedQty` as a new top-level field on `AgentDecision`, `AgentLogEntry`, or `OpenPositionContext` directly — would require either a new DB column (forbidden, C-04) or an unsafe-cast workaround; nesting it inside `TechnicalIndicators` avoids both and is the CHANGE's own explicitly stated preference.
- Persisting `requestedQty` for any symbol that never reaches the sizing computation (FR-05).
- Any change to the position-sizing formula, order-submission logic, or BUY/HOLD/REJECT decisions.
- Adding a new dedicated test file or modifying `src/lib/__tests__/ioc-fill-verification.test.ts` — that file already replicates the IOC fill/partial-fill/zero-fill logic inline (`evalPartialFillLabel`, `evalZeroFillGuard`, `resolveIocFinalState` itself), none of which this CHANGE touches (see C-03/DO NOT — `resolveIocFinalState` and the fill-comparison logic are unmodified). It must continue passing unmodified as a regression check; the CHANGE's own verification list does not request new test coverage, only `npx tsc --noEmit` and a full-suite regression run.
