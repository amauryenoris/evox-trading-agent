# Requirements — pattern_library Structural Matching Fix (pattern_key)

## Context

Confirmed via two prior read-only diagnostics (this session, not re-verified here):
`updatePatternLibrary()` (`learning.ts:199-246`, unchanged since the diagnostics) matches an
incoming trade against existing `pattern_library` rows via `p.description === patternDescription`
— free-text prose Claude regenerates per trade, which is why 65/65 live rows are stuck at
`sample_count = 1` since inception. `patternConditions` (the other Claude-generated field) was
separately confirmed equally unreliable as a match key (the two functionally-identical XOM
2026-07-14/2026-07-15 trades differ on `rsiBelow: 60` vs. `null`).

What is deterministic: `evaluation.stateFingerprint`
(`{signal_type, spx_regime, market_regime, adx_bucket, z_bucket, macd_bucket} | null`), already
computed at `learning.ts:93-104` and carried on the `evaluation` object passed into
`updatePatternLibrary()` (`learning.ts:184`) — currently unused for matching. It can be `null` for
positions whose buy-time indicators predate the fingerprint-writing code.

Confirmed: `pattern_library`'s live schema has no column linking it to `trade_evaluations` — this
prompt does not need one (no backfill here). Confirmed: this project's existing migration style is
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` plus a matching `CREATE INDEX IF NOT EXISTS
idx_{table}_{column}` (e.g. `20260618150431_add_state_fingerprint_to_trade_evaluations.sql`,
`20260708191525_create_position_health_snapshots.sql`) — this spec follows that exact convention.

This prompt (2a) is forward-matching only. Backfilling the 19 existing rows that are traceable
with a real fingerprint is a separate, later prompt (2b) and explicitly out of scope here — no
existing `pattern_library` row's `pattern_key`, `sample_count`, `win_count`, or `win_rate` changes
as a result of this work.

## Functional Requirements

FR-01: The system shall store a `pattern_key` column on `pattern_library`, nullable, alongside its
existing columns.
FR-02: The system shall derive a pattern key from a trade's `stateFingerprint` by combining its
`signal_type`, `z_bucket`, `adx_bucket`, and `macd_bucket` fields into a single deterministic
string.
FR-03: The system shall produce a `null` pattern key when the trade's `stateFingerprint` is `null`.
FR-04: The system shall match an incoming trade against an existing `pattern_library` row by
comparing pattern keys (and `action`), not by comparing `description`.
FR-05: The system shall never match a trade whose derived pattern key is `null` against any
existing row — it always creates a new row in this case.
FR-06: The system shall never match a trade whose derived pattern key is a real value against a
row whose stored `pattern_key` is `null`.
FR-07: The system shall store the derived pattern key on a newly-created `pattern_library` row,
including when that key is `null`.
FR-08: The system shall continue generating and storing `description` and `conditions` from
Claude's free-text post-mortem output unchanged, for human-facing display only.
FR-09: The system shall continue updating `sampleCount`, `winCount`, `winRate`, `avgPnLPct`, and
`exampleReasoning` identically to today's logic when a trade matches an existing row by key.
FR-10: The system shall not modify any existing `pattern_library` row's data as a result of this
change — only future writes are affected.

## Non-Functional Requirements

NFR-01: The migration shall use `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`,
matching this project's established migration style.
NFR-02: The pattern-key derivation shall be a pure function with no I/O, testable in isolation.

## Constraints

C-01: This feature modifies `learning.ts` (treated as Protected Zone per prior session's
precedent) and adds a new Supabase migration — per `CLAUDE.md`'s File Permission Matrix, both
require explicit Amaury authorization; explicitly authorized in the originating request.
C-02: This feature must not modify or merge any existing `pattern_library` row — no backfill (that
is Prompt 2b).
C-03: This feature must not modify `description`'s or `conditions`'s own generation, storage, or
display — only their removal from the matching decision.
C-04: This feature must not modify Prompt 1/2's minimum-sample-size gate
(`getRelevantPatterns()`, `PatternLibraryCard.tsx`, `report-generator.ts`).
C-05: This feature must not modify any other table, migration, or application file outside
`pattern_library`'s schema and `learning.ts`'s matching logic (plus the minimal `db.ts` plumbing
needed to persist/read the new column — see design.md).
C-06: This feature must not modify `claude-agent.ts` or any gate/signal-detection/exit-rule logic.

## Out of Scope

- Backfilling or merging any of the 65 existing `pattern_library` rows (Prompt 2b).
- Any table linking `pattern_library` back to `trade_evaluations` (only needed for backfill).
- Changing what `stateFingerprint` itself contains or how it's computed at buy time.
- RLS policy changes on `pattern_library` (out of scope; not touched by adding a nullable column).
