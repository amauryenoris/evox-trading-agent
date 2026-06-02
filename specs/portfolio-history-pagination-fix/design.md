# Design — Portfolio History Pagination Fix

## Architecture Decision

This is a pure API-layer fix. The only file that changes is
`src/app/api/portfolio-history/route.ts`. No new files, no DB migrations, no
frontend changes. The route's responsibility expands from "fetch up to N rows" to
"fetch all rows via range-based pagination" before passing the data to the
existing per-day aggregation step.

## Data Flow

```
GET /api/portfolio-history
        │
        ▼
  page = 0, allRows = []
        │
        ▼
  ┌─────────────────────────────────┐
  │  Supabase: agent_log            │
  │  .range(page*1000, page*1000+999│
  │  .not('portfolio_snapshot','is',│
  │  .gte('created_at','2026-04-20')│
  │  .order('created_at', asc)      │
  └─────────────┬───────────────────┘
                │ batch (≤ 1000 rows)
                ▼
        allRows.push(...batch)
                │
        batch.length < 1000?
           Yes ──► proceed to aggregation
           No  ──► page++, repeat
                │
                ▼
  Per-day aggregation (unchanged):
  byDay: Map<date, maxEquity>
  filter equity > 50000
                │
                ▼
  Return { history, startEquity,
           currentEquity, totalReturn }
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Raise Supabase Max Rows to 10000 in Dashboard | 1 click, no code change | Project-setting dependency; will break again if rows exceed new limit; requires Amaury to remember the setting | Rejected |
| Range-based pagination in route code | Robust regardless of project settings; self-adjusting; no infrastructure dependency | ~2 Supabase round-trips today (1,827 rows / 1000) | **Chosen** |
| DB-level aggregate (RPC / view) | Single query, minimal data transfer | Requires DB migration; adds stored procedure to maintain; Protected Zone risk if tied to agent logic | Rejected |
| Increase limit only in JS client with `Prefer: count=exact` override | Simple | `Prefer: count=exact` header only affects the count, not the row cap; does not solve the problem | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/api/portfolio-history/route.ts` | MODIFY | Replace single `.limit(10000)` call with a `while` loop using `.range(offset, offset + PAGE_SIZE - 1)` to paginate through all rows |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None.

## Implementation Detail (for implementer reference)

Replace the single Supabase query with:

```ts
const PAGE_SIZE = 1000
const allRows: Array<{ created_at: string; portfolio_snapshot: unknown }> = []
let offset = 0

while (true) {
  const { data, error } = await db
    .from('agent_log')
    .select('created_at, portfolio_snapshot')
    .not('portfolio_snapshot', 'is', null)
    .gte('created_at', '2026-04-20')
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) throw error
  allRows.push(...(data ?? []))
  if ((data ?? []).length < PAGE_SIZE) break
  offset += PAGE_SIZE
}
```

The rest of the function (`byDay` aggregation, response shape) remains unchanged.

## Open Questions

None — root cause confirmed, fix approach agreed.
