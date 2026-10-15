# Review Report — /api/cron/run as a secret-protected workflow dispatcher

**Date**: 2026-10-15
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

Verification basis: static review of `src/app/api/cron/run/route.ts` (158 lines) and the new test file,
`npx tsc --noEmit` (clean), ESLint on both files (0 errors), full Vitest run (57 files / 664 tests pass),
route coverage (100% statements and lines, 97.1% branches), `npm run build` (succeeds, `/api/cron/run` listed as
dynamic), and `git diff` over the neighbor files (unchanged).
**Not run:** any real dispatch to GitHub (every test mocks `fetch`), a request against a running server, the middleware
at runtime, and anything in Vercel production (whether `CRON_SECRET`, `GITHUB_TOKEN`, `GITHUB_OWNER` and `GITHUB_REPO`
are defined there was not checked).

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Accept POST | ✅ | |
| FR-02 | GET → 405 with `Allow: POST` | ✅ | Explicit handler; tested |
| FR-03 | Other methods → 405 | ➖ | Provided by Next for unexported methods (`15-route-handlers.md:43`); the test asserts only `GET` and `POST` are exported |
| FR-04, FR-05 | 503 when `CRON_SECRET` is unset or empty | ✅ | Both tested |
| FR-06 | No outbound request without a usable secret | ✅ | Asserted on `fetch` and the calendar mock |
| FR-07, FR-08 | 401 for missing or wrong credential | ✅ | Six cases tested, including wrong scheme and bare secret |
| FR-09 | Constant-time comparison | ✅ | `timingSafeEqual` (`route.ts:42`); timing itself is ➖ by nature |
| FR-10 | Length mismatch → 401 without comparing | ✅ | Shorter and longer secrets tested |
| FR-11 | Authenticate before reading `target` | ✅ | Invalid target with a bad secret is 401 |
| FR-12 | No outbound call when unauthenticated | ✅ | |
| FR-13 | Only the five targets | ✅ | |
| FR-14 to FR-18 | Target → workflow file | ✅ | `it.each` over all five |
| FR-19, FR-20 | 400 for missing or invalid target | ✅ | Includes `__proto__`, `constructor`, `toString`, upper case, path fragment |
| FR-21 | File name only from the fixed map | ✅ | Own-property lookup |
| FR-22 | Request body ignored | ✅ | Tested |
| FR-23 | Correct dispatch URL | ✅ | |
| FR-24 | Body `{"ref":"main"}`, no inputs | ✅ | |
| FR-25 | Same headers as `run-agent` | ✅ | Asserted exactly |
| FR-26 | 10 s abort | ✅ | Fake-timer test |
| FR-27 | 204 → 200 with the success body | ✅ | |
| FR-28 to FR-30 | 502 for non-204, network error, timeout | ✅ | 422, 404, 401, network error and abort tested |
| FR-31 | Missing GitHub settings → 500 | ✅ | Implemented as written; see MEDIUM-1 |
| FR-32 | No outbound call then | ✅ | |
| FR-33 | URL-encoded segments | ✅ | |
| FR-34 | Non-trading day → 200 `skipped`, no dispatch | ✅ | |
| FR-35 | Trading day → dispatch | ✅ | |
| FR-36 | Calendar failure → dispatch | ✅ | Helper rejection and the helper's own fallback |
| FR-37 | Calendar slower than 3 s → dispatch | ✅ | Fake-timer test |
| FR-38 | Guard only after auth and target | ✅ | Invalid target never touches the calendar |
| FR-39 | Uses the existing `alpaca.ts` helper | ✅ | `getNextTradingDay`; `alpaca.ts` unmodified |
| FR-40 | Guard covers all five targets | ✅ | As specified; see MEDIUM-2 |
| FR-41, FR-42 | Secret and token never logged | ✅ | Scanned across success, 422, network error, 401 and missing-token paths |
| FR-43 | No headers or GitHub body in logs | ✅ | Only status code or error name are logged |
| FR-44 | Failures log only status or error class | ✅ | |
| FR-45 | No env value in any response | ✅ | Generic bodies checked |
| FR-46 | One log line per authenticated request with target and outcome | ⚠️ | Dispatched, skipped and failed paths log the outcome line. A 400 (invalid target) logs nothing on purpose, to avoid logging caller-controlled text, and a failed dispatch logs a second line with the status. See LOW-1 |
| FR-47, FR-48 | No `claude-agent` import, no cycle run | ✅ | Source scanned by test |
| FR-49 | `dynamic = 'force-dynamic'` kept | ✅ | |
| FR-50 | `maxDuration = 15` | ✅ | |
| FR-51 | `run-agent` and `RunAgentButton` unchanged | ✅ | `git diff` empty |
| FR-52 | `middleware.ts` unchanged and exact exemption | ✅ | `middleware.ts:31` compares the path strictly |
| NFR-01 | File <800 lines, functions <50 | ✅ | 158 lines; longest function ~30 |
| NFR-02 | No `any` | ✅ | |
| NFR-03 | Named constants | ✅ | |
| NFR-04 | No dependency | ✅ | Uses `node:crypto` only |
| NFR-05 | ≥80% coverage | ✅ | 100% lines, 97.1% branches |
| NFR-06 | tsc / suite / build | ✅ | |
| NFR-07 | Worst case under `maxDuration` | ✅ | 3 s + 10 s = 13 s < 15 s |
| NFR-08 | No forbidden file needed for tests | ✅ | |
| C-01 | No Protected Zone change | ✅ | |
| C-02 | Listed files unmodified | ✅ | `git status`: the route, the new test and the spec folder |
| C-03 | No real dispatch | ✅ | |
| C-04 | No in-memory duplicate guard | ✅ | |
| C-05 | No secret in the repo | ✅ | Test values are fake placeholders |
| C-06 | `.env.example` only if it exists | ✅ | It does not exist; untouched |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | The route no longer imports it |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A: no agent code touched; the cycle is no longer run inside the route |
| Supabase patterns | ✅ | N/A: no query added |
| TypeScript quality | ✅ | No `any`, no mutation, named constants, both comments explain a non-obvious WHY |
| Security | ✅ | Fail-closed on missing secret; constant-time comparison; closed target map with own-property check; no secret or token in logs or responses; outbound URL built from fixed host and encoded segments |

