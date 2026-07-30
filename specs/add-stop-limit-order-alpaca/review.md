# Review Report — Add submitStopLimitOrder() and cancelOrder() to alpaca.ts

**Date**: 2026-07-30
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Add `submitStopLimitOrder(symbol, qty, stopPrice, limitPrice): Promise<AlpacaOrder>` immediately after `submitStopOrder()` | ✅ SATISFIED | Confirmed via diff — placed directly after `submitStopOrder()`, same signature shape. |
| FR-02 | Submit `type: 'stop_limit'`, `time_in_force: 'gtc'`, `side: 'sell'`, `stop_price`/`limit_price` both `.toFixed(2)`, `qty: String(qty)` | ✅ SATISFIED | All fields present, exact formatting conventions matched to `submitStopOrder()`'s adjacent fields. |
| FR-03 | Add `cancelOrder(orderId: string): Promise<void>` immediately after `closePosition()`, `DELETE /v2/orders/{orderId}` | ✅ SATISFIED | Confirmed via diff — placed directly after `closePosition()`, correct URL and method. |
| FR-04 | No call site for either new function | ✅ SATISFIED | Diff contains only the two function definitions — no other file references either name (also independently confirmed by the pre-implementation search-first check for name collisions). |
| FR-05 | `submitStopOrder()`, `submitStopWithRetry()`, `closePosition()`, `getOrder()` byte-for-byte unchanged | ✅ SATISFIED | Diff shows zero modification to any of these — both new functions were inserted as pure additions immediately adjacent to their respective siblings. |
| FR-06 | No change to `AlpacaOrder`'s type definition | ✅ SATISFIED | `git diff` for `types.ts` produced no output at all — confirms both the code and the earlier research finding that `stop_price`/`limit_price` already exist as nullable strings on the type. |
| NFR-01 | `tsc --noEmit` — zero errors | ✅ SATISFIED | Confirmed clean. |
| NFR-02 | `npm run build` — zero errors | ✅ SATISFIED | Confirmed clean, no unused-export warnings (verified rather than assumed, per T-07). |
| NFR-03 | All existing tests pass unmodified | ✅ SATISFIED | Full suite: 29 files, 297/297 tests passed — identical count to the pre-change baseline from the prior spec's review. |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | `alpaca.ts` not Protected Zone, no special gate | ✅ SATISFIED | Confirmed against `CLAUDE.md` in the spec's own STEP 0 research; re-confirmed here — no Protected Zone file appears in the diff. |
| C-02 | No changes to `claude-agent.ts`, `db.ts`, `types.ts`, `risk-manager.ts`, `indicators.ts`, `learning.ts` | ✅ SATISFIED | `git status` confirms none of these appear. |
| C-03 | No retry logic added | ✅ SATISFIED | Neither function includes any retry/backoff — both are single-shot `alpacaFetch()` calls, matching scope. |
| C-04 | Reuse `alpacaFetch()`, `baseUrl()`, existing formatting conventions exactly | ✅ SATISFIED | Both functions use the identical helper and formatting patterns as their sibling functions — no new convention introduced. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |
| `.env` / `.env.local` | UNTOUCHED | — |
| `vercel.json` | UNTOUCHED | — |
| DB migration | NONE ADDED | — |
| `src/lib/alpaca.ts` | MODIFIED | Not in the formal Protected Zone list; listed as the sole required change in design.md; two additive function blocks only. |

No unauthorized Protected Zone changes found. This is the first spec in the Bug 1 series that required no elevated authorization at all — matches the originating prompt's own framing.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` untouched; nothing here relates to Claude's decision schema. |
| Supabase patterns | ➖ N/A | No Supabase involvement in this change. |
| Alpaca patterns | ✅ SATISFIED, with one carried-forward risk | Both functions go through the shared `alpacaFetch()` wrapper exactly like every other function in the file — no ad-hoc `fetch()` call introduced. `.claude/skills/alpaca-patterns.md`'s "IOC orders only — no market orders" guidance concerns *entry* order submission (a different code path, untouched here); it doesn't apply to stop/stop-limit protective orders, which the file's existing `submitStopOrder()` already establishes as `gtc`, not `ioc` — `submitStopLimitOrder()` correctly follows that established precedent rather than the IOC one. The one real open item is the previously-flagged, now-formally-carried-forward risk: `cancelOrder()`'s `alpacaFetch<void>(...)` calls `res.json()` unconditionally (per `alpacaFetch`'s implementation, itself untouched), and this codebase has no prior call to Alpaca's single-order-cancel endpoint to confirm whether it returns an empty body. This is correctly scoped as inert today (FR-04: no call site) and explicitly logged as a CHANGE 3 prerequisite in both `design.md` and the completion report — not a defect in this diff, but worth restating here so it isn't lost between specs. |
| TypeScript quality | ✅ SATISFIED | No `any`. No mutation — both are pure request-builders returning fresh values. Both functions are well under 50 lines (17 and 5 lines respectively). `alpaca.ts` grew from 373 to 399 lines — still comfortably under the 800-line guideline. No magic numbers introduced (`.toFixed(2)` mirrors the existing convention, not a new arbitrary constant). |
| Security | ✅ SATISFIED | No secrets, no injection surface — both requests go through the same `alpacaFetch()`/`getHeaders()` machinery already used everywhere else in the file, with values passed as JSON body fields (not interpolated into a query string in a way that risks injection) or as a template-literal path segment (`orderId` in the URL), matching the exact pattern `getOrder()` already uses safely. |

## Task Checklist

- Completed: 10/10 implementation tasks (T-01–T-10), 2/2 pre-implementation checks, 2/3 post-implementation checks (the `/review` line is satisfied by this report).

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None — the `cancelOrder()` empty-body-response risk was already correctly triaged as non-blocking by the spec itself (dead code, no call site) and is properly tracked as a CHANGE 3 prerequisite rather than something this diff needs to resolve. Restating it under LOW for visibility, not because it's unaddressed.

### LOW (optional)
- `cancelOrder()`'s reliance on `alpacaFetch<void>()` calling `res.json()` unconditionally remains unverified against Alpaca's actual behavior for `DELETE /v2/orders/{order_id}`. Zero impact today; flagged again here purely so it surfaces in this review's record, not just in `design.md` and the completion report, in case the two specs get looked at independently later. Recommended action before CHANGE 3: a single live paper-account test call to confirm response shape, or a check against Alpaca's API reference.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
