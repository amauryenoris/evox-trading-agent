# Review Report — candidate_scores Data-Layer Plumbing

**Date**: 2026-08-26
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `candidate_scores` jsonb column on `selection_history`, nullable, via tracked migration | ✅ SATISFIED | `supabase/migrations/20260826151721_add_candidate_scores_to_selection_history.sql` — `ALTER TABLE selection_history ADD COLUMN IF NOT EXISTS candidate_scores jsonb;` |
| FR-02 | `CandidateScore` type with `symbol`/`score`/`regime`/`risks`/`thesis` | ✅ SATISFIED | `types.ts:262-268` — exact field set and types |
| FR-03 | `SelectionDecision` optionally carries `candidateScores: CandidateScore[]` | ✅ SATISFIED | `types.ts:275` — `candidateScores?: CandidateScore[]` |
| FR-04 | Present `candidateScores` persisted to `candidate_scores` | ✅ SATISFIED | `db.ts:387`; verified by test `writes candidate_scores as the provided array when candidateScores is present` |
| FR-05 | Absent `candidateScores` persists `null` | ✅ SATISFIED | `db.ts:387` (`?? null`); verified by test `writes candidate_scores as null when candidateScores is absent` |
| FR-06 | `getRecentSelections()` maps `candidate_scores` → `candidateScores` | ✅ SATISFIED | `db.ts:405`; verified by test `maps a non-null candidate_scores column onto candidateScores` |
| FR-07 | `null` column maps to `undefined`, no error, covers all 745 pre-existing rows | ✅ SATISFIED | `db.ts:405` (`?? undefined`); verified by test explicitly named for "the pre-existing-row case" |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | No runtime behavior change to any currently-running path | ✅ SATISFIED | `stock-selector.ts` untouched (confirmed via `git diff --stat`) — no call site sets `candidateScores` yet, field is inert |
| NFR-02 | No new Alpaca/Anthropic API calls | ✅ SATISFIED | No new imports or dependencies in `db.ts`/`types.ts` |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone untouched | ✅ SATISFIED | Confirmed via `git diff --stat` — none of the 7 Protected Zone files appear |
| C-02 | `stock-selector.ts` not modified | ✅ SATISFIED | Confirmed via `git diff --stat` — absent from the changed-files list |
| C-03 | No RLS statement in the new migration | ✅ SATISFIED | Migration file is a single `ALTER TABLE ... ADD COLUMN` statement, no RLS |
| C-04 | Migration filename convention + `IF NOT EXISTS` | ✅ SATISFIED | `20260826151721_add_candidate_scores_to_selection_history.sql` — 14-digit timestamp, snake_case, `ADD COLUMN IF NOT EXISTS` |
| C-05 | No other field/column mapping changed | ✅ SATISFIED | `candidates_offered`/`selected_symbols`/`reasoning`/`timestamp` mappings byte-identical to before; only one new line added to each function |
| C-06 | `candidatesOffered` construction/meaning unchanged | ✅ SATISFIED | Untouched — lives in `stock-selector.ts`, not modified |
| C-07 | No existing test assertions modified | ✅ SATISFIED | Only a new test file added; no existing test file edited |
| C-08 | `tsc --noEmit` and `npm run build` pass | ✅ SATISFIED | Both verified clean; full suite 356/356 passing (40 files, up from 352 pre-change) |

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

`src/lib/stock-selector.ts` — also explicitly UNTOUCHED, per this spec's own C-02 boundary (verified, not just assumed).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity (claude-agent.ts) | ➖ N/A | File not touched by this fix |
| Supabase patterns | ✅ | `error` checked and thrown in both functions (unchanged, pre-existing pattern preserved); no unbounded query — `getRecentSelections()` retains its existing `.limit(limit)`; `db.ts` remains server-only, no `'use client'` import path introduced |
| TypeScript quality | ✅ | No `any` anywhere in the diff (confirmed via grep); immutable patterns preserved (no mutation, `candidate_scores`/`candidateScores` added via plain object-literal field, not in-place assignment); `db.ts` 780 lines, `types.ts` 402 lines — both under the 800-line ceiling, though `db.ts` is now close to it (pre-existing condition, not introduced by this 2-line change); no magic numbers introduced |
| Security | ✅ | No secrets, no hardcoded credentials; insert goes through the standard Supabase client object-literal (parameterized, no raw SQL/string concatenation); no sensitive data logged |

## Task Checklist

- Completed: 9/9 implementation tasks, 3/3 applicable pre-implementation checks, 4/5 post-implementation checks. The remaining unchecked item — "Apply the migration to the live database" — is *intentionally* left undone per the spec's own separation of "draft" vs. "apply" (tasks.md explicitly notes this requires a further, separate go-ahead from Amaury). Not a gap in this implementation.

## Findings

### CRITICAL (blocks merge)
None

### HIGH (should fix before this reaches production)
- **Deployment-order dependency, not yet resolved.** The migration (`20260826151721_add_candidate_scores_to_selection_history.sql`) is drafted and committed but **has not been applied to the live Supabase database** — `candidate_scores` does not exist as a real column yet. `insertSelectionDecision()` now unconditionally sends `candidate_scores: null` (or a real array, once Prompt 2b wires it) in every insert payload. Traced the call site: `selectStocksForAnalysis()` → `insertSelectionDecision()` is invoked with no local try/catch (`stock-selector.ts:174` — `await insertSelectionDecision(decision)`), but the *caller* (`claude-agent.ts:1048-1062`) wraps the whole dynamic-selection block in try/catch and falls back to the static `TRADING_WATCHLIST` on any error. Net effect if this code ships to production **before** the migration is applied: not a crash, but every single cycle's dynamic stock selection would silently fail and fall back to the static watchlist (logged only as a `console.warn`, easy to miss) — a real loss of the dynamic-selection feature, self-inflicted by deploy-order, until someone notices the warning and runs the migration. This is exactly the scenario CLAUDE.md's "confirm before touching any DB migration" rule exists to prevent. Not a code defect — the fix is procedural: apply the migration to the live database *before* (or atomically with) deploying this commit, not after.

### MEDIUM (consider fixing)
None

### LOW (optional)
- `src/lib/db.ts` is now 780 lines, approaching (but not exceeding) the project's 800-line file-size guideline. Not caused by this change specifically (only +2 lines) — worth keeping in mind for a future file-splitting pass if more selection-history or table-mapping functions are added here, but out of scope for this fix.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL findings; code is spec-compliant and safe to commit. One HIGH finding: this must not be deployed to production until the migration is applied to the live database (or applied in the same release step) — otherwise dynamic stock selection silently degrades to the static watchlist every cycle until noticed.
