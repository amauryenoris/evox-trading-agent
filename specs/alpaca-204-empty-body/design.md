# Design — alpaca-204-empty-body

## Architecture Decision

This is a single-function, single-file fix inside `src/lib/alpaca.ts`'s shared fetch wrapper, `alpacaFetch<T>()` (currently lines 30-37). `alpacaFetch()` is the sole HTTP transport used by all 18 exported functions in this file, so the fix belongs at the transport layer rather than at any individual caller — that is the layer that owns response-body parsing, and it's the only place that can guarantee the fix applies uniformly to any future 204-returning endpoint without each caller having to remember to special-case it.

## Data Flow

1. A caller (currently only `cancelOrder()`, all other 17 callers unaffected) invokes `alpacaFetch<T>(url, options)`.
2. `alpacaFetch()` performs `fetch()` and checks `res.ok`.
3. If `!res.ok` → throws `Error` (unchanged).
4. **New step:** if `res.ok` and `res.status === 204` → returns `undefined as T` immediately, without calling `res.json()`.
5. Otherwise (existing path) → returns `res.json() as Promise<T>`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `res.status === 204` branch inside `alpacaFetch()` | Fixes the bug once, at the transport layer; zero risk to the other 17 call sites since none can receive a 204; covers any future 204 endpoint automatically | None material | **Chosen** |
| Bypass `alpacaFetch()` with a raw `fetch()` call scoped to `cancelOrder()` only | Zero risk to `alpacaFetch()` callers by construction | Duplicates header/error-handling logic; doesn't generalize to any future DELETE/204 endpoint; inconsistent with the file's one-fetch-wrapper pattern | Rejected |
| Broader "check `Content-Length` / try-catch around `res.json()`" guard | Would also catch unanticipated empty bodies on other status codes | Speculative — no confirmed endpoint besides 204 exhibits this; violates YAGNI and the explicit scoping instruction to stick to the confirmed 204 case | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/alpaca.ts` | MODIFY | Add a `res.status === 204` branch inside `alpacaFetch()`, between the existing `!res.ok` branch and the existing `return res.json()` line. No other function in this file changes. |

## Protected Zone Impact

None — `src/lib/alpaca.ts` is not in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`). No additional confirmation from Amaury is required beyond normal spec approval.

## Database Changes

None.

## Open Questions

None — the fix is fully specified by the diagnostic (confirmed via reading `alpacaFetch()` and its 18 call sites) and scoped narrowly per the constraints above.
