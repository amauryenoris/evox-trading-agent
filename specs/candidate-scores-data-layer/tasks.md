# Tasks — candidate_scores Data-Layer Plumbing

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [x ] Protected Zone changes confirmed — N/A, `stock-selector.ts` and all Protected Zone files are explicitly out of scope
- [ x] Database migrations drafted — yes, drafted in this spec (Part A below); requires Amaury confirmation per CLAUDE.md's "Any DB migration" rule

## Implementation Checklist

### Phase 1 — Migration
- [x] T-01: Create `supabase/migrations/{14-digit timestamp}_add_candidate_scores_to_selection_history.sql` containing exactly `ALTER TABLE selection_history ADD COLUMN IF NOT EXISTS candidate_scores jsonb;` — no RLS statement, following the `trade_evaluations.state_fingerprint` migration's exact precedent

### Phase 2 — Types
- [x] T-02: Add `export interface CandidateScore { symbol: string; score: number; regime: string; risks: string[]; thesis: string }` to `src/lib/types.ts`
- [x] T-03: Add `candidateScores?: CandidateScore[]` as an optional field on `SelectionDecision` in `src/lib/types.ts`

### Phase 3 — Data Layer (db.ts)
- [x] T-04: In `insertSelectionDecision()`, add `candidate_scores: decision.candidateScores ?? null` to the insert object
- [x] T-05: In `getRecentSelections()`, add `candidateScores: row.candidate_scores ?? undefined` to the returned mapping

### Phase 4 — Testing
- [x] T-06: Add a test (e.g. `src/lib/__tests__/db.selection-history-candidate-scores.test.ts`, following the `db.trade-evaluations-fingerprint.test.ts` naming precedent) covering: `insertSelectionDecision()` with `candidateScores` present writes the correct `candidate_scores` payload
- [x] T-07: Add a test covering: `insertSelectionDecision()` without `candidateScores` writes `candidate_scores: null`
- [x] T-08: Add a test covering: `getRecentSelections()` correctly maps a row with `candidate_scores` populated back onto `candidateScores`
- [x] T-09: Add a test covering: `getRecentSelections()` correctly maps a row with `candidate_scores: null` (the pre-existing-row case) to `candidateScores: undefined`, without error

## Post-Implementation

- [x] Run `/review candidate-scores-data-layer` to verify implementation matches spec — APPROVED WITH WARNINGS, see review.md
- [ ] Apply the migration to the live database (requires Amaury's explicit go-ahead to run against the actual Supabase project, per CLAUDE.md's migration confirmation rule — drafting the file and applying it are separate approvals) — **NOT YET DONE, migration file drafted only**
- [x] Run `npx tsc --noEmit` and `npm run build` — both must pass
- [x] Confirm Protected Zone files unchanged
- [x] Confirm `stock-selector.ts` unchanged
- [x] Confirm no existing test assertions were modified

## Estimated Complexity

Low — one new nullable column with no RLS implications, one new type plus one optional field, and two small additive lines in already-existing functions. No new call sites, no behavior change to anything currently running. The only genuinely new judgment call is picking the migration's timestamp and confirming it applies cleanly against the live database.
