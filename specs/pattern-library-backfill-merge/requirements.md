# Requirements — Backfill: Merge the 19 Traceable pattern_library Rows by pattern_key

## Context

Confirmed via re-verification immediately before writing this spec (not a stale reference to the
prior diagnostic): of `pattern_library`'s pre-existing rows (created before Prompt 2a's matching
fix went live), exactly **19** are traceable to a `trade_evaluations` row with a real, non-null
`stateFingerprint`, grouping into **8 final rows** by computed `pattern_key` (6 groups of 2+ rows
that should merge, 2 unique rows that just get `pattern_key` set). This is byte-identical to the
original diagnostic's finding — no drift.

**Important, newly-confirmed scope boundary**: since Prompt 2a went live, one new trade (FCX,
`pat_1784819620954_FCX`) closed and was correctly processed by the new forward-matching logic —
it already carries a real `pattern_key` (`TREND_ZLE05|CONTINUATION|MID|POSITIVE`) and happens to
share a key with one of the 19 (`pat_1784569060842_CVX`), but is **not** one of the 19 — it's a
product of the already-working forward fix, not a pre-existing row needing backfill. This spec's
scope is explicitly the 19 pre-existing rows only; whether a future backfill run (or this one)
should also fold in such newly-arrived rows is called out as an open question in `design.md`, not
resolved here.

Confirmed via direct schema query: `pattern_library` has **no `created_at` column** — only
`updated_at` (defaulting to `now()`, and also explicitly set by the application on every write).
For these specific rows (`sample_count=1`, never updated since their single write), `updated_at`
is a valid proxy for creation time. Every requirement and task below that references "earliest
created" means `updated_at`, substituting for the non-existent `created_at` column named in the
originating request.

This is a **data-only** change — no schema modification (the `pattern_key` column and index
already exist from Prompt 2a), no application code file is created or modified.

## Functional Requirements

FR-01: The system shall compute a `pattern_key` for each of the 19 traceable rows, derived from
its originating trade's `stateFingerprint`, using the same derivation already implemented in
`buildPatternKey()`.
FR-02: Where two or more of the 19 rows compute the same `pattern_key` and share the same
`action`, the system shall treat them as one merge group.
FR-03: For each merge group, the system shall designate the group's row with the earliest
`updated_at` value as the surviving row.
FR-04: The system shall set the surviving row's `sample_count` to the sum of its merge group's
individual `sample_count` values.
FR-05: The system shall set the surviving row's `win_count` to the sum of its merge group's
individual `win_count` values.
FR-06: The system shall set the surviving row's `win_rate` to its recomputed `win_count` divided
by its recomputed `sample_count` — not a sum or average of the group's individual `win_rate`
values.
FR-07: The system shall set the surviving row's `avg_pnl_pct` to the weighted average of its merge
group's individual `avg_pnl_pct` values, each weighted by that row's own `sample_count`.
FR-08: The system shall set the surviving row's `pattern_key` to the group's shared computed key.
FR-09: The system shall leave the surviving row's `description`, `example_reasoning`, `id`, and
`updated_at` at their own pre-existing values — unchanged by the merge.
FR-10: The system shall delete every non-surviving row in a merge group after the surviving row's
update is applied.
FR-11: Where one of the 19 rows computes a `pattern_key` shared by no other row among the 19, the
system shall update only that row's `pattern_key` column, changing no other column.
FR-12: The system shall apply all updates and deletes for this backfill as a single atomic
operation — either every change is applied, or none is.
FR-13: The system shall not modify any of the other 46 pre-existing `pattern_library` rows (38
traceable-but-no-fingerprint + 8 untraceable) in any way.
FR-14: The system shall not modify any `trade_evaluations` row.
FR-15: The system shall not modify any application code file.

## Non-Functional Requirements

NFR-01: The backfill shall be verifiable via a full before/after column comparison of every
affected row, plus a full column comparison confirming the 46 out-of-scope rows are byte-identical
pre- and post-backfill.
NFR-02: The recomputed `win_rate` and `avg_pnl_pct` for at least one merged group shall be
independently verifiable against a manual calculation before the backfill is considered complete.

## Constraints

C-01: This feature touches live `pattern_library` data — per `CLAUDE.md`'s File Permission Matrix
("Any DB migration"/data change), this requires explicit Amaury authorization; explicitly
authorized in the originating request.
C-02: This feature must not modify the `pattern_library` schema (no new column, no migration) —
`pattern_key` and its index already exist from Prompt 2a.
C-03: This feature must not modify Prompt 2a's forward-matching logic (`buildPatternKey()`,
`updatePatternLibrary()`) in any way.
C-04: This feature must not create or modify any application source file, test file, or script
file — this is a live-data operation only, not a code change.
C-05: This feature must not touch the 46 out-of-scope `pattern_library` rows.
C-06: This feature must not touch any `trade_evaluations` row.

## Out of Scope

- Whether newly-arrived rows created by Prompt 2a's forward-matching logic since it went live
  (e.g. the FCX row) should be folded into this merge — flagged as an open question, not decided
  here.
- Any change to Prompt 1/2's minimum-sample-size gate or its interaction with the newly-merged
  rows' higher `sample_count` values (the gate already handles any `sample_count`, including
  values above its threshold, with no special-casing needed).
- Backfilling any of the 46 out-of-scope rows, now or later.
- Any retroactive correction to `description`/`example_reasoning`/`conditions` text quality — the
  survivor's existing text is kept as-is by design (C-03 of the originating request).
