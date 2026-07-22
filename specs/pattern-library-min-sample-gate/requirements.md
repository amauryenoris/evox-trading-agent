# Requirements — Minimum Sample-Size Gate Across All 3 pattern_library Consumers

## Context

Confirmed via two prior read-only diagnostics (this session, not re-verified here): 65/65 live
`pattern_library` rows are stuck at `sample_count = 1`, so every `win_rate` value in the table is
exactly 0% or 100%, never anything else. This reaches three consumers unfiltered:
`buildLearningContext()` (`learning.ts:280-297`, via `getRelevantPatterns()` at lines 266-274) —
which feeds directly into Claude's own prompt via `buildEnrichedPrompt()`'s "YOUR LEARNING
HISTORY" section (`claude-agent.ts`) on every per-symbol analysis; `PatternLibraryCard.tsx:12`,
whose `sampleCount >= 1` filter is a no-op given the current data; and `report-generator.ts:905`,
which already has an incidental `sampleCount >= 2` filter (not `0` — a correction to an earlier
assumption that this consumer was unfiltered) that happens to render nothing today only because
every row is stuck at 1.

Confirmed: no existing minimum-sample-size constant exists anywhere in this codebase to reuse or
conflict with. `config.ts` (the true Protected Zone config file) contains only trading-execution
parameters (`ZSCORE_ENTRY_THRESHOLD`, `MAX_SPREAD_BPS`, `MAX_QUOTE_AGE_SECONDS`,
`INSTRUMENT_BLACKLIST`) — no display/observability thresholds — so a new pattern-library display
threshold does not belong there.

The root cause of why samples never accumulate (an LLM-generated, non-deterministic
match key) is a separate, already-scoped fix (Prompt 2/2) and explicitly out of scope here. This
prompt only changes what is surfaced to the three consumers; it does not touch how patterns are
written or matched.

## Functional Requirements

FR-01: The system shall define a single named minimum-sample-size threshold, reused by all three
`pattern_library` consumers, rather than duplicated as a separate literal in each.
FR-02: The system shall exclude any pattern with `sampleCount` below the threshold from the text
built for Claude's prompt context.
FR-03: The system shall include a pattern with `sampleCount` at or above the threshold in Claude's
prompt context, using its existing formatting, unchanged.
FR-04: Where the dashboard's Pattern Library card renders a pattern with `sampleCount` below the
threshold, the system shall replace its win-rate percentage and progress bar with an explicit
insufficient-data indicator, while still showing the pattern's description and sample count.
FR-05: The system shall render a pattern with `sampleCount` at or above the threshold on the
dashboard using its existing win-rate percentage and progress bar, unchanged.
FR-06: The system shall exclude any pattern with `sampleCount` below the threshold from the weekly
PDF report's "Top Patterns" section.
FR-07: The system shall include a pattern with `sampleCount` at or above the threshold in the
weekly PDF report's "Top Patterns" section, using its existing formatting, unchanged.
FR-08: The system shall not modify how `sampleCount`, `winCount`, or `winRate` are computed or
persisted for any `pattern_library` row.
FR-09: The system shall not modify, delete, or backfill any existing `pattern_library` row.

## Non-Functional Requirements

NFR-01: The minimum-sample-size threshold shall be defined once, as an exported named constant,
and imported by all three consumers — no magic numbers duplicated across files.
NFR-02: The fix shall not introduce any new database query, table, column, or migration.
NFR-03: The three consumers shall apply numerically identical threshold logic — no consumer may
surface a pattern that another consumer would exclude at the same `sampleCount` value.

## Constraints

C-01: This feature modifies `learning.ts` — per `CLAUDE.md`'s File Permission Matrix, this file
required explicit Amaury authorization in a prior session's spec despite not being one of the 3
standard Protected Zone files; treated identically here, and explicitly authorized in the
originating request.
C-02: This feature must not modify the `pattern_library` table schema or any RLS policy.
C-03: This feature must not modify the description-based (or any) pattern-matching logic in
`updatePatternLibrary()` — that is Prompt 2/2, explicitly out of scope.
C-04: This feature must not modify `claude-agent.ts`'s `SYSTEM_PROMPT` schema,
`self_flagged_disqualifying_risk`, or any other previously-added field.
C-05: This feature must not modify any gate, signal-detection, or trade-execution logic — scope is
limited to context/display formatting only.
C-06: This feature must not modify `config.ts`.

## Out of Scope

- The structural pattern-matching fix (why `sampleCount` never exceeds 1) — Prompt 2/2.
- Backfilling or recomputing any historical `pattern_library` row's `sample_count`/`win_rate`.
- Changing `report-generator.ts`'s existing `sampleCount >= 2` filter's *mechanism* beyond
  reconciling its threshold value with the new shared constant.
- Any change to `PatternLibraryCard.tsx`'s top-level `{patterns.length} discovered` header count,
  or to its top-10 slice/ordering logic — only the per-row win-rate-vs-insufficient-data rendering
  branch is in scope.
