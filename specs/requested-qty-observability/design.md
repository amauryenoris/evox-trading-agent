# Design — Persist requestedQty Alongside filledQty for Observability

## Architecture Decision

Single new optional field, `requestedQty?: number`, added to `TechnicalIndicators` (`src/lib/types.ts`) — the same interface `mrRiskFactors` already lives on. `runAgentCycle()` (`src/lib/claude-agent.ts`) captures the originally-computed BUY quantity into a variable at shared function scope (alongside the existing `orderExecuted`/`orderId`/`error`/`queuedForRanking`/`buyQueueQty` siblings), then attaches it at every point where an `indicators`-shaped object is built for persistence — reusing the exact conditional-spread / direct-assignment patterns already present at each site. No new file, no schema change, no `db.ts` edit (see below).

## Corrections to the CHANGE prompt's assumed scope

**1. `qty` goes out of scope before `indicatorsWithLearning` is built — a hoisted variable is required, not optional.** The CHANGE prompt's phrasing ("Capture the requested quantity... into a named constant BEFORE the order is submitted, if not already cleanly available as one") treats this as a minor convenience. Verified directly: `const qty = finalShares` (currently line 2169) is declared deep inside nested `if (riskCheck.allowed) { ... if (qty > 0) { ... } }` blocks that **close** (multiple `}` at lines 2274-2283) before `indicatorsWithLearning`'s construction (line 2290) — a shallower, shared scope reached by every symbol regardless of outcome. `qty` is therefore **unreachable** at line 2290 under standard JS/TS block scoping; this is not a style choice, it's a compile error waiting to happen if attempted naively. The fix (hoisting a `let requestedQty` to the same outer scope as `orderExecuted`/`error`/etc., set at the point `qty` is computed) is required, not optional.

**2. `src/lib/db.ts` needs zero changes — contrary to the CHANGE prompt's SCOPE item 4, which anticipated possibly needing to "STOP and report" if a new column were required.** Verified both directions:
- **Write**: `insertAgentLogEntry()` (`db.ts:34-51`) does `indicators: entry.indicators` — the entire object, not a field-by-field mapping. `saveOpenPositionContext()` (`db.ts:161-179`) does `indicators: ctx.indicators` — same. Whatever extra fields `entry.indicators`/`ctx.indicators` carries (already including `mrRiskFactors` today) pass straight into the JSONB column with no enumeration anywhere in `db.ts`.
- **Read**: `getAgentLog()` (`db.ts:53-99`) and `getAgentLogPrioritized()` (`db.ts:101-...`) both build their `indicators` return value as `{ ...raw, <explicitly-defaulted known fields> }` — the `...raw` spread means any field not explicitly listed (like a new `requestedQty`) passes through unchanged. `getOpenPositionContexts()`'s `mapRowToOpenPositionContext()` (`db.ts:181-197`) does `indicators: row.indicators as OpenPositionContext['indicators']` — a direct cast of the whole blob, same effect.

**Conclusion: `db.ts` requires no edit at all for this CHANGE** — the exact same zero-`db.ts`-changes outcome already established for `mrRiskFactors`. This is smaller in footprint than the CHANGE prompt anticipated (`db.ts` was listed among the files expected to change), not larger — a rare case where research simplifies rather than expands scope.

**3. SCOPE item 1's "AgentLogEntry vs. AgentDecision... do not assume" resolves to neither — it's `TechnicalIndicators`.** Both `AgentLogEntry.indicators` and `OpenPositionContext.indicators` are typed as `TechnicalIndicators` (`types.ts:169`, `types.ts:189`). Adding `requestedQty` there once satisfies both of SCOPE item 1's sub-bullets (the "AgentLogEntry/decision level" field and the "OpenPositionContext" field) with a **single** type change — not two separate top-level field additions as the prompt's literal phrasing suggested. This also directly satisfies the CHANGE's own explicit, stronger preference in SCOPE items 4-5 ("Prefer attaching requestedQty inside the existing `indicators` JSONB... same pattern as mrRiskFactors") over its own SCOPE item 1's initial, vaguer phrasing ("Add `requestedQty?: number` to OpenPositionContext (alongside its existing `quantity` field...)") — resolved here in favor of the more specific JSONB-only instruction.

## Data Flow

