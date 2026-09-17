# Design — Active Cooldowns Card

## Architecture Decision

This is a pure read-only presentation feature on top of an already-existing, already-correct data function. Three files, all in the "Touch freely" zone per CLAUDE.md:

- `src/app/api/cooldowns/route.ts` (new) — thin API route, wraps `getActiveCooldowns()` (already exported from `src/lib/db.ts:803-807`, re-exported from `src/lib/db-cooldowns.ts:26-44`).
- `src/components/dashboard/ActiveCooldowns.tsx` (new) — client component, polling card, mirrors `NearMissWatchlist.tsx`'s structure.
- `src/app/dashboard/page.tsx` (modify) — one-line additive JSX insertion inside the `intelligence` tab panel.

No Protected Zone file is touched. No new library, no new shared UI primitive, no new type declaration.

## Data Flow

1. `ActiveCooldowns` mounts → `useEffect` fires `fetchCooldowns()` immediately.
2. `fetchCooldowns()` calls `fetch('/api/cooldowns')`.
3. `GET /api/cooldowns` calls `getActiveCooldowns()` → Supabase query on `symbol_cooldowns`, filtered to `cooldown_until > now()`, limited to 100 rows.
4. Route returns `{ cooldowns: [...] }` unmodified.
5. Component sets state from `data.cooldowns`; renders one row-card per entry, or the empty-state message when the array is empty.
6. `setInterval` re-runs step 2-5 every 60s; cleared on unmount.
7. Any fetch failure (network error or non-OK response) is caught and silently ignored — the last successfully fetched list stays on screen (matches `NearMissWatchlist`'s exact silent-fail behavior; it does not clear state on failure either).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Bare array response `Array<{...}>` (matches `/api/near-miss`'s actual current shape) | Consistent with the one existing analogous route | Contradicts the explicit, already-approved `{ cooldowns: [...] }` contract given for this feature | Rejected — explicit approved contract wins; documented here as a known divergence from `/api/near-miss`'s shape |
| `{ cooldowns: [...] }` wrapped response | Matches the approved spec; self-describing payload; room to add metadata later without a breaking shape change | One extra unwrap step (`data.cooldowns` vs `data`) vs. `NearMissWatchlist`'s pattern | **Chosen** |
| Add loading skeleton on every fetch (initial + poll refreshes) | Simpler, one code path | `NearMissWatchlist` (the mirrored component) has **no** loading state at all — entries just start as `[]`; adding one here would be an invented distinction the source pattern doesn't make | Rejected |
| No loading state at all (mirror `NearMissWatchlist` exactly: state starts `[]`, first paint shows the empty-state message until the first fetch resolves) | Exact parity with the component this feature is told to mirror "as closely as possible"; avoids inventing new distinctions | Empty-state message flashes briefly even when cooldowns exist, until first fetch resolves (identical to how `NearMissWatchlist` briefly shows "No near-miss signals" on first paint) | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/app/api/cooldowns/route.ts` | CREATE | GET route returning `{ cooldowns: getActiveCooldowns() }`, mirrors `/api/near-miss/route.ts`'s try/catch + `dynamic = 'force-dynamic'` shape |
| `src/components/dashboard/ActiveCooldowns.tsx` | CREATE | `'use client'` polling card component, mirrors `NearMissWatchlist.tsx` |
| `src/app/dashboard/page.tsx` | MODIFY | Add `<ActiveCooldowns />` immediately after `<RejectedSetups />` inside the `intelligence` tab's `<div className="space-y-5">`; add one import line |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. No file under `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts` is touched.

## Database Changes

None. `symbol_cooldowns` already exists and is read as-is via the existing `getActiveCooldowns()` function; no migration, no new column, no new RLS policy.

## Resolved Design Questions (settled by the approved spec, not left open)

- **Response shape vs. `/api/near-miss` precedent**: `/api/near-miss/route.ts` currently returns a bare array (`NextResponse.json(sorted)`), not `{ nearMiss: [...] }`. The approved spec for this feature explicitly specifies `{ cooldowns: [...] }` for the new route. This is implemented as specified — a deliberate divergence from the one existing analogous route, not an oversight. Flagged here for visibility since it means `ActiveCooldowns.tsx`'s fetch handler cannot copy `NearMissWatchlist.tsx`'s `res.json() as T[]` line verbatim — it unwraps one level deeper (`(await res.json()).cooldowns`).
- **Loading state**: `NearMissWatchlist.tsx` has no `loading` boolean and no skeleton at all (unlike `RejectedSetups.tsx`, which does have one). Per the spec's own tie-breaker ("if it doesn't distinguish first-load from poll-refresh, don't invent a new distinction here either — match its exact behavior"), `ActiveCooldowns.tsx` will **not** add a loading skeleton — it starts with `cooldowns = []` and renders the empty state until the first fetch resolves, exactly like `NearMissWatchlist`.

## Open Questions

None.
