# Requirements — Add submitStopLimitOrder() and cancelOrder() to alpaca.ts

## STEP 0 — Pre-implementation findings

Verified live against `src/lib/alpaca.ts`, `src/lib/types.ts`, `CLAUDE.md`, and the test suite in this session.

### `alpaca.ts` current state (confirmed, 373 lines, unchanged since the prior diagnostic)

`submitStopOrder()`, `alpaca.ts:237-253` (verbatim):
```ts
export async function submitStopOrder(
  symbol: string,
  qty: number,
  stopPrice: number
): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders`, {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      qty: String(qty),
      side: 'sell',
      type: 'stop',
      time_in_force: 'gtc',
      stop_price: stopPrice.toFixed(2),
    }),
  })
}
```

`closePosition()`, `alpaca.ts:165-169` (verbatim):
```ts
export async function closePosition(symbol: string): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/positions/${symbol}?cancel_orders=true`, {
    method: 'DELETE',
  })
}
```

`getOrder()`, `alpaca.ts:55-57` (verbatim, unaffected):
```ts
export async function getOrder(orderId: string): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders/${orderId}`)
}
```

`alpacaFetch<T>()`, `alpaca.ts:30-37` (verbatim — the shared helper both new functions will call):
```ts
async function alpacaFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, headers: { ...getHeaders(), ...(options?.headers ?? {}) } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Alpaca API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}
```

### `AlpacaOrder` type — confirmed no change needed

`types.ts:43-63` already includes `stop_price: string | null` and `limit_price: string | null` on `AlpacaOrder`. A `stop_limit` order's response fits this existing shape without modification — the CHANGE prompt's own conditional ("do not change `AlpacaOrder` unless the response shape genuinely differs... breaks the existing type") does not trigger.

### `alpaca.ts` in `CLAUDE.md` — confirmed not Protected Zone

`CLAUDE.md` lists `alpaca.ts` only in the descriptive stack table (line 86: "Alpaca API client — orders, positions, bars, quotes, news"), not in the File Permission Matrix's "Confirm with Amaury before touching" list. Matches the originating prompt's own framing — no special authorization required, unlike `claude-agent.ts`/`db.ts` in this same Bug 1 series.

### No naming collision, no existing test coverage

Searched the full `src/` tree for `submitStopLimitOrder` and `cancelOrder` — no matches. Neither name is used anywhere yet.

### Open finding: no existing precedent in this file for a genuinely empty-body DELETE response

`closePosition()` (the file's only other DELETE call) returns `Promise<AlpacaOrder>` and works because Alpaca's *close-position* endpoint (`DELETE /v2/positions/{symbol}`) returns the resulting order as a JSON body. `alpacaFetch<T>()` unconditionally calls `res.json()` on any `res.ok` response — there is no branch anywhere in this file that tolerates or expects an empty response body. Alpaca's *single-order-cancel* endpoint (`DELETE /v2/orders/{order_id}`) — the one `cancelOrder()` is meant to call — is a different endpoint than `closePosition()` uses, and this codebase has never called it before. Per this session's established practice (do not assume Alpaca API behavior from general knowledge; only state what's confirmable from this codebase), **whether that endpoint returns an empty body cannot be confirmed from the code alone**, and if it does return an empty body (as cancel-order endpoints commonly do), `res.json()` on an empty response will throw (`SyntaxError: Unexpected end of JSON input`) even though the cancellation itself succeeded at the HTTP level. See design.md → Open Questions.

---

## Functional Requirements

FR-01: The system shall add an exported `submitStopLimitOrder(symbol: string, qty: number, stopPrice: number, limitPrice: number): Promise<AlpacaOrder>` function to `alpaca.ts`, immediately after `submitStopOrder()`.

FR-02: The system shall submit `type: 'stop_limit'`, `time_in_force: 'gtc'`, `side: 'sell'`, `stop_price: stopPrice.toFixed(2)`, and `limit_price: limitPrice.toFixed(2)` in the request body of `submitStopLimitOrder()`, using the same `qty: String(qty)` formatting convention as `submitStopOrder()`.

FR-03: The system shall add an exported `cancelOrder(orderId: string): Promise<void>` function to `alpaca.ts`, immediately after `closePosition()`, issuing `DELETE /v2/orders/{orderId}`.

FR-04: The system shall not add any call site for `submitStopLimitOrder()` or `cancelOrder()` in this change — both remain unused/unreferenced.

FR-05: The system shall leave `submitStopOrder()`, `submitStopWithRetry()`, `closePosition()`, and `getOrder()` byte-for-byte unchanged.

FR-06: The system shall not modify `AlpacaOrder`'s type definition (confirmed unnecessary per STEP 0).

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass with zero errors after the change.

NFR-03: All existing tests shall pass unmodified.

## Constraints

C-01: `alpaca.ts` is not in `CLAUDE.md`'s Protected Zone — no special authorization gate applies (confirmed in STEP 0).

C-02: No changes to `claude-agent.ts`, `db.ts`, `types.ts`, `risk-manager.ts`, `indicators.ts`, or `learning.ts` in this spec.

C-03: No retry logic in either new function — retry (if needed) is explicitly deferred to CHANGE 3.

C-04: `alpacaFetch()`, `baseUrl()`, and existing formatting conventions (`String()`, `.toFixed(2)`) shall be reused exactly as already established — no new formatting or request-building pattern introduced.

## Out of Scope

- Calling either new function from anywhere (CHANGE 3).
- Resolving the empty-body-DELETE-response risk identified in STEP 0 — flagged in design.md as an Open Question requiring a decision before implementation proceeds on `cancelOrder()` specifically, but not something this spec redesigns `alpacaFetch()` to fix.
- Any change to `submitStopWithRetry()` or a hypothetical retry wrapper for the new functions.
- Confirming Alpaca's actual documented behavior for `DELETE /v2/orders/{order_id}` against Alpaca's own API docs — out of reach of a codebase-only spec; noted as something to verify before CHANGE 3 actually calls `cancelOrder()` in anger.
