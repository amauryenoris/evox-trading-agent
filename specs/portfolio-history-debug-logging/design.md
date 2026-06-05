# Design — Portfolio History Debug Logging

## Architecture Decision

This change lives entirely in the Next.js API layer (`src/app/api/portfolio-history/route.ts`). It is a single `console.log` insertion — no new files, no new modules, no data-layer changes. The log fires on the server (Vercel serverless function) and is visible in Vercel Function Logs for the `/api/portfolio-history` endpoint.

## Data Flow

```
GET /api/portfolio-history
  → Supabase query executes
  → data[] returned
  ↓
  [INSERT HERE] console.log('[API DEBUG]', rows, limit, hitLimit, first, last)
  ↓
  byDay aggregation
  → history[] constructed
  → NextResponse.json(...)
```

The log is inserted at the earliest possible point after `data` is available — immediately after `if (error) throw error` — so it captures the raw Supabase row count before any aggregation or transformation.

## Current State of the Target File

File: `src/app/api/portfolio-history/route.ts`

Relevant excerpt (lines 15–25):

```ts
const { data, error } = await db
  .from('agent_log')
  .select('created_at, portfolio_snapshot')
  .not('portfolio_snapshot', 'is', null)
  .gte('created_at', '2026-04-20')
  .order('created_at', { ascending: true })
  .limit(10000)   // ← CURRENT_LIMIT = 10000

if (error) throw error

// [console.log goes HERE — after error check, before byDay loop]

const byDay = new Map<string, number>()
```

## Exact Change

Add these two lines after `if (error) throw error`:

```ts
const CURRENT_LIMIT = 10000
console.log('[API DEBUG]', 'rows:', data?.length, 'limit:', CURRENT_LIMIT, 'hitLimit:', data?.length === CURRENT_LIMIT, 'first:', data?.[0]?.created_at, 'last:', data?.at(-1)?.created_at)
```

`CURRENT_LIMIT` mirrors the `.limit(10000)` call above it. If the limit is ever changed, both must be updated in the same edit.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `console.log` directly after error check | Zero overhead, visible in Vercel logs, one-line removal | Must be manually removed after diagnosis | **Chosen** |
| Return debug fields in JSON response | Visible in browser without Vercel | Leaks internal row counts to client; response shape change | Rejected |
| Add Vercel Analytics or structured logger | Persistent observability | New dependency, scope creep, not needed for a one-off diagnosis | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/api/portfolio-history/route.ts` | MODIFY | Add `CURRENT_LIMIT` constant + `console.log` after error check (2 lines) |

## Protected Zone Impact

None — `src/app/api/portfolio-history/route.ts` is in the **API layer** (`src/app/api/**`), which is in the "Touch freely" category per CLAUDE.md.

## Database Changes

None.

## Open Questions

None — scope is fully constrained. After deployment, Amaury reads the Vercel Function Logs for `/api/portfolio-history` and pastes the output to determine next step:

- `hitLimit: true` + last ≈ May 12 → row count is the problem → fix is SQL aggregation or raise limit
- `hitLimit: false` + last ≈ May 12 → query filter is dropping rows → investigate equity threshold or date filter
- `last` = June 1 → API is healthy → bug is in frontend filter or SSR prop
