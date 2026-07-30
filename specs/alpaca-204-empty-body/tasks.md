# Tasks — alpaca-204-empty-body

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed (if applicable) — N/A, `alpaca.ts` is not in the Protected Zone
- [ x] Database migrations drafted (if applicable) — N/A

## Implementation Checklist

### Phase 1 — Transport layer fix
- [x] T-01: In `src/lib/alpaca.ts`, modify `alpacaFetch<T>()` (currently lines 30-37) to add a `res.status === 204` check that returns `undefined as T` before the existing `res.json()` call. Preserve the `!res.ok` branch exactly as-is.

### Phase 2 — Verification
- [x] T-02: Read the modified `alpacaFetch()` and confirm all 17 non-cancelOrder call sites are structurally unaffected (none can receive a 204 from Alpaca per the endpoint inventory in the prior diagnostic).
- [x] T-03: Read the modified `alpacaFetch()` and confirm `cancelOrder()` would now resolve to `undefined` (not throw) on a 204 response.
- [x] T-04: Run `npx tsc --noEmit` — confirm no new type errors, and specifically check whether `undefined as T` raises any strictness concern given the generic signature.
- [x] T-05: Run `npm run build` — confirm it passes.
- [x] T-06: Run the existing test suite (`npm test` / relevant files under `src/lib/__tests__/`) — confirm all pass unmodified. (297/297 passed, 29 files, via `npx vitest run`)
- [x] T-07: Report the final line count of `src/lib/alpaca.ts`. (402 lines, up from 400 — well under the 800-line ceiling)

## Post-Implementation

- [x] Run `/review alpaca-204-empty-body` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (they are not touched by this feature)

## Estimated Complexity

Low — a single 3-line conditional added to one function in a non-Protected-Zone file, with no new call sites, no new types, and no cross-file changes.
