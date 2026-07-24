# Tasks — Backfill: Merge the 19 Traceable pattern_library Rows by pattern_key

## Pre-Implementation

- [ X] Amaury has reviewed and approved this spec
- [ X] Protected Zone changes confirmed (if applicable) — N/A, no code/config file touched; the
      live-data change itself is explicitly authorized in the originating request
- [ X] Database migrations drafted (if applicable) — N/A by design (see `design.md` Alternatives:
      this is deliberately NOT a migration file — a one-time, row-specific data operation)
- [ X] **The FCX open question in `design.md` is explicitly resolved** — confirm whether
      `pat_1784819620954_FCX` is included in the `TREND_ZLE05|CONTINUATION|MID|POSITIVE` merge
      group or deliberately left split, before T-05 runs

## Implementation Checklist

### Phase 1 — Immediate pre-flight re-verification (re-run at execution time, not reused from the spec)
- [x] T-01: Re-ran the full trace immediately before any write. Confirmed: still 66 total rows,
      still exactly 20 traceable-with-fingerprint (19 legacy + FCX), same 8 groups, nothing
      changed since the spec was written. Also confirmed no trigger exists on `pattern_library`
      that would auto-touch `updated_at` on UPDATE (checked `information_schema.triggers` — empty
      result), so a plain `UPDATE` without setting `updated_at` satisfies FR-09.
- [x] T-02: Captured a full snapshot of all 20 rows (19 legacy + FCX, per the resolved open
      question — FCX included in the `TREND_ZLE05|CONTINUATION|MID|POSITIVE` merge group) as the
      before-state.

### Phase 2 — Execute the backfill (single atomic operation)
- [x] T-03: Wrote explicit `BEGIN;` … `COMMIT;` SQL: 6 `UPDATE` statements (one per survivor,
      setting `sample_count`/`win_count`/`win_rate`/`avg_pnl_pct`/`pattern_key` to the exact values
      computed in `design.md` — the `TREND_ZLE05|CONTINUATION|MID|POSITIVE` group recomputed to
      include FCX per the resolved open question: sample_count=6, win_count=2,
      win_rate=0.3333333333333333, avg_pnl_pct=-0.17955697150428375), 2 `UPDATE` statements for
      the singletons (pattern_key only), and one `DELETE ... WHERE id IN (...)` for the 12
      non-survivor rows. `id`, `description`, `example_reasoning`, `updated_at` never appear in
      any `SET` clause.
- [x] T-04: Executed as a single transaction against the live database via the Management API —
      status 201, no error.

### Phase 3 — Verification
- [x] T-05: Re-queried `pattern_library` in full. Before=66, after=54, delta=12 — exactly matches
      the 12 rows deleted (6 groups × non-survivors: 3+1+1+5+1+1=12). No unexpected loss/duplication.
- [x] T-06: All 6 merged survivors confirmed matching `design.md`'s precomputed values exactly
      (META: 4/3/0.75/1.436…; CVX(0707): 2/1/0.5/-2.736…; AAL: 2/0/0/-3.576…; XOM(0713): 6/2/
      0.3333…/-0.1796… — recomputed to include FCX per the resolved open question; AMZN: 2/0/0/
      -1.289…; DRAM: 2/1/0.5/0.656…). `id`, `description`, `example_reasoning`, `updated_at`
      byte-identical to each survivor's pre-backfill values on all 6.
- [x] T-07: Both singleton rows (FCX-0708, AMC) now have `pattern_key` set to their computed
      value, with every other column confirmed byte-identical to pre-backfill state.
- [x] T-08: All 12 non-survivor rows confirmed absent from the table post-backfill.
- [x] T-09: All 46 out-of-scope rows re-queried in full and confirmed byte-identical (full
      `JSON.stringify` equality per row, not just row count) to their pre-backfill snapshot.
- [x] T-10: Spot-checked all 6 merged groups' `avg_pnl_pct` (not just one) against the manual
      weighted-average calculations in `design.md` — all match exactly.
- [x] T-11: This backfill executed zero statements against `trade_evaluations` — confirmed by the
      SQL itself (only `pattern_library` appears in any `UPDATE`/`DELETE`).

## Post-Implementation

- [x] Run `/review pattern-library-backfill-merge` to verify the executed backfill matches this
      spec (reviewing live data state, since there is no code diff to review) — APPROVED, see
      `review.md`
- [x] Confirm no application code, migration, or config file was created or modified as a side
      effect of this work — `git status` shows only the new `specs/pattern-library-backfill-merge/`
      directory; the repo working tree is otherwise clean.

## Estimated Complexity

Medium — the SQL logic itself is small and fully specified (8 groups, exact formulas, exact
survivor per group already computed in `design.md`), but this is a live, irreversible data
mutation (DELETE) against production with no automated test suite to lean on — correctness rests
entirely on the pre/post verification queries. The unresolved FCX open question must be settled
before execution, not discovered mid-run.