1. `let requestedQty: number | undefined` declared alongside the existing sibling `let`s (currently `claude-agent.ts:2088-2092`: `orderExecuted`, `orderId`, `error`, `queuedForRanking`, `buyQueueQty`).
2. Immediately after `const qty = finalShares` (currently line 2169), set `requestedQty = qty` — covers both the ranking-queue branch (`buyQueueQty = qty`) and the immediate-execution branch (`submitLimitOrder(symbol, qty, ...)`), since both are reached from this same single assignment point.
3. Immediate-execution buy-context object (`indicatorsAtBuy`, currently lines 2215-2227, used only for `saveOpenPositionContext()` at line 2252): add `indicatorsAtBuy.requestedQty = qty` alongside the existing `indicatorsAtBuy.spx_price = ...` etc. assignments — `qty` is still directly in scope at this point (same nested block), so no need to read back the hoisted variable here.
4. Agent-log entry object (`indicatorsWithLearning`, currently lines 2290-2298, feeds `entry.indicators` at line 2306): add one more conditional-spread line, `...(requestedQty !== undefined && { requestedQty }),` — matching the existing `learning_note`/`near_miss_score`/`mrRiskFactors` pattern exactly. Because `entry` is built once per symbol **before** the ranking phase ever runs, this single edit covers `decisions.push(entry)` (immediate path, line 2320), `decisions.push(best.entry)` (ranking winner, lines 2361/2468), and `decisions.push(rejected.entry)` (ranking losers) — no separate edit needed in the ranking-resolution block for the agent-log side.
5. Ranking-phase buy-context object (`bestIndicatorsAtBuy`, currently lines 2396-2450, used only for `saveOpenPositionContext()` at line 2452): add `bestIndicatorsAtBuy.requestedQty = best.qty` alongside the existing `bestIndicatorsAtBuy.spx_price = ...` etc. assignments — `best.qty` is the same value captured at `buyQueue.push()` time (`qty: buyQueueQty`, line 2318), i.e. the same value already used for `submitLimitOrder(best.symbol, best.qty, ...)` at line 2365.
6. `insertAgentLogEntry()`/`saveOpenPositionContext()` persist `entry.indicators`/`ctx.indicators` (now including `requestedQty` where set) with zero code changes (see Correction 2).
7. `getAgentLog()`/`getAgentLogPrioritized()`/`getOpenPositionContexts()` surface `requestedQty` on read with zero code changes (see Correction 2).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Hoist a new `let requestedQty` to the existing sibling-variable scope | Matches the established pattern exactly (`orderExecuted`, `error`, etc. already do this); minimal, safe, provably correct given the scoping analysis above | One more `let` in an already-large function | **Chosen** |
| Re-derive the originally-requested quantity some other way downstream (e.g. from `finalShares` recomputed) | Avoids adding a variable | There is no other source for the original value once `qty` goes out of scope — recomputing risks drifting from what was actually submitted, and is exactly the kind of fragility that caused this to need a multi-session diagnostic in the first place | Rejected |
| Add `requestedQty` as a new top-level field on `AgentLogEntry`/`OpenPositionContext` with a real DB column | Arguably more "explicit" schema-wise | Requires a migration (forbidden, C-04); unnecessary since JSONB already round-trips extra fields for free | Rejected |
| Explicitly touch `db.ts` to whitelist `requestedQty` in the insert/select mapping | Feels more "complete" | Unnecessary — both directions already pass the full blob through untouched; editing `db.ts` for a no-op change adds risk (could accidentally narrow the existing transparent-passthrough behavior) for zero benefit | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | `TechnicalIndicators` gains `requestedQty?: number`. No other field changed. |
| `src/lib/claude-agent.ts` | MODIFY | One new `let` declaration, one assignment right after `qty` is computed, and three attachment-site edits (`indicatorsAtBuy`, `indicatorsWithLearning`, `bestIndicatorsAtBuy`). No change to `submitLimitOrder`, `resolveIocFinalState`, `decision.quantity`'s existing assignment, or any console.log. |
| `src/lib/db.ts` | VERIFIED UNCHANGED | Confirmed both write paths (`insertAgentLogEntry`, `saveOpenPositionContext`) and read paths (`getAgentLog`, `getAgentLogPrioritized`, `getOpenPositionContexts`) already pass the full `indicators` JSONB through untouched — no edit needed, no migration. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` IS in `CLAUDE.md`'s Protected Zone.** Implementation must not begin until Amaury gives fresh, explicit, in-conversation confirmation to touch this file — this gate applies regardless of how small or mechanical the change is. `src/lib/types.ts` is separately listed as "Touch freely" and needs no such confirmation. `src/lib/db.ts` is not Protected Zone and, per the above, will not be modified at all.

## Database Changes

None. Confirmed no migration, new table, or new column is needed — `requestedQty` rides in the already-persisted `indicators` JSONB field on both `agent_log` and `open_position_contexts`, exactly mirroring the `mrRiskFactors` precedent.

## Open Questions

None blocking. One minor implementation-style note, resolved here rather than left open: at the immediate-execution buy-context site (`indicatorsAtBuy`), `qty` itself is still directly in scope, so the implementation uses `qty` there rather than reading back the hoisted `requestedQty` variable — functionally identical (the hoisted variable is set from the same `qty` one line earlier), chosen only for directness at that specific call site.
