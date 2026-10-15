# Tasks — /api/cron/run as a secret-protected workflow dispatcher

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open Questions 1-4 in `design.md` answered
- [x] Protected Zone changes confirmed — N/A, none required
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 0 — Read-only pre-checks (FAIL FAST)
- [x] T-01: Re-read `middleware.ts:29-36` and the matcher; confirm the exemption is exactly `pathname !== '/api/cron/run'`. If it is broader or gone, STOP and report the line.
- [x] T-02: Confirm `getNextTradingDay` is still exported by `alpaca.ts` and still never throws; confirm no test or code calls `/api/cron/run`; confirm `.env.example` does not exist.
- [x] T-03: Confirm the route can be unit-tested with mocked `fetch`, env and `@/lib/alpaca` without editing any forbidden file. If not, STOP and report.

### Phase 1 — Tests first (RED), in `src/lib/__tests__/cron-run-dispatcher.test.ts`
- [x] T-04: 405 on GET with `Allow: POST`; the module exports only `POST` and `GET` (FR-01 to FR-03).
- [x] T-05: 503 when `CRON_SECRET` is unset and when it is empty; no `fetch` and no Alpaca call (FR-04 to FR-06).
- [x] T-06: 401 without the header, with a wrong secret, with a different-length secret, with a wrong scheme; no outbound call (FR-07 to FR-12).
- [x] T-07: 400 for a missing target, an unknown target, `constructor`, `__proto__`, upper-case `CYCLE` and a path fragment; the guard is not consulted (FR-13, FR-19 to FR-21, FR-38).
- [x] T-08: For each of the five targets, the exact workflow file, `ref: main`, no inputs, the bearer header and a 10 s abort signal; success body shape (FR-14 to FR-18, FR-23 to FR-27).
- [x] T-09: 502 on GitHub 422, on a network error and on a timeout (fake timers), with no token, header or response body in the response or in any log call (FR-28 to FR-30, FR-41 to FR-45).
- [x] T-10: 500 when `GITHUB_TOKEN` / owner / repo is missing or empty, with no outbound call (FR-31, FR-32) — per the answer to Open Question 1.
- [x] T-11: Guard cases: non-trading day → 200 `skipped` and no dispatch; trading day → dispatch; Alpaca helper rejecting → dispatch; helper slower than 3 s (fake timers) → dispatch (FR-34 to FR-37, FR-40).
- [x] T-12: One log line per authenticated request with target and outcome; every logged string is scanned for the secret and the token (FR-41, FR-42, FR-46).
- [x] T-13: The route module does not import `claude-agent` (FR-47).

### Phase 2 — Route (GREEN), `src/app/api/cron/run/route.ts`
- [x] T-14: Named constants: target map, `main` ref, 10 s and 3 s timeouts, `maxDuration = 15`, API version header (NFR-03, FR-50).
- [x] T-15: `isAuthorized(req)`: constant-time compare with `crypto.timingSafeEqual`, length checked first (FR-09, FR-10).
- [x] T-16: Target lookup with an own-property check on the fixed map (FR-13, FR-20, FR-21).
- [x] T-17: `isTradingDay()` using `getNextTradingDay` on the previous New York date, raced against a 3 s timer, failing open (FR-34 to FR-37).
- [x] T-18: `dispatchWorkflow(file)` with `AbortController`, URL-encoded segments and the same headers as `run-agent` (FR-23 to FR-26, FR-33).
- [x] T-19: `POST` handler wiring in the documented order and the response table; `GET` handler returning 405; remove `runAgentCycle` and unused imports; keep `dynamic = 'force-dynamic'` (FR-47 to FR-49).
- [x] T-20: Functions under 50 lines, no `any`.

### Phase 3 — Verification
- [x] T-21: `npx tsc --noEmit` clean.
- [x] T-22: Full Vitest run passes; coverage of the route at least 80%.
- [x] T-23: `npm run build` succeeds.
- [x] T-24: `git diff --stat` shows only the route and the new test file (plus this spec folder); show the full diff; confirm `middleware.ts`, `run-agent/route.ts` and `RunAgentButton` are unchanged (FR-51, FR-52).
- [x] T-25: Write the report: no real dispatch was made; `CRON_SECRET` in Vercel production was not verified; list the outside-the-repo configuration from `design.md`; state whether the trading-day guard was implemented and with which helper.

## Post-Implementation

- [x] Run /review cron-run-workflow-dispatcher to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged
- [ ] After deploy and configuration: one manual POST for `target=health` (lowest risk) and confirm a run appears in Actions

## Estimated Complexity

Medium — one small route, but with security-sensitive details (constant-time auth, fail-closed config, no leakage),
timeouts, and a fail-open calendar guard that needs careful tests.
