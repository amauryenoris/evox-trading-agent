# Design — candidate_scores Data-Layer Plumbing

## Architecture Decision

This is pure additive data-layer plumbing: one new nullable jsonb column on an existing table, one new type, one new optional field on an existing type, and two small additions to already-existing read/write functions in `db.ts`. It deliberately stops short of `stock-selector.ts` — no code path populates `candidateScores` yet. This mirrors the project's established "wire the plumbing, populate it later" pattern (same approach used for `sector-rotation.ts` in Buy Scanner Phase 1): the field exists, compiles, and round-trips correctly, but is inert until a separate, later change (Prompt 2b) adds the Claude call that actually produces `CandidateScore[]`.

## Data Flow

1. Migration adds `candidate_scores jsonb` (nullable) to `selection_history` — no data movement, no RLS change (already enabled).
2. `CandidateScore` interface added to `types.ts` — a plain data shape, not yet produced anywhere.
3. `SelectionDecision.candidateScores?: CandidateScore[]` — optional, so every existing construction of a `SelectionDecision` (today, only in `stock-selector.ts`, untouched by this prompt) continues to compile unmodified.
4. `insertSelectionDecision()` — writes `decision.candidateScores ?? null` to the new column. Existing call site (which never sets `candidateScores`) writes `null`, identical in effect to a column that doesn't exist yet from the app's perspective.
5. `getRecentSelections()` — maps `row.candidate_scores ?? undefined` back onto `SelectionDecision.candidateScores`. For all 745 existing rows (column value `null` post-migration), this correctly yields `undefined`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New `candidate_scores` jsonb column (this spec) | Conceptually separate from `candidates_offered` (raw market data vs. Claude-generated analysis); matches existing precedent (`trade_evaluations.state_fingerprint`, added the same way) | One more column | **Chosen** (confirmed by Amaury) |
| Embed scores into each `candidates_offered` object | No new column | Conflates two conceptually different things (what the market data was vs. what Claude concluded about it) in one column; `candidatesOffered`'s meaning would change, violating this fix's own C-06-equivalent boundary | Rejected |
| New separate table (e.g. `candidate_score_history`) | Fully normalized, one row per candidate | Massive overkill for parallel-observability-only data with no query pattern requiring it yet; violates YAGNI | Rejected |
| Wire `stock-selector.ts` in this same prompt | Delivers the full feature in one step | Bundles a low-risk, mechanical data-layer change with a genuinely higher-risk, no-precedent Claude response-shape change (per the diagnostic: no existing call in this codebase returns an array of N structured objects) — makes the higher-risk part harder to review in isolation | Rejected — explicitly split into 2a/2b per Amaury's direction |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/{timestamp}_add_candidate_scores_to_selection_history.sql` | CREATE | `ALTER TABLE selection_history ADD COLUMN IF NOT EXISTS candidate_scores jsonb;` — no RLS statement |
| `src/lib/types.ts` | MODIFY | Add `CandidateScore` interface; add optional `candidateScores?: CandidateScore[]` to `SelectionDecision` |
| `src/lib/db.ts` | MODIFY | `insertSelectionDecision()`: add `candidate_scores: decision.candidateScores ?? null` to the insert object. `getRecentSelections()`: add `candidateScores: row.candidate_scores ?? undefined` to the returned mapping |
| `src/lib/__tests__/*.ts` (new or existing db test file) | MODIFY (additive) | New tests: insert with `candidateScores` present, insert without it (defaults to null), read-back of both cases |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`. It also explicitly does not touch `stock-selector.ts` (out of scope for this prompt, per C-02).

## Database Changes

- `ALTER TABLE selection_history ADD COLUMN IF NOT EXISTS candidate_scores jsonb;` — nullable, no default, no RLS statement (already enabled on this table, confirmed empirically: anon key sees 0 rows, service role sees all 745 rows).

⚠️ This is a DB migration — per `CLAUDE.md`'s File Permission Matrix, "Any DB migration" requires confirmation with Amaury before touching. Given Amaury authored this spec's exact SQL and explicitly confirmed the column/table/no-RLS decision in the prompt context, this confirmation is already satisfied by the spec itself — no additional gate beyond the standard spec-approval checkbox.

## Open Questions

None. The diagnostic already confirmed: `selection_history`'s exact live schema, its RLS status (already enabled), the migration filename/`IF NOT EXISTS` convention, and direct precedent for exactly this kind of change (`trade_evaluations.state_fingerprint`, an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... jsonb` migration with no RLS statement, since `trade_evaluations` was also already RLS-enabled).
