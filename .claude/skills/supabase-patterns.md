# Supabase Patterns — Paquito

## Two clients — never mix them

| Client | File | Env vars | Use for |
|--------|------|----------|---------|
| Browser | `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | React components, `use client` |
| Server | `src/lib/supabase/server.ts` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Server Components, API routes, middleware |
| Direct DB | `src/lib/db.ts` | `SUPABASE_SERVICE_ROLE_KEY` | Scripts, cron, agent cycle only |

**NEVER use the service role key in the browser client.** It bypasses RLS and exposes full DB access.

## All DB operations go through src/lib/db.ts

Do not write raw Supabase queries in API routes or components. Add a function to `db.ts` and call it from there.

```typescript
// db.ts
export async function getAgentLog(limit = 50): Promise<AgentLogEntry[]> {
  const supabase = createDirectClient()
  const { data, error } = await supabase
    .from('agent_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}
```

## Always destructure and check error

```typescript
const { data, error } = await supabase.from('agent_log').select('*')
if (error) throw error           // throws → caller handles
return data ?? []                // never return null
```

Never ignore the `error` field. Never return raw `data` without a null fallback.

## Tables and their primary keys

| Table | Primary key | Notes |
|-------|-------------|-------|
| `agent_log` | `id` (uuid) | One row per symbol per cycle |
| `open_position_contexts` | `symbol` (text) | One row per open position |
| `trade_evaluations` | `id` (uuid) | Created when position closes |
| `near_miss_watchlist` | `symbol` (text) | Active near-misses only |
| `news_events` | `id` (uuid) | Classified news items |
| `pattern_library` | `id` (uuid) | Learned patterns |
| `selection_history` | `id` (uuid) | Stock selector decisions |
| `selection_evaluations` | `id` (uuid) | Selector outcome tracking |
| `weekly_reports` | `id` (uuid) | PDF report metadata |

## Upsert pattern (open_position_contexts)

`open_position_contexts` is keyed by `symbol` — always upsert, never insert:

```typescript
const { error } = await supabase
  .from('open_position_contexts')
  .upsert({ symbol, ...fields }, { onConflict: 'symbol' })
if (error) throw error
```

## Timestamps

Always use `new Date().toISOString()` for timestamps. Supabase stores them as `timestamptz`.

## RLS

All tables have RLS enabled. The direct client in `db.ts` uses the service role key to bypass RLS for agent operations. The browser client uses the anon key and is subject to RLS — users must be authenticated to read data.
