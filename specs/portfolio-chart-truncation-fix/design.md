# Design — Portfolio Chart Truncation Fix

## Architecture Decision

The bug is entirely in the Vercel deployment configuration, not in the codebase.
Every server-side file (`db.ts`, `route.ts`, `report-generator.ts`,
`rejected-today/route.ts`, `supabase/server.ts`) already consistently reads
`process.env.SUPABASE_URL`. No code change is required to standardize the
connection — the code is already standardized.

The fix is two steps:
1. **Vercel config** — update `SUPABASE_URL` to point to the correct project.
2. **Code cleanup** — remove the two `[API DEBUG]` console.log statements added
   during diagnosis from `src/app/api/portfolio-history/route.ts`.

## Root Cause Trace

```
GitHub Actions (trading agent cron)
  → reads SUPABASE_URL from GitHub Secrets
  → points to hhrtqxwonpmryziuejeq   ← correct project
  → writes 1,794 rows through June 2

Vercel (dashboard + API routes)
  → reads SUPABASE_URL from Vercel env vars
  → points to a DIFFERENT project        ← wrong project
  → reads only 16 rows through May 12
  → chart truncated
```

## Data Flow (after fix)

```
GET /api/portfolio-history
  → getClient() reads process.env.SUPABASE_URL
     = https://hhrtqxwonpmryziuejeq.supabase.co  ← after fix
  → Supabase query: agent_log, ascending, limit 10000
  → returns ~1,794 rows (Apr 20 → Jun 2)
  → byDay Map: ~44 unique trading days
  → history[]: 44 points
  → PnLChart renders full equity curve Apr 20 → Jun 2
```

## Env Var Audit (current state in codebase)

All server-side files use `SUPABASE_URL` — no code inconsistency exists:

| File | Var used |
|------|----------|
| `src/lib/db.ts` | `SUPABASE_URL` |
| `src/app/api/portfolio-history/route.ts` | `SUPABASE_URL` |
| `src/app/api/rejected-today/route.ts` | `SUPABASE_URL` |
| `src/lib/report-generator.ts` | `SUPABASE_URL` |
| `src/lib/supabase/server.ts` | `SUPABASE_URL` |
| `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_URL` (browser — correct) |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Update `SUPABASE_URL` in Vercel | Zero code change, correct long-term fix | Manual Vercel step | **Chosen** |
| Change code to `NEXT_PUBLIC_SUPABASE_URL` | No Vercel step needed | Exposes URL to browser; deviates from consistent server-side pattern | Rejected |
| Add hardcoded fallback URL in code | Chart works immediately | Hardcoded secret in source — security violation | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/app/api/portfolio-history/route.ts` | MODIFY | Remove 2 debug console.log blocks (+CURRENT_LIMIT constant) added during diagnosis |
| Vercel Dashboard | CONFIG | Update `SUPABASE_URL` to `https://hhrtqxwonpmryziuejeq.supabase.co` |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None.

## Open Questions

- None. Root cause confirmed, fix path is unambiguous.
  After Vercel env var update + redeploy, `GET /api/portfolio-history`
  should return 44 points ending June 2.
