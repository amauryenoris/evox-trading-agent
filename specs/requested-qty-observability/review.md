# Review Report — Persist requestedQty Alongside filledQty for Observability

**Date**: 2026-09-24
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Add `requestedQty?: number` to `TechnicalIndicators`, no other field changed | ✅ SATISFIED | `types.ts:129` — single line added; diff shows no other change to the interface. |
| FR-02 | Capture the originally-computed BUY quantity into a variable visible everywhere it must be persisted | ✅ SATISFIED | `let requestedQty: number \| undefined` hoisted to shared scope (`claude-agent.ts:2093`, alongside `orderExecuted`/`error`/`buyQueueQty`), set right after `const qty = finalShares` (`claude-agent.ts:2170-2171`). |
| FR-03 | Persist `requestedQty` in `agent_log.indicators` whenever a BUY quantity was computed, regardless of fill outcome | ✅ SATISFIED | Attached via `indicatorsWithLearning`'s conditional spread (`claude-agent.ts:2302`), which builds `entry.indicators` — reached for every symbol that computed a `qty`, independent of whether the resulting order fully filled, partially filled, or didn't fill (those outcomes only affect `decision.quantity`/`error`, not whether `entry` gets built). |
| FR-04 | Persist `requestedQty` in `open_position_contexts.indicators` for both the immediate and ranking paths | ✅ SATISFIED | `indicatorsAtBuy.requestedQty = qty` (immediate path, `claude-agent.ts:2230`) and `bestIndicatorsAtBuy.requestedQty = best.qty` (ranking path, `claude-agent.ts:2411`) — both precede their respective `saveOpenPositionContext()` calls. |
| FR-05 | Leave `requestedQty` unset for symbols that never reach sizing | ✅ SATISFIED | `requestedQty` defaults to `undefined` and is only ever assigned inside the branch reached after `calculateBuyQuantity()`/confidence/EMA_RECLAIM sizing runs — HOLD/gate-blocked/already-in-position paths never touch it, so the conditional spread `...(requestedQty !== undefined && { requestedQty })` correctly omits the field for them. |
| FR-06 | Immediate path derives `requestedQty` from `qty` | ✅ SATISFIED | `requestedQty = qty` (line 2171) and `indicatorsAtBuy.requestedQty = qty` (line 2230) — same `qty` passed to `submitLimitOrder(symbol, qty, ...)`. |
| FR-07 | Ranking path derives `requestedQty` from `best.qty` | ✅ SATISFIED | `bestIndicatorsAtBuy.requestedQty = best.qty` (line 2411) — `best.qty` is `buyQueueQty` captured at push time, identical to what's passed to `submitLimitOrder(best.symbol, best.qty, ...)` in the ranking phase. |
| FR-08 | `decision.quantity` continues to reflect `filledQty`, unchanged | ✅ SATISFIED | Confirmed via diff and targeted grep — neither `decision.quantity = filledQty` nor `best.decision.quantity = filledQty` appears in the diff. |
| FR-09 | No change to `submitLimitOrder()`/`resolveIocFinalState()`/decision logic | ✅ SATISFIED | Grepped the diff for both function names — no matches; both are untouched. |
| FR-10 | No change to `IOC_PARTIAL_FILL`/`IOC_NOT_FILLED` console.log lines | ✅ SATISFIED | Neither string appears in the diff. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | `npx tsc --noEmit` zero new errors | ✅ SATISFIED | Re-run independently — clean. |
| NFR-02 | Confined to `types.ts`/`claude-agent.ts`, no `db.ts` edit, no migration | ✅ SATISFIED | `git diff --stat -- src/lib/db.ts` — no output, independently re-confirmed. No new file under `supabase/` (`git status --porcelain` clean there). |
| NFR-03 | No new unsafe cast required for `requestedQty` | ✅ SATISFIED | All four attachment sites are either a plain field assignment on an already-widened-cast object (`indicatorsAtBuy`/`bestIndicatorsAtBuy`, cast once for other ad-hoc fields, not specifically for this one) or a conditional spread into a plain object literal (`indicatorsWithLearning`) — `requestedQty` itself never required introducing a new cast. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Confirmed via `git diff --stat` — no output. |
| src/lib/claude-agent.ts | **MODIFIED** | Listed in `design.md`'s Impact table; explicit, fresh, in-conversation confirmation from Amaury was obtained before implementation (per the `/implement` transcript's `AskUserQuestion` exchange), not inferred from the pre-checked spec checkbox. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`src/lib/types.ts` was also modified — correctly not gated, since it's "Touch freely" per `CLAUDE.md`'s File Permission Matrix. `src/lib/db.ts` — not Protected Zone and, as designed, not touched at all.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `decision.action = 'HOLD'` override (line 2044) and every per-branch override are untouched, confirmed via independent grep — none sit near this diff's four touched regions. This change never reads or writes `decision.action`/`reasoning`/Claude's response schema. |
| Supabase patterns | ✅ | No new query added. `db.ts` untouched — both write paths (`insertAgentLogEntry`, `saveOpenPositionContext`) already pass the whole `indicators` object through, and both read paths (`getAgentLog`/`getAgentLogPrioritized`/`getOpenPositionContexts`) already spread/cast the raw JSONB blob rather than enumerating fields, so `requestedQty` round-trips with zero `db.ts` risk. |
| TypeScript quality | ✅ | No `any` introduced. All four attachment points are either a direct assignment (immutability-neutral — these are already-freshly-constructed local objects, `indicatorsAtBuy`/`bestIndicatorsAtBuy`, not the shared cached `indicators` object) or an additive conditional spread producing a new object (`indicatorsWithLearning`) — consistent with the project's immutability convention and with how `mrRiskFactors` was implemented. Total diff is 5 new lines across an already-large function; no new function was introduced to check against the 50-line limit. No new magic numbers. |
| Security | ✅ | No secrets, no new injection surface, nothing sensitive in the touched lines. |

