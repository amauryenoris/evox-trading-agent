# Design — Add submitStopLimitOrder() and cancelOrder() to alpaca.ts

## Architecture Decision

This lives entirely in `alpaca.ts`'s existing family of thin REST wrappers around `alpacaFetch<T>()`. Both new functions are pure additions, each mirroring an existing sibling function's exact shape (`submitStopLimitOrder()` mirrors `submitStopOrder()`; `cancelOrder()` mirrors the DELETE-method pattern of `closePosition()`). Nothing calls them yet — they exist purely as primitives CHANGE 3 (the `claude-agent.ts` decision layer) will wire in later, kept isolated so this layer merges independently.

## Data Flow

```
submitStopLimitOrder(symbol, qty, stopPrice, limitPrice)
  → POST /v2/orders { ..., type: 'stop_limit', stop_price, limit_price }
  → returns AlpacaOrder (existing type, no change needed — stop_price/limit_price already present)

cancelOrder(orderId)
  → DELETE /v2/orders/{orderId}
  → alpacaFetch<void>(...) → res.json() called unconditionally on any res.ok response
  → RISK: if Alpaca returns an empty body (204) for this specific endpoint, res.json()
    throws even though the cancel succeeded — see Open Questions
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Mirror `submitStopOrder()` exactly, add `limit_price` (this spec) | Zero new conventions; consistent with every other order-submission function in the file | None | **Chosen** |
| Introduce a shared `submitOrder({...})` generic that both `submitStopOrder` and `submitStopLimitOrder` delegate to | Less duplication | Requires touching `submitStopOrder()`, forbidden by scope (FR-05); real refactor, not a narrow addition | Rejected — out of scope for an isolated, independently-mergeable layer |
| `cancelOrder()` calls `alpacaFetch<void>(...)` exactly as instructed (this spec) | Matches every other function's use of the shared helper; simplest; no new pattern | Carries the empty-body risk described below | **Chosen, with the risk flagged** — see Open Questions |
| `cancelOrder()` uses a raw `fetch()` call instead of `alpacaFetch()`, handling the empty body itself | Sidesteps the risk entirely | Introduces a second, inconsistent request pattern in a file where every other call goes through `alpacaFetch()`; touches shared conventions this spec was scoped to leave alone | Rejected — the originating prompt explicitly asks to match existing patterns, not invent a new one, and there's no existing empty-body-safe pattern to copy instead |
| Modify `alpacaFetch()` to special-case empty/204 responses | Would fix the risk at the root, benefiting `cancelOrder()` and any future empty-body caller | `alpacaFetch()` is shared by every function in the file; modifying it is a bigger, riskier change than this spec's scope, and no other current caller has this problem | Rejected for this spec — flagged as a candidate follow-up, not bundled in here |

## Impact on Existing Files

### Required changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/alpaca.ts` | MODIFY | Add `submitStopLimitOrder()` after `submitStopOrder()` (~after line 253); add `cancelOrder()` after `closePosition()` (~after line 169). No other line touched. |

### Not touched

| File | Reason |
|------|--------|
| `src/lib/claude-agent.ts` | Forbidden by scope (C-02) — decision layer, CHANGE 3 |
| `src/lib/db.ts`, `types.ts` | Forbidden by scope (C-02); confirmed no type change needed (STEP 0) |
| `src/lib/risk-manager.ts`, `indicators.ts`, `learning.ts` | Forbidden by scope (C-02), not involved |

## Protected Zone Impact

None — `alpaca.ts` is not in `CLAUDE.md`'s Protected Zone (confirmed in requirements.md STEP 0). No special authorization gate applies to this spec.

## Database Changes

None.

## Open Questions

- **`cancelOrder()`'s use of `alpacaFetch<void>(...)` may throw on a genuinely empty (204) response body, and this cannot be confirmed or ruled out from the codebase alone.** `alpacaFetch<T>()` always calls `res.json()` after an `res.ok` check, with no branch for an empty body anywhere in this file. The file's only other DELETE call, `closePosition()`, doesn't actually prove this pattern is safe for an empty body — it works because Alpaca's *close-position* endpoint happens to return a real order JSON object, not because `alpacaFetch()` handles empty bodies. `cancelOrder()` targets a different endpoint (`DELETE /v2/orders/{order_id}`, single-order cancel) that this codebase has never called before, and whether *that* endpoint returns an empty body isn't something this repo's code can confirm — it would need to be checked against Alpaca's own API documentation or a live paper-trading test call, neither of which is available as a codebase-only diagnostic.
  - **This is currently inert**: no call site exists in this spec (FR-04), so the risk has zero effect on production today. It only matters once CHANGE 3 actually invokes `cancelOrder()`.
  - **Two ways to resolve, need Amaury's call**: (a) implement exactly as the originating prompt specifies (`alpacaFetch<void>`) and carry this as a known, documented risk that must be verified — e.g., via a real paper-account test call — before CHANGE 3 wires in a live call site; or (b) treat this spec as still fully implementable as literally described (since it's dead code either way) but require the verification step to happen explicitly as a CHANGE 3 prerequisite rather than being silently assumed away. **Recommendation: (a)/(b) collapse to the same practical answer** — implement literally as specified now (matches the prompt exactly, keeps this layer's diff minimal and reviewable), and treat "verify the actual response behavior of `DELETE /v2/orders/{order_id}` before CHANGE 3 calls it" as a carried-forward action item, not a blocker for merging this isolated, currently-unused addition.
