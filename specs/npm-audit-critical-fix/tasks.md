# Tasks — Clear the Critical npm audit Finding Blocking CI

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — **None required.** Only `package.json`/`package-lock.json` are touched; neither is a Protected Zone file or on the broader confirm-list.
- [x] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Re-confirm the live state (per C-06 — do not trust the spec's captured snapshot blindly)

- [x] T-01: Run `npm ls next @anthropic-ai/sdk vitest esbuild brace-expansion` and record the current versions (FR-01).
- [x] T-02: Run `npm audit fix --dry-run` fresh; compare its output against the snapshot in `requirements.md`'s Background. If it differs, re-evaluate T-03's gate against the *fresh* output, not the spec's captured one.
- [x] T-03: Gate check (FR-03/FR-04): confirm every planned change is non-major AND `@anthropic-ai/sdk` does not appear. If either check fails, STOP — do not apply any fix — and report the available patched versions instead (FR-04).

### Phase 2 — Apply the fix

- [x] T-04: Run `npm audit fix` (no `--force`) (FR-03, FR-05).
- [x] T-05: Confirm via `git status`/`git diff --stat` that only `package.json` and `package-lock.json` changed (C-01).
- [x] T-06: Confirm `@anthropic-ai/sdk`'s version in `package-lock.json` is byte-identical to what T-01 recorded (FR-06, C-03).

### Phase 3 — Verification

- [x] T-07: Run `npm audit --audit-level=critical` — must exit 0. Show the output tail (FR-07).
- [x] T-08: Run `npm audit` (no level filter) — report every remaining finding and its severity (FR-08). Expected: 4 moderate + 1 low remain (`@anthropic-ai/sdk`, `vitest`, `@vitest/mocker`, `@vitest/coverage-v8`, `esbuild`) — confirm this expectation or report any difference.
- [x] T-09: Run `npx tsc --noEmit` — must be clean (FR-09).
- [x] T-10: Run the full test suite — must pass with no regressions (FR-10).
- [x] T-11: Run `npm run build` — must complete successfully (FR-11).
- [x] T-12: Report before/after versions of `next`, `@anthropic-ai/sdk`, `vitest`, `esbuild`, and `brace-expansion` (FR-12).
- [x] T-13: If locally verifiable, confirm an unauthenticated request to `/api/*` returns 401 and a request to `/dashboard` redirects (FR-13). If not locally verifiable (e.g. no local server running, no auth fixture), state explicitly that this was skipped and why — do not simulate or assume the result.
- [x] T-14: Run `git diff --stat` — confirm it touches exactly `package.json` and `package-lock.json`, nothing else (C-01, C-04, C-05).

## Post-Implementation

- [ ] Run `/review npm-audit-critical-fix` to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Confirm the 5 blocked GitHub Actions workflows (`agent-cron.yml`, `agent-exits.yml`, `daily-bars-sync.yml`, `position-health.yml`, `weekly-report.yml`) resume once this is pushed and their next scheduled/manual run passes the `Security audit` step — this can only be confirmed after merge + a live run, not during `/implement` itself

## Estimated Complexity

**Low** — no code changes, no new dependencies, a single well-scoped `npm audit fix` invocation whose exact effect was already dry-run-verified live during spec-writing to be non-major and free of `@anthropic-ai/sdk`. The only real risk is the live state drifting between spec-writing and implementation (a new advisory publishing in the interim), which is why Phase 1 re-confirms live rather than trusting the spec's captured snapshot.
