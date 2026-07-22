# Design — Minimum Sample-Size Gate Across All 3 pattern_library Consumers

## Architecture Decision

A single new exported constant in `learning.ts` (`MIN_PATTERN_SAMPLE_SIZE = 5`), consumed at three
independent call sites: `getRelevantPatterns()`/`buildLearningContext()` (`learning.ts`, same
file), `PatternLibraryCard.tsx` (imported), and `report-generator.ts` (imported, replacing its
existing incidental `>= 2` literal). No new files, no schema changes, no new queries — this is a
pure filtering/rendering change layered on top of data that's already fetched by each consumer
today.

## Data Flow

1. `learning.ts` exports `MIN_PATTERN_SAMPLE_SIZE = 5` alongside the existing pattern-library
   functions.
2. **Claude's prompt path**: `getRelevantPatterns()` (`learning.ts:266-274`) filters its returned
   list to `sampleCount >= MIN_PATTERN_SAMPLE_SIZE` before `matchesConditions`-based relevance
   ranking, so `buildLearningContext()` never sees a sub-threshold pattern in the first place — the
   "PATTERNS WITH BEST PERFORMANCE" block (lines 288-297) is built exactly as today, just from an
   already-filtered list. Sub-threshold patterns are simply absent from Claude's context, no
   caveat text, matching the explicit decision that Claude over-indexes on any stated percentage
   regardless of disclaimers.
3. **Dashboard path**: `PatternLibraryCard.tsx` keeps its existing `sampleCount >= 1` filter and
   top-10 slice completely unchanged (so the card doesn't go empty and pattern descriptions stay
   visible to a human reviewer) — but the per-row render branch (currently always showing the
   win-rate percentage + `Progress` bar) gains a conditional: if `p.sampleCount <
   MIN_PATTERN_SAMPLE_SIZE`, render a muted "Insufficient data (n=X)" badge in place of the
   percentage/progress bar; otherwise render the existing win-rate UI unchanged. The card's
   `{patterns.length} discovered` header and the empty-state message are untouched — this is a
   human-facing surface where "we've seen N pattern shapes so far" remains honest and useful
   information, distinct from "here's a statistically meaningful win rate."
4. **PDF path**: `report-generator.ts:905`'s existing `.filter((p) => p.sampleCount >= 2)` becomes
   `.filter((p) => p.sampleCount >= MIN_PATTERN_SAMPLE_SIZE)`, reusing the shared constant instead
   of its own incidental literal — everything else in that section (sort, slice, per-pattern text
   block) is unchanged.
5. Nothing about how `pattern_library` rows are written, matched, or computed changes — `evaluateClosedTrade()`/`updatePatternLibrary()` are untouched, satisfying FR-08/FR-09 and C-03.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Define `MIN_PATTERN_SAMPLE_SIZE` in `learning.ts`, exported | Colocated with the pattern-library logic it gates; matches the originating request's explicit choice; avoids touching the true Protected Zone `config.ts` for a display-only concern | `learning.ts` itself needs the same Amaury authorization `config.ts` would (per C-01), so there's no isolation benefit from a permissions standpoint | **Chosen** |
| Define it in `config.ts` alongside `ZSCORE_ENTRY_THRESHOLD` etc. | Centralizes all tunable constants in one file | `config.ts` today holds only trading-execution parameters that affect order placement; this is a display/observability threshold with no execution impact — mixing the two blurs `config.ts`'s single-source-of-truth purpose per its own header comment | Rejected |
| Dashboard: silently filter sub-threshold patterns out entirely (same treatment as Claude/PDF) | Simplest, fully consistent across all 3 consumers, smallest diff | Given 65/65 live rows are currently n=1, the Pattern Library card would go completely empty today, and its existing empty-state copy ("Patterns appear after 1+ completed trades") would become actively misleading since trades *have* completed — patterns just haven't cleared the bar. Silently loses the qualitative value of pattern descriptions to a human reviewer, which the LLM-anchoring risk (the reason for hiding it from Claude) doesn't apply to | Rejected |
| Dashboard: show an explicit "Insufficient data (n=X)" badge in place of the win-rate bar, per-row, keeping all other rendering unchanged | Preserves the qualitative value (pattern descriptions, sample counts) for a human without implying false statistical confidence; avoids an empty-card regression; matches the request's own suggested alternative for the UI context specifically (the "any stated percentage is treated as evidence" risk is Claude-specific, not applicable to a human reading a labeled badge) | Slightly more UI logic than a pure filter (one conditional branch) | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `src/lib/learning.ts` | MODIFY | Add exported `MIN_PATTERN_SAMPLE_SIZE = 5` constant; filter `getRelevantPatterns()`'s result to `sampleCount >= MIN_PATTERN_SAMPLE_SIZE` before it reaches `buildLearningContext()`. |
| `src/components/dashboard/PatternLibraryCard.tsx` | MODIFY | Import `MIN_PATTERN_SAMPLE_SIZE`; add a conditional per-row render branch showing an "Insufficient data (n=X)" badge instead of the win-rate percentage/progress bar when `p.sampleCount < MIN_PATTERN_SAMPLE_SIZE`. No change to the existing `sampleCount >= 1` filter, slice, or header count. |
| `src/lib/report-generator.ts` | MODIFY | Import `MIN_PATTERN_SAMPLE_SIZE`; replace the literal `2` in the existing `.filter((p) => p.sampleCount >= 2)` (line 905) with the shared constant. |
| `src/lib/__tests__/*` (new file, name decided at implementation time) | CREATE | New tests covering the threshold boundary (sampleCount=4 excluded, sampleCount=5 included) for all 3 consumers, following this project's established "replicate logic inline, don't import from private functions where infeasible" convention — `getRelevantPatterns()`/`updatePatternLibrary()` are exported so direct import/testing is possible here, unlike the private in-`runAgentCycle()` functions elsewhere in this codebase. |

## Protected Zone Impact

⚠️ `learning.ts` is modified — not one of the 3 standard Protected Zone files (`config.ts`,
`claude-agent.ts`, `risk-manager.ts`, `indicators.ts`), but per `CLAUDE.md`'s File Permission
Matrix it required explicit Amaury authorization in a prior session's spec and is treated
identically here — **explicitly authorized in the originating request.** `config.ts`,
`claude-agent.ts`, `risk-manager.ts`, and `indicators.ts` are not touched.

## Database Changes

None — no schema, column, index, RLS, or data change. Purely a display/context-filtering change on
top of already-fetched data.

## Open Questions

None blocking. The dashboard UI treatment (badge vs. silent filter) is resolved above as a design
decision per the originating request's explicit delegation ("choose whichever matches the existing
component's design language, report which was chosen") — no further Amaury input needed before
implementation.