## Task Checklist

- Implementation tasks: 25/25 completed
- Pre-implementation: 4/4 checked
- Post-implementation: 3 items. "Run /review" and "Confirm Protected Zone files unchanged" are covered by this report;
  the post-deploy manual `target=health` check can only happen after deployment and configuration, so it stays open by design.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **`GITHUB_OWNER` / `GITHUB_REPO` are mandatory.** The dashboard button defaults them (`run-agent/route.ts:10-11`) and only
   needs the token. If Vercel production defines only `GITHUB_TOKEN`, the button works while every scheduler call returns
   500. The spec text required all three; the recommended alternative (token required, owner and repo defaulted like the
   button) is a three-line change. Check the Vercel variables before enabling the schedule.
2. **The trading-day guard also covers `weekly`.** A Friday market holiday (for example Good Friday) skips that week's
   report, and a call is not repeated by anything. Excluding `weekly` from the guard would avoid it.
3. **Nothing was exercised against real services.** The first real signal will be the manual `target=health` call after
   `CRON_SECRET` is set in Vercel and the redeploy; until then a missing or mistyped secret would simply answer 503/401.

### LOW (optional)
1. FR-46 is literally met only for dispatched, skipped and failed requests. A 400 logs nothing (by design), and a failed
   dispatch writes the status line plus the outcome line. Cosmetic.
2. `getNextTradingDay` logs a `[CALENDAR_FALLBACK]` warning with the error object when Alpaca fails; that object can carry
   Alpaca's response text (not a secret). It is outside the route and was left alone because `alpaca.ts` is forbidden.
3. 503 is returned before 401, so an unauthenticated caller can learn whether the secret is configured. Accepted in the spec.
4. `CLAUDE.md:104` still says this endpoint "triggers `runAgentCycle()`". The documentation is now wrong; updating it was
   out of scope.
5. The dispatcher token is the same classic `repo`+`workflow` personal access token as the button. Replacing it with a
   fine-grained token limited to this repository's Actions is recommended separately.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. The warnings are configuration and behavior choices to settle
before the external scheduler is switched on (MEDIUM-1 and MEDIUM-2), not defects in the code.

Recommendation before enabling the schedule: confirm which `GITHUB_*` variables exist in Vercel production, decide about
`weekly` on holidays, set `CRON_SECRET`, redeploy, and make one manual `target=health` POST as the first real test.
