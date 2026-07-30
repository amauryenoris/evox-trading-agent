# Review Report — alpaca-204-empty-body

**Date**: 2026-07-30
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `alpacaFetch<T>()` returns `undefined` on status 204 | ✅ SATISFIED | `src/lib/alpaca.ts:36-38` — `if (res.status === 204) { return undefined as T }`, placed before the `res.json()` call. |
| FR-02 | `alpacaFetch<T>()` still parses/returns JSON for `res.ok` + non-204 | ✅ SATISFIED | `return res.json() as Promise<T>` (line 39) is unchanged and unreachable only when status is 204; all other `res.ok` responses fall through to it exactly as before. |
| FR-03 | `!res.ok` branch throws `Alpaca API error {status}: {body}`, unchanged | ✅ SATISFIED | Diff confirms the `!res.ok` block (lines 32-35) is byte-for-byte unchanged. |
| FR-04 | `cancelOrder()` resolves without throwing on a 204 | ✅ SATISFIED | `cancelOrder()` (line ~174) awaits `alpacaFetch<void>(...)`; with `T = void`, the new branch returns `undefined as void`, so the `await` resolves cleanly. Verified statically — no live caller exists yet to exercise this end-to-end, which is explicitly Out of Scope per the spec. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | Fix scoped to `alpacaFetch()` only | ✅ SATISFIED | Diff touches only lines 36-38 inside `alpacaFetch()`. No other function changed. |
| NFR-02 | No change to JSON-parsing path/return value for the 17 non-204 call sites | ✅ SATISFIED | `res.json()` line and its position relative to `!res.ok` are untouched; the new branch is a pure early-return that only activates on `res.status === 204`, which none of the 17 other call sites' endpoints return. |
| NFR-03 | `tsc --noEmit` and `npm run build` pass | ✅ SATISFIED | Both ran clean (verified in this session's tool output — `tsc --noEmit` produced no output/errors, `npm run build` completed with "Compiled successfully" and finished the TypeScript check). `undefined as T` raised no strictness complaint. |
| NFR-04 | All existing tests pass unmodified | ✅ SATISFIED | `npx vitest run` → 297/297 tests passed across 29 files, no test file edited. |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | No Protected Zone modification | ✅ SATISFIED | See Protected Zone Audit below — `git status` shows only `src/lib/alpaca.ts` and new `specs/` files touched. |
| C-02 | No new `cancelOrder()` call site added | ✅ SATISFIED | Grep/diff confirms no other file was touched; `cancelOrder()` still has zero callers in the repo. |
| C-03 | No other function in `alpaca.ts` modified | ✅ SATISFIED | Diff is a 3-line insertion only, inside `alpacaFetch()`. |
| C-04 | No `claude-agent.ts`/`db.ts`/`types.ts`/`risk-manager.ts`/`indicators.ts`/`learning.ts` changes | ✅ SATISFIED | `git status --porcelain` confirms none of these files appear in the diff. |
| C-05 | Check scoped to `res.status === 204` only, no broader heuristic | ✅ SATISFIED | Implementation uses exactly `res.status === 204`; no `Content-Length` or try/catch-based generalization was added. |
| C-06 | `!res.ok` branch message/behavior unchanged | ✅ SATISFIED | Byte-identical in diff. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No Protected Zone file appears in `git status --porcelain` output; only `src/lib/alpaca.ts` (modified) and the new `specs/alpaca-204-empty-body/` directory (untracked) are feature-related changes.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity (claude-agent.ts) | ➖ N/A | Not touched by this feature. |
| Supabase patterns | ➖ N/A | No DB code touched. |
| TypeScript quality | ✅ | No `any` introduced; no mutation; `alpacaFetch()` remains well under 50 lines (9 lines total); file is 402 lines, well under the 800-line ceiling; no magic numbers (204 is a standard, self-documenting HTTP status code, not a tunable parameter — a named constant would be over-engineering for a one-time status check). |
| Security | ✅ | No secrets, no new external input handling, no logging changes. |
| Alpaca patterns (alpaca-patterns.md) | ✅ | Change is confined to the shared `alpacaFetch()` wrapper as the skill prescribes ("All Alpaca calls go through `src/lib/alpaca.ts`"); no direct REST calls added elsewhere. |

## Task Checklist

- Completed: 7/7 implementation tasks (T-01 through T-07)
- Pre-implementation checkboxes: all 3 marked (spec approval, Protected Zone N/A, DB migration N/A)
- Post-implementation checkboxes: not yet marked (expected — this review is what completes them)

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- No unit test exercises the new `res.status === 204` branch directly (e.g. a mocked `fetch` returning a 204 response asserting `alpacaFetch`/`cancelOrder` resolves to `undefined`). `src/lib/alpaca.ts` has no dedicated test file today, so this isn't a regression, but it is new branch logic shipping with zero test coverage, which sits below this project's stated 80%-coverage/TDD standard. The spec's `tasks.md` did not include a task for this (verification was scoped to reading the code + the existing suite), so this is a spec-scoping gap rather than an implementation defect — worth a follow-up test once `cancelOrder()` gets a real call site in CHANGE 3, ideally alongside that work.

### LOW (optional)
- None

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings; implementation matches the spec exactly (diff is the literal 3-line insertion specified in `design.md`), all constraints and Protected Zone boundaries are respected, and full verification (tsc, build, 297 tests) passed. One MEDIUM finding (missing unit test for the new 204 branch) does not block merge but should be picked up when `cancelOrder()` gains its first caller in CHANGE 3.
