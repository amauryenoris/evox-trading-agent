# Review Report — Fix RejectedSetups' Stale Filter + Broaden to Spread Gate and MR_RANGING_ADX_GATE

**Date**: 2026-09-18
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Include `TREND_ZGT125`-prefixed rows | ✅ SATISFIED | `route.ts:19` — `.or(...)` includes `error.ilike.TREND_ZGT125%`; live-confirmed (MARA, GOOGL rows returned) |
| FR-02 | Include `TREND_QUALITY_FAIL`-prefixed rows | ✅ SATISFIED | Unchanged prefix, still present in the widened filter; live-confirmed (FCX, OXY rows returned) |
| FR-03 | Include `Spread gate`-prefixed rows | ✅ SATISFIED | `route.ts:19` — `error.ilike.Spread gate%` added. No live rows today (consistent with confirmed rarity), but the filter and classification are exercised by unit tests using real sample text |
| FR-04 | Include `MR_RANGING_ADX_GATE`-prefixed rows | ✅ SATISFIED | `route.ts:19` — `error.ilike.MR_RANGING_ADX_GATE%` added; same as above, unit-tested with real sample text |
| FR-05 | Exclude `Liquidity gate`-prefixed rows | ✅ SATISFIED | Not present anywhere in the `.or(...)` filter |
| FR-06 | Exclude the generic `Setup gate: no mean reversion` message | ✅ SATISFIED | Not present anywhere in the `.or(...)` filter |
| FR-07 | Classify each row into exactly one of 4 kinds | ✅ SATISFIED | `route.ts:34-38` — a 4-way ternary chain, mutually exclusive, always resolves to exactly one of the 4 kinds (default branch covers `TREND_ZGT125`) |
| FR-08 | `TREND_ZGT125` badge reflects 1.25, not stale 0.5 | ✅ SATISFIED | `RejectedSetups.tsx` badge renders `'Z>1.25'` for `TREND_ZGT125` |
| FR-09 | `TREND_QUALITY_FAIL` badge keeps "QUALITY" label | ✅ SATISFIED | Unchanged — still renders `'QUALITY'` |
| FR-10 | `SPREAD_GATE` badge, short/clear, reuses `Badge` tone system | ✅ SATISFIED | Renders `'SPREAD'` via the existing `Badge` component, `tone="amber"` (no new styling) |
| FR-11 | `MR_RANGING_ADX_GATE` badge, short/clear, reuses `Badge` tone system | ✅ SATISFIED | Renders `'MR RANGING'` via the same existing `Badge` component/tone |
| FR-12 | Empty-state text drops "trend"-specific wording | ✅ SATISFIED | Changed from `"No trend rejections today"` to `"No rejections today"` |
| NFR-01 | Classification extends the existing prefix-matching pattern, not restructured | ✅ SATISFIED | Still a single ternary chain on `err.toUpperCase().startsWith(...)`, same shape as the original 2-way version, just longer |
| NFR-02 | No new Supabase query/table/index | ✅ SATISFIED | Same single `agent_log` query, same `.select()`/`.gte()`/`.order()`/`.limit()` calls — only the `.or(...)` filter string and the `.select()` column list changed |
| C-01 | Neither file is Protected Zone, no special authorization required | ✅ SATISFIED | Confirmed — neither appears in `CLAUDE.md`'s Protected Zone list; implementation correctly proceeded without an `AskUserQuestion` gate |
| C-02 | No modification to `claude-agent.ts` or any error-message string | ✅ SATISFIED | `git status` confirms `claude-agent.ts` untouched; no error-message string literal was changed, only read/matched differently |
| C-03 | No modification to `AgentReasoningLog.tsx` / Analytics tab | ✅ SATISFIED | Not in `git status`'s modified list |
| C-04 | No modification to polling interval, `Card` component, or other Intelligence-tab files | ✅ SATISFIED | `RejectedSetups.tsx`'s `setInterval(fetchRejected, 60_000)` line is untouched (confirmed via diff — that line doesn't appear in the changed hunks); `ui.tsx` (the `Card`/`Badge` source) not in `git status` |
| C-05 | No Liquidity gate / generic Setup gate coverage added | ✅ SATISFIED | Same as FR-05/FR-06 |

**19/19 requirements and constraints satisfied. 0 violations, 0 partials.**

