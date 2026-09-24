# Tasks — Persist requestedQty Alongside filledQty for Observability

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — ⚠️ REQUIRED: `src/lib/claude-agent.ts` is Protected Zone. Obtain fresh, explicit, in-conversation confirmation from Amaury before starting Phase 2 — separate from, and not satisfied by, spec approval alone. `src/lib/types.ts` needs no such confirmation.
- [x] Database migrations drafted — N/A, none needed (rides in existing `indicators` JSONB on both `agent_log` and `open_position_contexts`; `db.ts` requires no code change either, per `design.md`).

## Implementation Checklist

### Phase 1 — types.ts

- [x] T-01: Add `requestedQty?: number` to the `TechnicalIndicators` interface (`src/lib/types.ts`, currently lines 90-128). Do not change any other field, ordering, or comment in the interface.

### Phase 2 — claude-agent.ts

- [x] T-02: Re-verify current exact line numbers for the `let orderExecuted = false` block (~2088-2092), `const qty = finalShares` (~2169), `indicatorsAtBuy` (~2215-2227), `indicatorsWithLearning` (~2290-2298), and `bestIndicatorsAtBuy` (~2396-2450) before editing — they may have shifted since this spec was written.
- [x] T-03: Add `let requestedQty: number | undefined` immediately after the existing `let buyQueueQty = 0` (~line 2092), matching that declaration style.
- [x] T-04: Immediately after `const qty = finalShares` (~line 2169), add `requestedQty = qty`.
- [x] T-05: In the immediate-execution buy-context object (`indicatorsAtBuy`, ~lines 2215-2227), add `indicatorsAtBuy.requestedQty = qty` alongside the existing `indicatorsAtBuy.spx_price = ...`/`indicatorsAtBuy.effectiveThreshold = ...` etc. assignments, before the `saveOpenPositionContext()` call (~line 2252).
- [x] T-06: In `indicatorsWithLearning` (~lines 2290-2298), add one more conditional-spread line matching the existing pattern: `...(requestedQty !== undefined && { requestedQty }),`. Do not change `effectiveThreshold`, `newsAdjustment`, or any of the other conditional spreads (including `mrRiskFactors`) already there.
- [x] T-07: In the ranking-phase buy-context object (`bestIndicatorsAtBuy`, ~lines 2396-2450), add `bestIndicatorsAtBuy.requestedQty = best.qty` alongside the existing `bestIndicatorsAtBuy.spx_price = ...` etc. assignments, before the `saveOpenPositionContext()` call (~line 2452).
- [x] T-08: Confirm `submitLimitOrder()`, `resolveIocFinalState()`, the `IOC_PARTIAL_FILL`/`IOC_NOT_FILLED` console.log lines, and every existing `decision.quantity = filledQty`/`best.decision.quantity = filledQty` assignment are byte-for-byte unchanged. Confirmed via `git diff` — none of these appear in the diff at all.

### Phase 3 — db.ts (verification only, no edits expected)

- [x] T-09: Confirmed `insertAgentLogEntry()` and `saveOpenPositionContext()` still pass `entry.indicators`/`ctx.indicators` through as a whole object — verified via `git diff --stat -- src/lib/db.ts` returning no output (zero changes needed, file untouched).
- [x] T-10: Confirmed `getAgentLog()`, `getAgentLogPrioritized()`, and `getOpenPositionContexts()`'s `mapRowToOpenPositionContext()` still spread/cast the whole raw `indicators` blob — same zero-diff confirmation as T-09.

## Post-Implementation

- [x] T-11: Run `npx tsc --noEmit` — must pass with zero new errors, and confirm no `as unknown as TechnicalIndicators` cast was needed anywhere `requestedQty` was attached (NFR-03). Confirmed clean; `requestedQty` is a plain `number` field assignment/spread everywhere, no new cast anywhere.
- [x] T-12: Diff confirmed confined to exactly: `types.ts` (+1 field), `claude-agent.ts` (hoisted `let`, 1 assignment, 3 attachment sites), `db.ts` untouched (zero diff).
- [x] T-13: Sample JSONB shapes shown in completion report (see below).
- [x] T-14: Confirmed no new Supabase migration file was created — `git status --porcelain` shows no changes under `supabase/`.
- [x] T-15: Full test suite run — 48 files / 448 tests passed, no regressions. `ioc-fill-verification.test.ts` passed unmodified as expected.
- [ ] Run `/review requested-qty-observability` to verify implementation matches spec.
- [x] Confirm Protected Zone files unchanged except the explicitly-confirmed `claude-agent.ts` modification.

## Estimated Complexity

**Low** — one hoisted variable, one assignment, and three small attachment-site edits, all following patterns already established by `mrRiskFactors` and the existing `would_execute`/`effectiveThreshold`/`spx_price` ad-hoc fields. The only non-trivial part was the scoping analysis in `design.md` (confirming `qty` is genuinely unreachable at `indicatorsWithLearning`'s construction point, and that `db.ts` needs no changes at all) — both already resolved during spec-writing, not left for implementation to discover.
