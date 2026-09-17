# Tasks — Active Cooldowns Card

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, none touched
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — API Layer
- [x] T-01: Create `src/app/api/cooldowns/route.ts` — `export const dynamic = 'force-dynamic'`, `GET()` calls `getActiveCooldowns()` from `@/lib/db`, returns `NextResponse.json({ cooldowns })` wrapped in try/catch mirroring `/api/near-miss/route.ts`'s error handling (`console.error` + 500 on failure)

### Phase 2 — UI / Dashboard
- [x] T-02: Create `src/components/dashboard/ActiveCooldowns.tsx` — `'use client'`, `useState<Array<{symbol,exit_reason,cooldown_until}>>([])`, `useEffect` with immediate fetch + `setInterval(fetchCooldowns, 60_000)` + cleanup, silent-fail on error/non-OK
- [x] T-03: In `ActiveCooldowns.tsx`, render `<Card padded={false} label={`Active Cooldowns · ${cooldowns.length} tracked`}>` with one row-card div per entry (`bg-surface2 border border-border rounded-lg p-3.5`) showing symbol, a neutral-toned `Badge` with the raw `exit_reason`, and `cooldown_until` formatted via `toLocaleString()` (or equivalent readable date/time formatter already used elsewhere in the dashboard)
- [x] T-04: In `ActiveCooldowns.tsx`, render calm muted empty-state text ("No active cooldowns") when `cooldowns.length === 0`
- [x] T-05: In `src/app/dashboard/page.tsx`, import `ActiveCooldowns` and add `<ActiveCooldowns />` immediately after `<RejectedSetups />` inside the `intelligence` tab's `<div className="space-y-5">`

### Phase 3 — Verification
- [x] T-06: Confirm the new card appears below `RejectedSetups`, full-width, without disturbing the existing 2-column grid or `RejectedSetups` itself — confirmed structurally in `page.tsx` (`<ActiveCooldowns />` sits after `<RejectedSetups />`, outside the grid `div`). **Not** visually confirmed in a rendered browser tab — no browser tool is available in this environment, and `DashboardTabs` only mounts the active tab client-side (`{tabs[active]}`), so the intelligence tab's DOM isn't present in a plain `curl`/static fetch of `/dashboard` even for the pre-existing sibling `NearMissWatchlist` (verified this is pre-existing behavior, not caused by this change)
- [x] T-07: Confirm `/api/cooldowns` returns `getActiveCooldowns()`'s output unmodified, wrapped as `{ cooldowns: [...] }` — spot-checked live: empty table → `{"cooldowns":[]}`; inserted a temporary, non-committed test row (`__SPEC_VERIFY_TEST__`) → `{"cooldowns":[{"symbol":"__SPEC_VERIFY_TEST__","exit_reason":"TRAILING_STOP","cooldown_until":"..."}]}`; test row deleted immediately after, table confirmed back to empty
- [x] T-08: Confirm polling fires every 60 seconds and is cleaned up on unmount — confirmed structurally: identical `setInterval(fetchCooldowns, 60_000)` + `return () => clearInterval(interval)` idiom as `NearMissWatchlist`. Not observed live over a 60s window in a browser (no browser tool available)
- [x] T-09: Confirm the empty state renders as calm/muted, not error-styled — confirmed in source (`text-sm text-muted`, centered, same classes as `NearMissWatchlist`'s empty state) and confirmed the API returns `{"cooldowns":[]}` on the real empty table, which drives that branch
- [x] T-10: Confirm no existing component, route, or test was modified beyond the one additive `page.tsx` edit — confirmed via `git status`: only `src/app/dashboard/page.tsx` modified (2 lines added), plus new files `src/app/api/cooldowns/route.ts` and `src/components/dashboard/ActiveCooldowns.tsx`. An unrelated auto-regenerated `AGENTS.md` diff (written by `next dev` itself, per its own `<!-- BEGIN:nextjs-agent-rules -->` block) was reverted since it's outside this feature's scope
- [x] T-11: Run `npx tsc --noEmit` — passed, no output/errors
- [x] T-12: Run `npm run build` — passed; `/api/cooldowns` listed as a dynamic (`ƒ`) route in the build output
- [x] T-13: Run `npm test` — 46 test files, 413/413 tests passed, all pre-existing (no new tests added — see note below)
- [x] T-14: Final line counts — `src/app/api/cooldowns/route.ts`: 14 lines; `src/components/dashboard/ActiveCooldowns.tsx`: 59 lines; `src/app/dashboard/page.tsx`: +2 lines (additive only)

**Note on T-13 / test coverage**: no unit tests were added for the new route or component. The spec's CHANGE section didn't call for new test files, and the two new files are thin, direct mirrors of already-tested patterns (`getActiveCooldowns()` itself is presumably covered elsewhere; `/api/near-miss` and `NearMissWatchlist` have no dedicated test files either in `src/lib/__tests__/`). Flagging this explicitly since CLAUDE.md's general 80%-coverage guidance wasn't met with new tests — if Amaury wants test coverage for this route/component, that's a follow-up, not silently skipped.

## Post-Implementation

- [ ] Run `/review active-cooldowns-card` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged — confirmed via `git status`, no Protected Zone file touched

## Estimated Complexity

**Low** — two small new files (a pass-through API route and a component that closely mirrors an existing, well-understood component) plus a one-line additive edit to `page.tsx`. No new dependencies, no schema changes, no Protected Zone involvement, no state-mutation logic.