---

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
| .env / .env.local | UNTOUCHED | — |
| vercel.json | UNTOUCHED | — |
| DB migrations | NONE | No migration — pure query/display change |

No Protected Zone file touched; this spec correctly required no Amaury confirmation gate, consistent with `design.md`'s "None" Protected Zone Impact assessment.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | No Claude API interaction anywhere near this change — pure Supabase read + dashboard display |
| Supabase patterns | ✅ SATISFIED (with one pre-existing-bug note) | Error checked (`if (error) throw new Error(error.message)`), `.limit(100)` present (unchanged), single query, no `any` cast on query results. **Note**: this route uses a route-local `createClient()` rather than going through `src/lib/db.ts` as `supabase-patterns.md` prescribes for "all DB operations" — this is a **pre-existing** pattern deviation (present before this change, not introduced by it, and explicitly out of scope for this fix) |
| TypeScript quality | ⚠️ PARTIAL | No `any` types, no mutation, file well under 800 lines (60). **`GET()` is 55 lines**, slightly over the 50-line function guideline — grew from ~48 lines pre-change due to the legitimate 2-kind classification expansion, not from unrelated bloat. Not a functional defect, but technically exceeds the stated guideline |
| Security | ✅ SATISFIED | No hardcoded secrets (env vars used as before); no new user input path (no request params, GET with no query string); `console.error` logs a generic `[rejected-today]:` prefix + error object, no secrets/PII |

---

## Task Checklist

- Completed: 13/13 implementation tasks (T-01 through T-13)
- Pre-Implementation: 3/3 (spec approval, Protected Zone N/A, migrations N/A)
- Post-Implementation: 1/2 (`Run /review` is the pending item this report resolves; Protected Zone confirmation checked)

Independently re-verified, not just trusted from `tasks.md`:
- `npx tsc --noEmit` → clean, no output
- `npx vitest run` → 47 test files, **437/437 passed**
- `git diff` on both modified files → confirms scope exactly matches the spec: `route.ts`'s `.or(...)` filter, `.select()` column list, and per-row `kind`/`reason` logic; `RejectedSetups.tsx`'s `kind` union, badge label ternary, and empty-state string — nothing else in either file changed (the 60s polling interval, `Card`/`Badge` usage, and overall component structure are untouched)

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **`GET()` in `route.ts` is 55 lines, exceeding the project's 50-line function guideline by 5 lines.** Not a functional problem — the growth is entirely the 2 new classification/reason branches the spec explicitly asked for — but worth a note for whoever next touches this file: if a 5th category is ever added, this function should probably be split (e.g. extract the per-row classification into a small helper) rather than grown further in place.

### LOW (optional)
- **Confirmed, not newly introduced**: this route builds its own `createClient()` instead of routing through `src/lib/db.ts`, which `supabase-patterns.md` describes as the project's convention for "all DB operations." This predates the current change (present in the file since at least the last commit that touched it, 2026-05-21) and was correctly left alone — not part of this spec's scope, and refactoring it would have been a silent scope expansion. Flagging only so it isn't mistaken for something this change introduced.
- **The implementation found and fixed a separate, pre-existing, previously-undiscovered bug**: `.select(...)` referenced a non-existent `agent_log.signal_type` top-level column (`signal_type` only exists nested inside `decision.signal_type` in this table; other tables like `open_position_contexts` do have it as a real column, which is likely the source of the confusion), causing this route to 500 on every single request — meaning `RejectedSetups` has probably been silently broken (masked by the frontend's `if (!res.ok) return` swallow, landing on the calm empty state) for months, independent of and in addition to the stale-filter bug this spec targeted. This was explicitly surfaced to the user and fixed only after explicit approval via `AskUserQuestion` before any code was touched — correctly handled per this session's established practice of not silently expanding scope, even for an unrelated one-line fix that blocked verifying the approved change.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. One MEDIUM (a pre-existing-pattern function slightly over the line-count guideline, grown by legitimate new logic) and two LOW/informational notes (a pre-existing Supabase-client convention deviation, correctly left alone; and the separately-discovered-and-fixed `signal_type` 500 bug, correctly gated on explicit approval). The core fix itself is complete, correctly scoped, live-verified against real data, and fully covered by new unit tests for all 4 kinds including the two rare ones. Safe to commit.
