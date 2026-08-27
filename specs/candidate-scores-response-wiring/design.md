# Design — Wire Per-Candidate Scores into selectStocksForAnalysis()

## Architecture Decision

This is the second and final half of Buy Scanner Fase 4, confined entirely to `selectStocksForAnalysis()` in `src/lib/stock-selector.ts`. It extends the *instruction* Claude receives (via `SELECTION_SYSTEM_PROMPT`) and the *parsing* of Claude's response, without touching the *selection logic* itself. The already-merged Prompt 2a made `SelectionDecision.candidateScores` a real, optional, correctly-persisted field; this prompt is the only remaining piece — actually asking Claude to produce it and plumbing the parsed value into that field. The selection outcome (which symbols get returned and therefore analyzed/traded) continues to depend solely on `parsed.selected`, completely isolated from `parsed.scores`.

## Data Flow

1. `SELECTION_SYSTEM_PROMPT`'s JSON response instruction gains a `scores` array requirement, describing one `{symbol, score, regime, risks, thesis}` object per candidate actually rendered (Pool A + Pool B, matching what `allCandidates` already represents post-Prompt-1's truncation fix).
2. `max_tokens` rises from 512 to 3000 to accommodate the larger response.
3. Claude's response is parsed exactly as before, with the cast type widened to include an optional `scores?: CandidateScore[]`.
4. `decision.candidateScores` is set to `parsed.scores` (which is `undefined` if Claude omits it — no default substitution needed, since `SelectionDecision.candidateScores` is itself optional).
5. `insertSelectionDecision(decision)` — unchanged call, now sometimes carrying real score data, per Prompt 2a's existing handling.
6. The final two lines — `allSymbolSet` and the `return` statement — are untouched, continuing to derive the function's actual return value only from `allCandidates` and `parsed.selected`. `parsed.scores`/`decision.candidateScores` is never read again after being assigned into `decision`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extend the existing single Claude call's prompt + response (this spec) | One API call per cycle, as today; `scores` describes exactly the same candidate set already rendered in the prompt, so there's no consistency risk between two separate calls seeing different data | Response size grows substantially (one flat array → one flat array + up to ~32 nested objects), `max_tokens` estimate is unvalidated | **Chosen** (confirmed by Amaury) |
| A second, separate Claude call dedicated to scoring | Keeps the selection call small/fast; could be added/removed independently | Doubles API cost and latency per cycle; risks the two calls seeing subtly different candidate data if anything changes between them; no precedent needed since the single-call approach works | Rejected |
| Validate/clamp `parsed.scores` shape before assigning (e.g. filter out malformed entries) | Defensive against a malformed Claude response | Not requested by this spec; `candidateScores` is parallel observability data that is never read by any conditional — a malformed entry can't cause incorrect trading behavior, only imperfect logging data. Adding validation here would be speculative hardening against a problem with no evidence of occurring (YAGNI) | Rejected — matches this spec's minimal-diff mandate |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | `SELECTION_SYSTEM_PROMPT`'s JSON instruction extended with a `scores` array spec; `max_tokens` 512→3000; response-parsing cast widened to include `scores?: CandidateScore[]`; `decision.candidateScores: parsed.scores` added; `CandidateScore` added to the existing type-only import from `./types`. Final two lines of the function untouched. |
| `src/lib/__tests__/stock-selector.test.ts` | MODIFY (additive) | New tests: `scores` parses into `candidateScores`; missing `scores` yields `candidateScores: undefined` without crashing; a `scores` array with values that would change the outcome if consulted does NOT affect the returned watchlist; `max_tokens: 3000` confirmed in the actual API call parameters. |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`.

## Database Changes

None — `db.ts` and the `candidate_scores` column/migration are both already in place from Prompt 2a; this prompt only produces the value that flows into the already-existing pipe.

## Open Questions

None. The 3-round diagnostic already confirmed: `stock-selector.ts`'s exact current state (zero drift across all three checks), `CandidateScore`'s complete absence from this file prior to this change, `SelectionDecision`'s exact current shape (Prompt 2a's field already present and correctly typed), and the exact line numbers for every part of this CHANGE.