## Task Checklist

- Completed: 17/18 tasks (`specs/requested-qty-observability/tasks.md`)
- The one remaining `[ ]` is the self-referential "Run /review" line — satisfied by this review being produced.

## Additional Verification (independently re-run)

- `npx tsc --noEmit`: **0 errors** (re-verified fresh).
- `npx vitest run` (full suite): **448/448 tests passed across 48 files**, no regressions — includes `ioc-fill-verification.test.ts` passing unmodified, as predicted (it replicates `resolveIocFinalState`/`evalPartialFillLabel`/`evalZeroFillGuard` inline, none of which this diff touches).
- `git diff --stat` across all 6 remaining Protected Zone files: no output — confirms all untouched.
- `git diff --stat -- src/lib/db.ts`: no output — independently re-confirms the design's central claim that `db.ts` needs zero changes.
- `grep -n "decision.action = 'HOLD'"`: 10 matches, all pre-existing and unrelated to this diff.

## Design Fidelity Check

- The two corrections documented in `design.md` (that `qty` goes out of scope before `indicatorsWithLearning`'s construction, and that `db.ts` needs no edits at all) both held up exactly as predicted in the shipped code — the hoisted `let requestedQty` is present precisely because `qty` itself would have been unreachable otherwise, and `db.ts`'s diff is empty as forecast.
- The claim that a single edit to `indicatorsWithLearning` covers all three `decisions.push()` outcomes (immediate, ranking-winner, ranking-loser) holds: `entry` is built once per symbol before the ranking phase ever runs, so `best.entry`/`rejected.entry` inherit `requestedQty` automatically — no separate agent-log-side edit was needed or added in the ranking-resolution block, consistent with the design's reasoning.

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- None

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. All 10 functional requirements and 3 non-functional requirements satisfied, Protected Zone modification was explicit and authorized, analyst purity is intact, `db.ts` confirmed untouched exactly as designed, and the full test suite (448 tests) passes with no regressions. This closes the observability gap identified across the prior multi-session sizing/partial-fill diagnostic — `requestedQty` vs. `filledQty`/`decision.quantity` is now directly comparable in a single `agent_log`/`open_position_contexts` row. Ready to commit.
