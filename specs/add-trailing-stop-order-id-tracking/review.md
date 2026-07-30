# Review Report — Add trailing_stop_order_id Tracking (Data Layer Only)

**Date**: 2026-07-30
**Reviewer**: Claude (automated)
**Status**: BLOCKED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Add nullable `text` column `trailing_stop_order_id` via a new timestamp-named migration, `ADD COLUMN IF NOT EXISTS` | ⚠️ PARTIAL | Migration file `supabase/migrations/20260730130000_add_trailing_stop_order_id_to_open_position_contexts.sql` is correctly written, correctly named, and syntactically matches the existing convention exactly. **But it has not been applied to the live database** — confirmed via read-only query: `open_position_contexts` is still at 12 columns, `trailing_stop_order_id` absent. The requirement is "add a column," which in practice means the column must exist; a written-but-unapplied migration file does not yet satisfy that outcome. This is not a defect in the SQL itself — it's an execution gap, honestly disclosed in `tasks.md` T-06 and the completion report. |
| FR-02 | Add `trailingStopOrderId?: string \| null` to `OpenPositionContext`, right after `stopOrderId` | ✅ SATISFIED | Confirmed at `types.ts:188`, exact position, exact type. |
| FR-03 | Extend `updatePositionContext()`'s `.update({...})` with `trailing_stop_order_id: updates.trailingStopOrderId` as a 4th field | ✅ SATISFIED | Confirmed at `db.ts:212-215` — all 3 original fields byte-identical, 4th field added exactly as specified. |
| FR-04 | Extend `saveOpenPositionContext()`'s upsert with `trailing_stop_order_id: ctx.trailingStopOrderId ?? null` | ✅ SATISFIED | Confirmed at `db.ts:167`, immediately after `stop_order_id`, exact pattern, correct variable name (`ctx`, verified against the actual function signature rather than assumed). |
| FR-05 | `stop_order_id`/`stopOrderId` left untouched everywhere | ✅ SATISFIED | Confirmed via diff — both existing lines (`db.ts:166`, `types.ts:187`) unmodified; new lines added immediately adjacent, never replacing or merging with them. |
| FR-06 | (Pointer to design.md Open Questions re: `mapRowToOpenPositionContext()`) | ✅ SATISFIED | Open Question was surfaced, put to the user directly (not assumed), resolved in favor of inclusion, and implemented at `db.ts:186`. This is the correct process for a genuine scope ambiguity the originating prompt didn't address. |
| NFR-01 | `tsc --noEmit` — zero errors | ✅ SATISFIED | Confirmed clean. |
| NFR-02 | `npm run build` — zero errors | ✅ SATISFIED | Confirmed clean, all routes compiled. |
| NFR-03 | All existing tests pass unmodified | ✅ SATISFIED | Full suite: 29 files, 297/297 tests passed. The 6 files specifically flagged in requirements.md STEP 0 were also run individually first (64/64) — thorough, not just a full-suite rubber stamp. |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | `db.ts` treated with Protected-Zone-equivalent care, authorization in effect | ✅ SATISFIED | Consistent with this session's established practice for the Bug 1 series. |
| C-02 | No changes to `claude-agent.ts`, `alpaca.ts`, `risk-manager.ts`, `indicators.ts`, `learning.ts` | ✅ SATISFIED | `git status` confirms none of these appear in the diff. |
| C-03 | No order-submission/replacement logic | ✅ SATISFIED | Nothing of the sort added — purely a field addition. |
| C-04 | New column nullable, no default, no `NOT NULL` | ✅ SATISFIED (in the file) | The migration SQL itself correctly has none of these — verified by reading the file. Cannot verify this property live since the column doesn't exist yet (see FR-01). |
| C-05 | No existing migration file modified or renamed | ✅ SATISFIED | Only one new file created; `ls`/`git status` confirm no existing migration touched. |
| C-06 | The 3 existing `updatePositionContext()` fields written exactly as before | ✅ SATISFIED | Confirmed via diff — only alignment whitespace changed (to keep the object's `:` columns visually aligned per existing style), no logic or value change. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |
| `.env` / `.env.local` | UNTOUCHED | — |
| `vercel.json` | UNTOUCHED | — |
| DB migration | **CREATED** (not yet applied) | Listed in design.md's Database Changes section; authorized. See CRITICAL finding below regarding sequencing before deploy. |
| `src/lib/types.ts` | MODIFIED | Not in `CLAUDE.md`'s formal Protected Zone list; listed in design.md's Impact table; authorized. |
| `src/lib/db.ts` | MODIFIED | Not in `CLAUDE.md`'s formal Protected Zone list; treated with equivalent care per session precedent; listed in design.md's Impact table; authorized. |

No unauthorized Protected Zone changes found.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` untouched; nothing here relates to Claude's decision schema. |
| Supabase patterns | ✅ SATISFIED | Goes through `db.ts` exclusively, service-role client, unchanged `if (error) throw ...` on both touched functions, no `.limit()` concern (single-row upsert/update by `symbol` key, not a bulk read). One thing to flag under Findings below: the new column has no RLS-relevant implication since RLS is table-level and already enabled on `open_position_contexts` — not re-verified live in this review since the column doesn't exist yet, but the migration doesn't touch RLS policies at all, so no new exposure is introduced. |
| TypeScript quality | ✅ SATISFIED | No `any` — the two new casts (`row.trailing_stop_order_id as string \| null`) mirror the exact established pattern for `stop_order_id` on the adjacent line, same type-safety level as everything else in that function. No mutation — both touched functions already returned/sent new objects; nothing here changes that. `db.ts` is now 766 lines (was 765) — negligible growth, still the largest file worth watching but not newly problematic. Both touched functions remain well under 50 lines. |
| Security | ✅ SATISFIED | No secrets, no injection surface (Supabase client parameterizes all values), no sensitive data in any log line touched by this diff (none were touched). |

## Task Checklist

- Completed: 12/12 implementation tasks (T-01–T-12), 3/3 pre-implementation checks, 1/2 post-implementation checks (the `/review` line is satisfied by this report). **T-06 is marked complete but documents an unresolved blocker rather than a clean pass** — see CRITICAL finding.

## Findings

### CRITICAL (blocks merge)
- **The migration has not been applied to the live database, and the code that now depends on the new column has no execution-order safeguard.** `saveOpenPositionContext()` and `updatePositionContext()` will now send a `trailing_stop_order_id` key on every write to `open_position_contexts`. Supabase/PostgREST rejects insert/update/upsert payloads that reference a column not present in its schema cache (`PGRST204`-class error) — both functions already `throw` on any Supabase error. Concretely: if this diff is deployed (pushed to `main`, then picked up by the next scheduled cron run within the hour, per `SDD.md`'s documented `agent-cron.yml`/`agent-exits.yml` schedule) **before** the migration is applied, every `saveOpenPositionContext()` call (every new BUY) and every `updatePositionContext()` call (every open position, every cycle, inside the trailing-stop block) will start throwing. Given `updatePositionContext()` is called unconditionally for every open position on every exit-rules pass, this would degrade or break trailing-stop tracking for all currently-open positions the next time the cron runs — a live-trading-impacting regression, not a cosmetic one. **This must not be pushed/merged until the migration SQL has been applied manually** (Supabase Studio SQL editor, or `supabase db push` with real credentials) — confirmed via a fresh read-only column count showing 13 columns — or until the deploy is explicitly sequenced so the migration lands first. This was honestly surfaced by the implementation itself (T-06, and the completion report's ⚠️ callout) — flagging it here formally so it blocks the review rather than being missed in the rush to the next `git push`.

### HIGH (should fix)
- None beyond the above — there is no second, independent HIGH-severity issue; the migration-sequencing gap is the sole blocker and is already CRITICAL.

### MEDIUM (consider fixing)
- None.

### LOW (optional)
- `db.ts` continues to grow (now 766 lines) without a natural seam for splitting yet — not a defect of this change, just a data point worth having if/when the file crosses further into unwieldy territory.

---

## Decision

**BLOCKED** — Must fix before merge:
- Apply `supabase/migrations/20260730130000_add_trailing_stop_order_id_to_open_position_contexts.sql` to the live database (or otherwise guarantee it lands before this code runs against production), then re-verify via a read-only query that `open_position_contexts` has 13 columns with `trailing_stop_order_id` present and `null` on all current rows. Once that's confirmed, this spec's code changes are correct as written and this finding is the only thing standing between "implemented" and "safe to ship."
