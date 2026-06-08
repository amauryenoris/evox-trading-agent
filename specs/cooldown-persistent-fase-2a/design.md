# Design — Fase 2a: Persistent Cooldown — DB Functions + Calendar Helper

## Architecture Decision

This feature lives entirely in the **data access layer** (`src/lib/db.ts`) and the
**broker client layer** (`src/lib/alpaca.ts`). No new files. No new API routes. No UI.
The three DB functions are thin wrappers around existing Supabase patterns already
established in `db.ts`. The calendar helper follows the same pattern as other
`alpacaFetch` calls in `alpaca.ts`.

---

## STEP 0 Findings — Read Before Touch

### `db.ts` — imports and client pattern

```ts
// Lines 1–18 of db.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AgentLogEntry, OpenPositionContext, ... } from './types'

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}
```

**Critical:** There is NO module-level `supabase` constant. Every function calls
`const db = getClient()` inside its own body. The spec's pseudo-code uses `supabase.rpc(...)` —
the actual implementation must use `const db = getClient(); db.rpc(...)`.

### `alpaca.ts` — `alpacaFetch` and `baseUrl`

```ts
// Lines 22–37 of alpaca.ts
function baseUrl() {
  return process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets'
}

async function alpacaFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, headers: { ...getHeaders(), ... } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Alpaca API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}
```

Both `baseUrl` and `alpacaFetch` are **private** (no `export`). `getNextTradingDay` lives
in the same file and can call them directly — no import needed.

### `alpaca.ts` — Existing exports (no duplicates)

```
getAccount, getPositions, getOrders, getClock, isMarketOpen,
getBars, submitOrder, submitLimitOrder, getQuote, closePosition,
getMarketMovers, getStockSnapshots, submitStopOrder,
getNewsForSymbols, getMacroNews, getLatestSellOrder
```

`getNextTradingDay` — **no conflict**. Safe to add.
No existing `getCalendar`, `getTradingCalendar`, or `getNextTradingDay`.

---

## Data Flow

### `upsertSymbolCooldown`

```
caller → upsertSymbolCooldown(symbol, exitReason, cooldownUntil)
  → getClient()
  → supabase.rpc('upsert_symbol_cooldown', { p_symbol, p_exit_reason, p_cooldown_until })
  → DB enforces longer-wins (CASE WHEN … END in SQL RPC)
  → error? → console.error [COOLDOWN_WRITE_ERROR]
```

### `getActiveCooldowns`

```
caller → getActiveCooldowns()
  → getClient()
  → .from('symbol_cooldowns').select('symbol, exit_reason, cooldown_until')
     .gt('cooldown_until', new Date().toISOString())
  → returns Array<{ symbol, exit_reason, cooldown_until }> or []
  → error? → console.error [COOLDOWN_READ_ERROR] → return []
```

### `cleanExpiredCooldowns`

```
caller → cleanExpiredCooldowns()
  → getClient()
  → .from('symbol_cooldowns').delete()
     .lte('cooldown_until', new Date().toISOString())
  → error? → console.error [COOLDOWN_CLEAN_ERROR]
```

### `getNextTradingDay`

```
caller → getNextTradingDay(fromDate, daysAhead = 1)
  → build startStr = fromDate.toISOString().split('T')[0]
  → build endStr   = (fromDate + daysAhead * 7 days).toISOString().split('T')[0]
  → alpacaFetch<Array<{ date: string; open: string }>>(
       /v2/calendar?start=startStr&end=endStr
    )
  → filter: day.date > startStr   ← excludes fromDate itself
  → if tradingDays.length < daysAhead → FALLBACK A
  → return new Date(`${tradingDays[daysAhead - 1].date}T00:00:00Z`)
  → catch(err) → FALLBACK B

FALLBACK A / B:
  fallback = new Date(fromDate)
  fallback.setDate(fallback.getDate() + daysAhead)
  return new Date(`${fallback.toISOString().split('T')[0]}T00:00:00Z`)
```

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Module-level `supabase` singleton in db.ts | Fewer `getClient()` calls | Breaks startup validation; inconsistent with existing pattern | Rejected |
| Inline calendar math (no Alpaca API) | Zero external dependency | Misses holidays; breaks over long weekends | Rejected |
| Separate `calendar.ts` helper file | Clean separation | Overkill for one function; would orphan `baseUrl`/`alpacaFetch` | Rejected |
| Append to `alpaca.ts` (chosen) | Reuses private `baseUrl` + `alpacaFetch`; consistent with file | Slightly grows the file | **Chosen** |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| [src/lib/db.ts](src/lib/db.ts) | APPEND | Add `upsertSymbolCooldown`, `getActiveCooldowns`, `cleanExpiredCooldowns` after last export (line 744) |
| [src/lib/alpaca.ts](src/lib/alpaca.ts) | APPEND | Add `getNextTradingDay` after last export `getLatestSellOrder` (line 311) |

---

## Protected Zone Impact

None — `db.ts` and `alpaca.ts` are **not** in the Protected Zone.
`claude-agent.ts`, `config.ts`, `risk-manager.ts`, `indicators.ts` are untouched.

---

## Database Changes

None in this phase. The table and RPC already exist:

- Table: `symbol_cooldowns` (`symbol TEXT PK`, `exit_reason TEXT`, `cooldown_until TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`)
- RPC: `upsert_symbol_cooldown(p_symbol, p_exit_reason, p_cooldown_until)` — longer-wins upsert

---

## Open Questions

None — implementation is fully specified. No Amaury input required before proceeding.
