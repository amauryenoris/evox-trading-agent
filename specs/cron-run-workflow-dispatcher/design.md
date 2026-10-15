# Design — /api/cron/run as a secret-protected workflow dispatcher

## Architecture Decision

The change lives in one Next.js App Router route handler, `src/app/api/cron/run/route.ts`. Today it runs
`runAgentCycle()` inside Vercel with a 60 s limit, while the cycle takes 107 to 172 s on Actions, and it runs outside the
`trading-positions` concurrency group. Nothing calls it. It becomes a thin, authenticated dispatcher: an external
scheduler (cron-job.org, timezone `America/New_York`) calls it, and it only asks GitHub to run the matching workflow with
`ref: main`, exactly what the dashboard button does. The trading code keeps running in Actions, with the same
environment, timeout and serialization. No Protected Zone file is involved.

## Pre-Implementation Verification (read-only, against current files)

| Check | Result | Evidence |
|---|---|---|
| Middleware exempts exactly `/api/cron/run` | **Passes** | `middleware.ts:31`: `pathname !== '/api/cron/run'` is a strict comparison on the path, so `?target=...` does not affect it; matcher `'/api/:path*'` at `:58-64` |
| Route today | GET only, runs `runAgentCycle()`, `maxDuration = 60` | `route.ts:5,7,14` |
| `.env.example` exists | No | `ls` finds neither `.env.example` nor `.env.sample`; that allowed item is skipped |
| Next.js behavior for unsupported methods | Returns 405 automatically | `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:43` |
| Existing test of this route | None | no test imports `cron/run` |
| Alpaca helper for "is today a trading day" | **Exists, usable** (see below) | `alpaca.ts` |

## Trading-Day Guard — Which Helper

`alpaca.ts` exposes two candidates.

- `getClock()` returns `is_open`, `next_open`, `next_close`. It cannot tell a holiday from "after the close on a normal day",
  and three of the scheduled targets (health, bars, weekly) run after the close. **Not sufficient.**
- `getNextTradingDay(fromDate, daysAhead)` reads Alpaca's `/v2/calendar` and returns midnight UTC of the Nth trading day
  strictly after `fromDate`'s UTC date. Calling it with *yesterday* (ET date) and `1` returns today exactly when today is a
  trading day. **Chosen.**
- It never throws: on any Alpaca error it falls back to "yesterday + 1 calendar day", which equals today, so a failure
  reads as "trading day" and the route dispatches. That matches the required fail-open rule. It does log a
  `[CALENDAR_FALLBACK]` warning with the error object (Alpaca error text, no secrets).
- It has no timeout (`alpacaFetch` passes no abort signal), so the route races it against a 3 s timer; losing the race
  means "dispatch".

The ET date is computed with `Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })`, the same approach
`claude-agent.ts` already uses for the trading-hours gate. `alpaca.ts` is not edited.

## Data Flow

1. cron-job.org (timezone `America/New_York`) sends `POST /api/cron/run?target=cycle` with `Authorization: Bearer <CRON_SECRET>`.
2. `middleware.ts` lets the path through without a Supabase session (unchanged).
3. The handler runs the checks in this order, stopping at the first failure:
   1. `CRON_SECRET` unset or empty → 503.
   2. Header missing or wrong (constant-time compare, length checked first) → 401.
   3. `target` missing or not in the closed map → 400.
   4. GitHub settings missing → 500.
   5. Trading-day guard: non-trading day → 200 `skipped`; guard error or 3 s timeout → continue.
   6. `POST` to GitHub's dispatch endpoint with `{ref:'main'}`, 10 s abort.
4. 204 → 200 `{success:true, target, dispatched:true}`; anything else → 502 generic.
5. GitHub starts the run; the `trading-positions` group serializes the cycle and the exit sweeps.

## Response Table

| Situation | Status | Body |
|---|---|---|
| `CRON_SECRET` unset or empty | 503 | generic |
| Header missing or wrong | 401 | generic |
| Method other than POST | 405 | (GET adds `Allow: POST`) |
| `target` missing or invalid | 400 | generic |
| GitHub settings missing | 500 | generic |
| Non-trading day | 200 | `{success:true, skipped:'non_trading_day'}` |
| GitHub non-204, network error, timeout | 502 | generic |
| Dispatched | 200 | `{success:true, target, dispatched:true}` |

## Implementation Notes

- Responses use the standard `Response.json(...)` so tests can assert status codes without mocking `next/server`
  (the house route tests mock `NextResponse.json` to return only the data, losing the status).
