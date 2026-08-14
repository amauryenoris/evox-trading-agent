# Review Report — getTradeEvaluations() Whitelist-Drop Fix (Read Path)

**Date**: 2026-08-14
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Include every raw `indicators_at_buy` key in returned `buyIndicators`, not just the 16-field whitelist | ✅ SATISFIED | `db.ts:296` — `...raw,` spread added as the first key; proven by the "extra keys" test covering `spx_price`, `effectiveThreshold`, `sectorRotation`, `sectorRotationContext`, `tp_zscore`, `tp_population_bucket` |
| FR-02 | Preserve exact null-coalescing defaults for the 16 whitelisted fields | ✅ SATISFIED | Lines 297-312 byte-identical to pre-change source; explicit keys placed after the spread so they correctly override it; proven by the "preserves defaults when explicitly null" and "missing key" tests |
| FR-03 | Preserve the `kalman` field's exact quirky defaulting expression unmodified | ✅ SATISFIED | Line 312 (`raw.indicators_at_buy?.kalman ?? raw.kalman ?? null`) is character-for-character unchanged; directly tested |
| FR-04 | Same safe-default `buyIndicators` when `indicators_at_buy` is absent/null | ✅ SATISFIED | `raw = row.indicators_at_buy ?? {}` fallback untouched (line 294); `...{}` spreads to nothing, so behavior is identical to before; tested for both absent-key and explicit-`null` cases |
| FR-05 | `stateFingerprint` mapping unchanged | ✅ SATISFIED | Line 316 untouched; `db.trade-evaluations-fingerprint.test.ts`'s 3 tests re-run and pass unmodified |
| FR-06 | No other field mapping in the returned object changed | ✅ SATISFIED | `git diff` confirms exactly one line added (`+        ...raw,`), zero lines removed or altered anywhere else in the function |
| FR-07 | No other function in `db.ts` modified | ✅ SATISFIED | Diff is a single-line addition inside `getTradeEvaluations()` only |
| FR-08 | `learning.ts` not modified | ✅ SATISFIED | Not present in the diff; `git status` confirms |
| FR-09 | `claude-agent.ts` not modified | ✅ SATISFIED | Not present in the diff; `git status` confirms |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | Add the cast only if `tsc --noEmit` requires it | ✅ SATISFIED | `tsc --noEmit` re-run independently for this review — clean, no errors, and no cast appears anywhere in the diff. Confirms design.md's prediction (based on `getClient()` never parameterizing `createClient()` with a `Database` generic, leaving `row`/`raw` implicitly `any`) was correct. |
| NFR-02 | Tests cover (a) extra-key survival, (b) unchanged core defaults, (c) empty/absent fallback | ✅ SATISFIED | All three explicitly present in `trade-evaluations-buy-indicators-passthrough.test.ts`, plus two additional cases beyond the minimum (a core-key-missing-but-not-whitelisted-empty case, and the `kalman` quirk case) |
| NFR-03 | 3 existing `db.trade-evaluations-fingerprint.test.ts` tests pass unmodified | ✅ SATISFIED | Re-run independently for this review, all 3 pass, file untouched in the diff |

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
| .env / .env.local | UNTOUCHED | — |
| vercel.json | UNTOUCHED | — |
| src/lib/db.ts | MODIFIED | Correctly identified in design.md as **not** part of CLAUDE.md's Protected Zone (absent from both the core 4-file list and the "Confirm with Amaury" table) — no unauthorized-change flag applies; this was routed through the spec workflow for consistency/auditability only, per C-01 |
| DB migrations | NONE | Per Database Changes: none needed |

No Protected Zone violations. `db.ts`'s status was correctly and transparently characterized in both design.md and this review — not overclaimed as pre-authorized, not silently skipped either.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` untouched; this fix is a pure read-mapping change in the data-access layer |
| Supabase patterns | ✅ (with a pre-existing note) | `if (error) throw` pattern untouched and already present (line 281); `.limit()` already present on the query (line 276), unaffected. No *new* `any` cast was introduced by this change — but `row`/`raw` were *already* implicitly `any` before this fix (root cause: `getClient()`/`getServiceClient()` never parameterize `createClient()` with a generated `Database` type anywhere in the file, not something introduced or worsened here). Flagged as informational, not a defect of this change. |
| TypeScript quality | ✅ | No `any` written explicitly anywhere in the new test file (grep-confirmed); no mutation — the fix returns a new object via spread, same as the code it replaces; function size unchanged; `db.ts` is 770 lines, still under the 800-line guideline |
| Security | ✅ | No secrets, no SQL injection vectors, no sensitive data in the pre-existing `console.warn` this function already had (unchanged, logs only a row id) |

## Task Checklist

- Completed: 13/13 implementation tasks (T-01 through T-13)
- Pre-implementation: 3/3 checked (spec approved — minor checkbox formatting `[x ]`, clearly intentional per session context; Protected Zone status correctly documented; DB migrations N/A)
- Post-implementation: 1/2 — "Confirm no other function changed" checked and independently re-verified below; "Run /review" is the current step, satisfied by this report

## Verification Commands Run (independently re-executed for this review)

- `npx tsc --noEmit` → clean, no errors, confirms no cast was needed
- `npx vitest run` → 326/326 tests passed (34 test files), including all 6 new `trade-evaluations-buy-indicators-passthrough.test.ts` tests and the 3 pre-existing `db.trade-evaluations-fingerprint.test.ts` tests
- `git status --porcelain` → confirms only `src/lib/db.ts` (modified) and `src/lib/__tests__/trade-evaluations-buy-indicators-passthrough.test.ts` (new) belong to this feature
- `git diff --stat -- <all 7 CLAUDE.md Protected Zone files> .env .env.local vercel.json` → no output (all untouched)
- `git diff src/lib/db.ts | grep -E "^[+-]"` (excluding hunk headers) → confirms the diff is exactly 1 added line, 0 removed — matching the spec's minimal-diff intent precisely

## Findings

### CRITICAL (blocks merge)
None.

### HIGH (should fix)
None.

### MEDIUM (consider fixing)
None.

### LOW (optional)
- `row`/`raw` throughout `getTradeEvaluations()` (and, by inspection, the rest of `db.ts`) are implicitly `any` because `createClient()` is never given a generated Supabase `Database` type. This is a pre-existing, file-wide condition — not introduced by this change — but it's worth naming as context: it's precisely what allowed the original 16-field whitelist to silently diverge from what's actually written for as long as it did (no compile-time signal when a written key isn't read back). Not in scope for this spec; noted for potential future follow-up (generating and wiring a `Database` type would make this entire class of bug compile-time-detectable).
- This spec's explicit "Out of Scope" list already correctly identifies the twin `getAgentLog()`/`getAgentLogPrioritized()` whitelist-drop functions in the same file as a known, related, unaddressed gap — carrying that forward here rather than re-flagging it as new.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. All 9 functional requirements and all 3 non-functional requirements are satisfied. The implementation is a minimal, exactly-scoped single-line addition, independently confirmed via `tsc`, the full test suite, and a line-level diff review. `db.ts`'s Protected Zone status was handled transparently rather than assumed either way. Ready to commit.
