# Tasks — Fase 2a: Persistent Cooldown — DB Functions + Calendar Helper

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Confirmed: no Protected Zone files touched
- [X] Confirmed: `symbol_cooldowns` table and `upsert_symbol_cooldown` RPC are live in Supabase

---

## Implementation Checklist

### Phase 1 — DB layer (`src/lib/db.ts`)

- [x] T-01: Append `upsertSymbolCooldown(symbol, exitReason, cooldownUntil)` to `db.ts`
  - Uses `const db = getClient()` (no module-level `supabase` variable)
  - Calls `db.rpc('upsert_symbol_cooldown', { p_symbol, p_exit_reason, p_cooldown_until })`
  - `cooldownUntil.toISOString()` for the RPC param
  - On error: `console.error('[COOLDOWN_WRITE_ERROR] symbol=...', error.message)` — no throw

- [x] T-02: Append `getActiveCooldowns()` to `db.ts`
  - Uses `const db = getClient()`
  - Queries `.from('symbol_cooldowns').select('symbol, exit_reason, cooldown_until').gt('cooldown_until', new Date().toISOString())`
  - Return type: `Promise<Array<{ symbol: string; exit_reason: string; cooldown_until: string }>>`
  - On error: `console.error('[COOLDOWN_READ_ERROR]', error.message)` → return `[]`

- [x] T-03: Append `cleanExpiredCooldowns()` to `db.ts`
  - Uses `const db = getClient()`
  - Deletes `.from('symbol_cooldowns').delete().lte('cooldown_until', new Date().toISOString())`
  - On error: `console.error('[COOLDOWN_CLEAN_ERROR]', error.message)` — no throw

### Phase 2 — Calendar helper (`src/lib/alpaca.ts`)

- [x] T-04: Append `getNextTradingDay(fromDate, daysAhead = 1)` to `alpaca.ts` after `getLatestSellOrder` (line 311)
  - `startStr` = `fromDate.toISOString().split('T')[0]`
  - `endStr`   = `(fromDate + daysAhead * 7 calendar days).toISOString().split('T')[0]`
  - Calls `alpacaFetch<Array<{ date: string; open: string }>>(url.toString())` using private `baseUrl()`
  - Filter: `(calendar ?? []).filter(day => day.date > startStr)` — `fromDate` excluded
  - Happy path: `new Date(\`${tradingDays[daysAhead - 1].date}T00:00:00Z\`)`
  - Fallback A (insufficient days): `console.warn('[CALENDAR_FALLBACK] insufficient...')` → midnight UTC of `fromDate + daysAhead` calendar days
  - Fallback B (catch block): `console.warn('[CALENDAR_FALLBACK] API error...')` → same midnight UTC fallback
  - Both fallbacks: `new Date(\`${fallback.toISOString().split('T')[0]}T00:00:00Z\`)` — midnight UTC, no DST

### Phase 3 — Type-check

- [x] T-05: Run `npm run build` — zero TypeScript errors

### Phase 4 — Testing

- [x] T-06: Write unit tests in `src/lib/__tests__/cooldown-db.test.ts`
  - `upsertSymbolCooldown` — verify `rpc` is called with correct params; verify error is logged, not thrown
  - `getActiveCooldowns` — verify `.gt` filter is applied; verify error returns `[]`
  - `cleanExpiredCooldowns` — verify `.lte` (not `.lt`) is used; verify error is logged, not thrown

- [x] T-07: Write unit tests in `src/lib/__tests__/calendar-helper.test.ts`
  - Happy path: returns midnight UTC of the Nth trading day
  - Fallback A: when API returns fewer days than `daysAhead`
  - Fallback B: when `alpacaFetch` throws
  - Confirm: `fromDate` is never counted as a trading day (strict `>` filter)
  - Confirm: returned Date is always `T00:00:00Z` (midnight UTC)

- [x] T-08: Verify 80% coverage on new code (`npm run test:coverage`)

---

## Post-Implementation

- [x] Run `/review Fase 2a` to verify implementation matches spec
- [x] Confirm no existing function in `db.ts` or `alpaca.ts` was modified
- [x] Confirm Protected Zone files are unchanged

---

## Estimated Complexity

**Low** — pure append additions to two existing files. All patterns (Supabase queries, `alpacaFetch`) are already established in the codebase. No new abstractions, no schema changes, no agent wiring.