- A closed `Record` lookup uses an own-property check, so `target=constructor` or `__proto__` cannot reach a prototype value.
- The route exports `POST` and a `GET` that returns 405 with `Allow: POST`, so the 405 case is a real, testable handler
  and a scheduler left on its default GET gets a clear answer.
- Test file: `src/lib/__tests__/cron-run-dispatcher.test.ts` (house location for route tests); `fetch`, env and
  `@/lib/alpaca` are mocked.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Keep running the cycle in the route | No GitHub hop | 60 s limit vs 107-172 s cycle; bypasses the concurrency group, so double orders are possible | Rejected |
| Dispatch from the route (this spec) | Same env, timeout and serialization as the button; blast radius limited to five fixed workflows | Needs `GITHUB_TOKEN` in Vercel (already there) | Chosen |
| Scheduler calls GitHub directly | No route | Hands a repo-level token to a third party | Rejected |
| New route plus a middleware exemption | Keeps `/api/cron/run` for the old behavior | Touches `middleware.ts`; the old behavior is harmful | Rejected |
| Guard with `getClock()` | Simple | Misreads after-close runs and holidays | Rejected |
| Guard with `getNextTradingDay(yesterday)` | Works at any hour; fails open by design | Helper has no timeout (handled by a race) | Chosen |
| In-memory duplicate guard | Blocks repeats | Useless on serverless; explicitly forbidden | Rejected |
| Rely on Next's automatic 405 only | Less code | The 405 case could not be unit-tested | Rejected (Open Question 3) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/app/api/cron/run/route.ts | MODIFY | Replace the GET cycle runner with a POST dispatcher and a GET 405 handler; remove the `claude-agent` import; `maxDuration = 15` |
| src/lib/__tests__/cron-run-dispatcher.test.ts | CREATE | Route tests with mocked `fetch`, env and `@/lib/alpaca` |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. The route stops importing `claude-agent`; no Protected Zone
file is edited.

## Database Changes

None.

## What the User Must Configure Outside the Repo

1. **Vercel (production):** define `CRON_SECRET` (long random value, for example 32 random bytes in hex). Confirm
   `GITHUB_TOKEN`, `GITHUB_OWNER` and `GITHUB_REPO` exist there (the button needs the token; see Open Question 1 for the other two). Redeploy.
2. **cron-job.org:** create jobs with method **POST** (the default is GET), URL `https://<production domain>/api/cron/run?target=<name>` with **no trailing slash**, header `Authorization: Bearer <CRON_SECRET>`, request timeout of at least 15 s, timezone `America/New_York`, and failure notifications on.
3. **Proposed Eastern-time schedule** (dependency order): `exits` 09:32 → `health` 09:47 → `cycle` 10:07, 11:07, 12:07, 13:07, 14:07, 15:07 → `exits` 15:52 → `health` 16:07 → `bars` 16:17 → `weekly` Friday 16:27.
4. **Keep the GitHub `schedule` triggers for now** as a fallback; the concurrency group prevents simultaneous runs.
5. **Later, separately:** replace the classic `repo`+`workflow` PAT with a fine-grained token limited to this repository's Actions, with an expiry date.

## Risks

- If `CRON_SECRET` is not set in Vercel production, every call returns 503. Nothing dispatches, which is the intended
  fail-closed behavior, but the schedule would silently not run until noticed (cron-job.org failure alerts cover this).
- A call can return 200 `skipped` on a real trading day only if Alpaca's calendar returns a wrong date; the guard fails
  open on errors, not on wrong data.
- Two triggers close together (scheduler plus a button press) fall under the concurrency group's one-pending rule; a
  cycle may be dropped.
- `503` before `401` tells an unauthenticated caller whether the secret is configured. This is a minor, accepted leak.

## Open Questions

1. **`GITHUB_OWNER` / `GITHUB_REPO` required or defaulted?** The request says a missing `GITHUB_*` value gives 500.
   `run-agent/route.ts` instead defaults them to `amauryenoris` / `evox-trading-agent` and only requires the token. If
   Vercel production defines only the token, the new route would answer 500 on every call while the button works.
   Recommendation: require only `GITHUB_TOKEN` and default owner and repo the same way as the button. Which do you want?
2. **Guard on `weekly` and `bars`:** as written the guard covers all five targets, so a Friday holiday (for example Good
   Friday) skips the weekly report. Recommendation: exclude `weekly` from the guard, or keep it for all and accept that.
3. **Explicit `GET` → 405 handler** (this spec) or rely on Next's automatic 405 (no handler, not unit-testable)?
4. Accept `503` being returned before `401`?
