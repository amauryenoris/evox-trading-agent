# Requirements — alpaca-204-empty-body

## Functional Requirements

FR-01: The system shall return `undefined` from `alpacaFetch<T>()` when the underlying HTTP response has status code 204.
FR-02: The system shall parse and return the JSON response body from `alpacaFetch<T>()` when the underlying HTTP response is successful (`res.ok`) and its status code is not 204.
FR-03: The system shall throw an `Error` with the existing `Alpaca API error {status}: {body}` message format from `alpacaFetch<T>()` when the underlying HTTP response is not successful (`!res.ok`), unchanged from current behavior.
FR-04: Where `cancelOrder()` receives a 204 response from `DELETE /v2/orders/{order_id}`, the system shall resolve without throwing.

## Non-Functional Requirements

NFR-01: The fix shall be scoped to a single function (`alpacaFetch()`) in `src/lib/alpaca.ts` with no change to any other function's behavior or return type.
NFR-02: The fix shall not alter the JSON-parsing code path or return value for any of the 17 existing call sites that receive a non-204 response.
NFR-03: `npx tsc --noEmit` and `npm run build` shall pass after the change with no new type errors.
NFR-04: All existing tests shall pass unmodified.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) — `alpaca.ts` is not in the Protected Zone, so no additional confirmation is required for this file.
C-02: The change must not add a call site for `cancelOrder()` anywhere — wiring `cancelOrder()` into a caller is out of scope (tracked separately as "CHANGE 3").
C-03: The change must not modify `cancelOrder()`, `submitStopLimitOrder()`, `submitStopOrder()`, `closePosition()`, `getOrder()`, or any other function in `alpaca.ts` besides `alpacaFetch()`.
C-04: The change must not modify `claude-agent.ts`, `db.ts`, `types.ts`, `risk-manager.ts`, `indicators.ts`, or `learning.ts`.
C-05: The empty-body check must be scoped narrowly to `res.status === 204` as confirmed by Alpaca's documented behavior for `DELETE /v2/orders/{order_id}` — no broader heuristic (e.g. `Content-Length`-based) is in scope.
C-06: The existing `!res.ok` error-handling branch's message format and behavior must remain unchanged.

## Out of Scope

- Adding a call site for `cancelOrder()` (e.g. wiring it into the trailing-stop-limit replacement logic).
- A general-purpose "might be empty body" guard beyond the confirmed 204 case.
- Any change to files outside `src/lib/alpaca.ts`.
- New tests for `cancelOrder()`'s live behavior against the real Alpaca API (no live caller exists yet to exercise this path end-to-end).
