# Design — Exclude heldSymbols from the Static TRADING_WATCHLIST Fallback Path

## Architecture Decision

Single-file change to `src/lib/claude-agent.ts`'s `runAgentCycle()`. The held-symbol `Set` currently declared at ~line 1479 (`openPositionSymbols`, today used only by the main loop's skip check at ~line 1559) is **relocated** earlier in the same function — to immediately before the "Dynamic stock selection" block (~line 1151) — so the same, single `Set` instance can also filter the static `TRADING_WATCHLIST` fallback assignment (~lines 1178-1182). No second `Set` is constructed anywhere.

## Correction to the CHANGE prompt's stated context

The CHANGE 3 prompt's context states the held-symbol set is "already used at line ~1559" as if it exists before the fallback block runs. Verified directly against the current file: `openPositionSymbols` is declared at line 1479, which runs **after** the fallback block (1151-1182), not before it. The raw `positions: AlpacaPosition[]` array (from which the Set is derived) *is* in scope earlier — it's fetched once at the top of `runAgentCycle()` (line 1098) and is already passed into `selectStocksForAnalysis()` at line 1156 — but the derived `Set` itself does not exist yet at line 1178.

This does not change the instruction's intent (reuse one set, don't duplicate the computation) — it changes the mechanics of how that's achieved. Satisfying "reuse the existing set, don't build a second one" literally requires **moving** the single declaration earlier, not merely referencing something that's already there. This is analyzed here rather than treated as a blocker, per the same "context is authoritative for intent, verify literal claims before editing" practice applied throughout this diagnostic's prior changes.

## Data Flow

1. `positions` (`AlpacaPosition[]`) is fetched once at the top of `runAgentCycle()` (line 1098) and stays in scope for the rest of the function — unchanged.
2. **This change**: `const openPositionSymbols = new Set(positions.map((p) => p.symbol))` moves from its current location (line 1479) to immediately before the "// 2. Dynamic stock selection" comment (~line 1151) — before both the dynamic path call (`selectStocksForAnalysis()`, line 1156 — unaffected; it computes its own separate internal `heldSymbols` from the same `positions` parameter, untouched by this change) and the fallback block.
3. The fallback block's existing chain (`.split(',').map((s) => s.trim()).filter(Boolean)`, ~lines 1178-1181) gains one more step: `.filter((s) => !openPositionSymbols.has(s))`.
4. The main loop's skip check (~line 1559, `if (openPositionSymbols.has(symbol))`) references the same, now-hoisted `Set` — its own declaration line is deleted at the old location, not duplicated.
5. Everything downstream of the fallback block — indicator pre-computation (~1225-1236), `newsIntelligenceLayer(watchlist)` (~1242), `updateWatchlist()`/`checkAutoEntry()` (~1249-1257), the auto-entry injection block (~1272-1273), and the main BUY-evaluation loop (~1553 onward) — is logically unchanged; it already tolerates a `watchlist` without held symbols, since the dynamic path has produced exactly that shape since the prior change to `stock-selector.ts`.
6. `enforceStopLosses()` / `enforceExitRules()` (~line 1217, elsewhere) are unaffected either way — they operate on `positions` directly, never on `watchlist`, consistent with the project's existing invariant that exits are deterministic and independent of the watchlist/selection layer.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Hoist the existing `openPositionSymbols` declaration earlier; both sites reference the same `Set` | Matches the instruction's literal intent ("reuse... do not build a second one"); zero duplicated computation; `Set` construction is a pure read of `positions`, which doesn't change within a cycle — reordering it is provably safe | Diff touches two locations (the old and new declaration sites) rather than a single line addition | **Chosen** |
| Build a second, separate held-symbol `Set` locally inside the fallback `catch` block, using `positions` (already in scope there) | Truly a one-line, single-location diff | Directly contradicts "do not build a second one" — two `Set` constructions computing the same membership test from the same source is exactly the duplication the instruction warns against | Rejected |
| Filter the fallback list with `positions.some((p) => p.symbol === s)` instead of a `Set` lookup | No relocation needed | O(n·m) linear scan per symbol instead of O(1) `Set` lookup, for no benefit; still a second, differently-shaped computation of the same membership test | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | `openPositionSymbols` declaration relocated from ~line 1479 to ~line 1151 (immediately before the fallback selection block). Fallback chain (~lines 1178-1181) gains one `.filter((s) => !openPositionSymbols.has(s))` step. No other lines changed. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` IS in `CLAUDE.md`'s Protected Zone.** Per project workflow rules, implementation must not begin until Amaury has given fresh, explicit, in-conversation confirmation to touch this specific file — approval of this spec document is not, by itself, that confirmation. This gate applies regardless of how small or mechanical the change is.

## Database Changes

None.

## Known Behavior Note — parity with the already-shipped dynamic-path fix (informational, not a risk)

Since the prior change to `stock-selector.ts`, the dynamic path's `watchlist` (via `selectStocksForAnalysis()`) has never contained held symbols. Every downstream consumer of `watchlist` in `runAgentCycle()` — indicator pre-caching, `newsIntelligenceLayer()`, `updateWatchlist()`/`checkAutoEntry()`, and the main BUY-evaluation loop — already operates correctly on a `watchlist` with held symbols absent, in the common (non-fallback) case. This change brings the fallback path's `watchlist` into that same, already-exercised shape rather than introducing a new, previously-untested code path. The one behavioral difference from today: on the (rare, ~once/60 days per live diagnostic data) occasions the fallback fires while positions are open, the effective watchlist may now contain fewer than 9 symbols — accepted as-is, per C-05 (no top-up/refill).

## Open Questions

- None blocking the spec's content itself. The binding open item is procedural, not architectural: per the Protected Zone Impact above, implementation is gated on Amaury's explicit confirmation to touch `claude-agent.ts`, to be obtained fresh at `/implement` time.
