# Requirements — /api/cron/run as a secret-protected workflow dispatcher

Scope is `src/app/api/cron/run/route.ts` and its test file. The endpoint stops running the trading cycle inside Vercel
and only dispatches the matching GitHub Actions workflow, the same way the dashboard button does.

## Functional Requirements

### A. Methods

FR-01: The system shall accept POST requests on `/api/cron/run`.
FR-02: The system shall answer a GET request on `/api/cron/run` with status 405 and an `Allow: POST` header.
FR-03: The system shall answer every other HTTP method on `/api/cron/run` with status 405.

### B. Configuration and authentication

FR-04: If `CRON_SECRET` is unset, the system shall answer 503 with a generic body.
FR-05: If `CRON_SECRET` is an empty string, the system shall answer 503 with a generic body.
FR-06: If `CRON_SECRET` is not usable, the system shall make no outbound request.
FR-07: If the `Authorization` header is missing, the system shall answer 401 with a generic body.
FR-08: If the `Authorization` header does not equal `Bearer ` followed by the secret, the system shall answer 401 with a generic body.
FR-09: The system shall compare the presented credential with the secret in constant time.
FR-10: If the presented credential and the secret differ in length, the system shall answer 401 without performing the constant-time comparison.
FR-11: The system shall complete authentication before it reads the `target` parameter.
FR-12: The system shall make no outbound request for an unauthenticated call.

### C. Target selection

FR-13: The system shall accept only the targets `cycle`, `exits`, `health`, `bars` and `weekly`.
FR-14: The system shall map `cycle` to `agent-cron.yml`.
FR-15: The system shall map `exits` to `agent-exits.yml`.
FR-16: The system shall map `health` to `position-health.yml`.
FR-17: The system shall map `bars` to `daily-bars-sync.yml`.
FR-18: The system shall map `weekly` to `weekly-report.yml`.
FR-19: If the `target` parameter is missing, the system shall answer 400.
FR-20: If the `target` parameter is not one of the five names (including `constructor`, `__proto__`, other casing or path fragments), the system shall answer 400.
FR-21: The system shall take the workflow file name only from the fixed map and never from the request.
FR-22: The system shall ignore the request body.

### D. Dispatch

FR-23: The system shall dispatch the mapped workflow with `POST https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/actions/workflows/{file}/dispatches`.
FR-24: The system shall send the body `{"ref":"main"}` and no inputs.
FR-25: The system shall send the same GitHub headers as `src/app/api/run-agent/route.ts` (bearer token, `Accept`, `X-GitHub-Api-Version`, `Content-Type`).
FR-26: The system shall abort the GitHub request after 10 seconds.
FR-27: If GitHub answers 204, the system shall answer 200 with `{"success":true,"target":"<target>","dispatched":true}`.
FR-28: If GitHub answers any other status, the system shall answer 502 with a generic body.
FR-29: If the GitHub request fails with a network error, the system shall answer 502 with a generic body.
FR-30: If the GitHub request times out, the system shall answer 502 with a generic body.
FR-31: If `GITHUB_TOKEN`, `GITHUB_OWNER` or `GITHUB_REPO` is missing or empty, the system shall answer 500 with a generic body.
FR-32: If a GitHub setting is missing, the system shall make no outbound request.
FR-33: The system shall URL-encode the owner, repository and file segments of the GitHub URL.

### E. Trading-day guard

FR-34: If today (New York date) is not a trading day, the system shall answer 200 with `{"success":true,"skipped":"non_trading_day"}` and dispatch nothing.
FR-35: If today is a trading day, the system shall continue to the dispatch.
FR-36: If the Alpaca calendar check fails, the system shall dispatch.
FR-37: If the Alpaca calendar check takes longer than 3 seconds, the system shall dispatch.
FR-38: The system shall run the trading-day guard only after authentication and target validation succeed.
FR-39: The system shall use the helper already exported by `src/lib/alpaca.ts` for the guard.
FR-40: The system shall apply the guard to all five targets.

### F. Secrecy and logging

FR-41: The system shall not write `CRON_SECRET` to any log line.
FR-42: The system shall not write `GITHUB_TOKEN` to any log line.
FR-43: The system shall not write request headers or the GitHub response body to any log line.
FR-44: When the GitHub call fails, the system shall log only the status code or the error class.
FR-45: The system shall not return an environment value, the secret or the token in any response.
FR-46: For each authenticated request, the system shall write one log line containing the target and the outcome (`dispatched`, `skipped` or `failed`).

### G. Cleanup and unchanged neighbors

FR-47: The system shall not import `runAgentCycle` or any module from `claude-agent` in the route.
FR-48: The system shall not run the trading cycle inside the route.
FR-49: The system shall keep `export const dynamic = 'force-dynamic'`.
FR-50: The system shall set `maxDuration` to 15 seconds.
FR-51: The system shall leave `src/app/api/run-agent/route.ts` and `RunAgentButton` unchanged and dispatching `agent-cron.yml`.
FR-52: The system shall leave `middleware.ts` unchanged, exempting exactly the path `/api/cron/run`.

## Non-Functional Requirements

NFR-01: The route file shall stay under 800 lines and every function under 50 lines.
NFR-02: No `any` shall be introduced.
NFR-03: Magic numbers and strings (timeouts, target map, `main`) shall be named constants.
NFR-04: The change shall add no dependency and no `package.json` change.
NFR-05: The route's new code shall have at least 80% line coverage from its tests.
NFR-06: `npx tsc --noEmit`, the full Vitest suite and `npm run build` shall pass.
NFR-07: The worst-case response time shall stay under `maxDuration` (3 s guard + 10 s GitHub = 13 s).
NFR-08: Tests shall not need a forbidden file to be modified.

## Constraints

C-01: No Protected Zone file shall be modified.
C-02: `middleware.ts`, `next.config.js`, `vercel.json`, `run-agent/route.ts`, `RunAgentButton`, `.github/workflows/*`, `alpaca.ts` and `package.json` shall not be modified.
C-03: No real dispatch to GitHub shall be made while implementing or verifying.
C-04: No in-memory duplicate guard shall be added.
C-05: No secret value shall be written to the repository.
C-06: `.env.example` shall be touched only if it already exists (it does not today, so it is not touched).

## Out of Scope

- Creating or configuring the external scheduler (cron-job.org), its schedule, headers, timeout or alerts.
- Setting or generating `CRON_SECRET` in Vercel, and verifying it there.
- Rotating the `GITHUB_TOKEN` personal access token to a narrower one.
- Removing or reducing the GitHub `schedule` triggers.
- Rate limiting, replay protection or de-duplication of calls (the workflows' concurrency group handles overlaps).
- Updating `CLAUDE.md` / `SDD.md` descriptions of this endpoint.
- Any change to the trading cycle, exits, or workflow files.
