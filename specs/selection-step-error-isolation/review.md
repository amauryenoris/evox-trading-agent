# Review Report — Selection Step Error Isolation (stop_reason diagnostics)

**Date**: 2026-09-10
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Throw `SelectionStepError('claude_call', ...)` when the Claude API call fails | ✅ SATISFIED | `stock-selector.ts` — `client.messages.create(...)` wrapped in `try/catch`; covered by test "step='claude_call'". |
| FR-02 | Throw `SelectionStepError('json_parse', ...)` when the response-type check or `JSON.parse` fails | ✅ SATISFIED | Both the `content.type !== 'text'` guard and `JSON.parse(jsonText)` are inside one `try` block; either failure is caught and rethrown as `json_parse`. Covered by 2 tests. |
| FR-03 | `detail` is `'max_tokens'` when `stop_reason === 'max_tokens'`, not the raw parse error text | ✅ SATISFIED | `const detail = response.stop_reason === 'max_tokens' ? 'max_tokens' : ((err as Error).message ?? String(err))`. Test confirms `detail === 'max_tokens'` and, separately, that a non-`max_tokens` `stop_reason` produces the raw message instead. |
| FR-04 | `response.stop_reason` attached to every `json_parse` error, `max_tokens` or not | ✅ SATISFIED | `response.stop_reason` is passed as the third constructor arg unconditionally in the single `catch`. Test confirms `stopReason === 'end_turn'` in the non-`max_tokens` case. |
| FR-05 | Throw `SelectionStepError('db_write', ...)` when `insertSelectionDecision()` fails | ✅ SATISFIED | Wrapped in its own `try/catch`; covered by test "step='db_write'". |
| FR-06 | `claude-agent.ts`'s catch logs step + detail + `stopReason` (when present) for `SelectionStepError` | ✅ SATISFIED | Verified by code inspection (no `claude-agent.test.ts` exists in this repo — see design.md's Open Questions, resolved). Logic is a direct, mechanical instantiation of the spec's exact snippet. |
| FR-07 | Non-`SelectionStepError` errors log via the `screener_fetch` branch | ✅ SATISFIED | `getMarketMovers()` throws a plain `Error`; `'Not enough screener candidates'` is also a plain `Error` — neither is `SelectionStepError`, so `instanceof` is `false` and the `else` branch fires. Verified by code inspection. |
| FR-08 | Fallback to static `TRADING_WATCHLIST` unchanged on any failure mode | ✅ SATISFIED | `git diff` confirms the `watchlist = (process.env.TRADING_WATCHLIST ?? '...').split(',').map(...).filter(...)` block is byte-identical to the pre-change version, in both branches. |
| NFR-01 | No change to success-path return value, side effects, or Claude call params | ✅ SATISFIED | `model`, `max_tokens: SELECTION_MAX_TOKENS`, `system`, `messages` all unchanged; final `return parsed.selected.filter(...)` line unchanged. |
| NFR-02 | `npx tsc --noEmit` and `npm run build` pass | ✅ SATISFIED | Both independently re-run during this review: `tsc --noEmit` exits clean; full test suite (404/404, 44 files) passes. `npm run build` was verified during implementation (Phase 4, T-15) and the diff since then is test-file-only, so it was not re-run in full during review, but nothing in the diff since T-15 could affect the build. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | **MODIFIED** | Expected — declared in `design.md`'s Impact table and explicitly confirmed by Amaury in-conversation before the edit (not inferred from the spec checkbox alone, per house rule). Diff is exactly the new import line + the body of the existing `catch` block (lines 1161–1167 pre-change) — confirmed via `git diff`, no other line touched. |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

No unauthorized Protected Zone changes. `git status --porcelain` confirms only `src/lib/claude-agent.ts`, `src/lib/stock-selector.ts`, and `src/lib/__tests__/stock-selector.test.ts` were modified for this feature (plus an unrelated pre-existing modification to `specs/gate-constants-hoist/review.md` from a prior session, outside this feature's scope).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | The touched block is the dynamic-watchlist-selection fallback, unrelated to per-symbol Claude analysis or the `action`/`decision` schema. No lines in the action-override or output-schema logic were touched. |
| Supabase patterns | ✅ | No new queries added. `insertSelectionDecision()` call itself is unchanged; only wrapped in `try/catch` that rethrows (as `SelectionStepError`) rather than swallowing — error is never silently discarded. |
| TypeScript quality | ✅ (with 1 LOW note) | No `any` types introduced. No mutation of existing objects. No new magic numbers. `SelectionStepError`'s `step` union type gives compile-time exhaustiveness. See LOW-01 for a minor style note. |
| Security | ✅ | No hardcoded secrets. No new SQL/query surface. The `SelectionStepError` branches now log only `err.detail` (a message string) rather than the previously-logged raw `err` object — narrower, not broader, log surface. |

## Task Checklist

- Pre-Implementation: 3/3
- Implementation (T-01–T-17): 17/17
- Post-Implementation: 1/2 (the "Run `/review`" item completes with this report)

## Findings

### CRITICAL (blocks merge)
None.

### HIGH (should fix)
None.

### MEDIUM (consider fixing)
None.

### LOW (optional)
- **LOW-01** — The `(err as Error).message ?? String(err)` idiom (used 3×, matching the spec's exact wording) casts `unknown` to `Error` without a runtime check. If a non-`Error` value is thrown (e.g. a string), `.message` is `undefined` and the `?? String(err)` fallback correctly catches it, so behavior is safe, but the cast itself is slightly imprecise. Not worth changing — it's the literal pattern the approved spec specified, and the fallback makes it defensively correct.
- **LOW-02** — `selectStocksForAnalysis()` and `claude-agent.ts` both already exceeded the repo's "<50 lines / <800 lines" style guidelines before this change (127 lines and ~2426 lines respectively, pre-existing). This change adds ~20 lines to the former and ~9 to the latter, incrementally worsening an already out-of-scope condition. No action recommended here — refactoring either file was explicitly out of scope for this fix (YAGNI), and splitting them is a separate, larger effort.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
