# Review Report — daily_bars sync script + workflow (CHANGE 2 of 2 for historical OHLC persistence)

**Date**: 2026-09-04
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Symbol universe = open positions ∪ last-7-days `candidates_offered` symbols | ✅ SATISFIED | `getSymbolUniverse()` (daily-bars-sync.ts:27-48): `getOpenPositionContexts()` + a `selection_history` query filtered `.gte('created_at', sevenDaysAgo)`, flattened into `candidateSymbols`. |
| FR-02 | Deduplicate before fetching | ✅ SATISFIED | `[...new Set([...openSymbols, ...candidateSymbols])]` (line 47). |
| FR-03 | Fetch ≤400 days per symbol with explicit matching `limit` | ✅ SATISFIED | `getBars(symbol, '1Day', 400, 400)` (line 61) — `daysBack` and `limit` both 400, avoiding the silent-truncation gotcha called out in the FIX/PROMPT's context. |
| FR-04 | Continue on a single symbol's fetch failure, log symbol + error | ✅ SATISFIED | `try { bars = await getBars(...) } catch (err) { console.error(...); failed++; continue }` (lines 60-66). |
| FR-05 | Convert bar timestamp to a plain date matching `DATE` column | ✅ SATISFIED | `bar_date: bar.t.split('T')[0]` (line 70) — ISO date portion only. |
| FR-06 | Single-batch upsert keyed on `(symbol, bar_date)` | ✅ SATISFIED | `db.from('daily_bars').upsert(rows, { onConflict: 'symbol,bar_date' })` (line 95), one call for all `rows`; `onConflict` re-verified live against `pg_constraint` during implementation (`daily_bars_symbol_bar_date_key` — `UNIQUE (symbol, bar_date)`). |
| FR-07 | Default dry run; write only when env var explicitly set | ✅ SATISFIED | `const isLive = process.env.RUN_DAILY_BARS_SYNC === 'true'` (line 88); the `.upsert()` call only executes when `isLive` (line 90-93 returns early otherwise). |
| FR-08 | One summary log line per run (processed/failed/upserted) | ✅ SATISFIED | `[DAILY_BARS_DONE] processed=${processed} failed=${failed} upserted=${...}` logged on every exit path (lines 84, 91, 98, 102). |
| FR-09 | Runs automatically once per weekday after close, independent schedule | ✅ SATISFIED | `.github/workflows/daily-bars-sync.yml` — `cron: "0 21 * * 1-5"` (21:00 UTC, weekdays), its own dedicated workflow file/cron, not reusing `position-health.yml`'s schedule. |
| FR-10 | Manually triggerable | ✅ SATISFIED | `workflow_dispatch:` present alongside `schedule:` (workflow line 6). |
| NFR-01 | Script structure mirrors `position-health-check.ts` | ✅ SATISFIED | Own `createClient()`, direct imports from `../src/lib/*.js`, `RUN_*==='true'` gate, batched single insert/upsert, `processed`/`failed` counters, one summary log, top-level `main().catch(...) → process.exit(1)` — all present and structurally identical in shape. |
| NFR-02 | Workflow mirrors `position-health.yml` | ✅ SATISFIED | Same `concurrency` shape, same secrets block, same `npm ci` → `npm audit --audit-level=critical` → `npm run <script>` step sequence, same `timeout-minutes: 15` / `permissions: contents: read`. |
| NFR-03 | Own Supabase client for writes; `db.ts`'s `getOpenPositionContexts()` for reads | ✅ SATISFIED | `createClient()` at module scope (line 22-25) used for both the `selection_history` read and the `daily_bars` upsert; `getOpenPositionContexts` imported from `../src/lib/db.js` (line 20) for the open-position read. |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | No Protected Zone changes | ✅ SATISFIED | Confirmed via `git status`/`git diff --stat -- src/` — zero `src/` changes of any kind. |
| C-02 | No modification to `position-health-check.ts`, its workflow, `alpaca.ts`, `db.ts`, or `daily_bars` schema | ✅ SATISFIED | None of these appear in `git status`. |
| C-03 | No retry logic beyond the established log-and-skip / log-and-return pattern | ✅ SATISFIED | No backoff, no queue, no retry loop anywhere in the new file. |
| C-04 | Exactly `daysBack=400, limit=400` | ✅ SATISFIED | Line 61, no deviation. |
| C-05 | No backtesting/analysis tooling added | ✅ SATISFIED | The script only writes; nothing reads `daily_bars` in this CHANGE. |

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

`package.json` was modified (one line added: `"daily-bars-sync": "tsx scripts/daily-bars-sync.ts"`), which is expected and listed in `design.md` → Impact on Existing Files; `package.json` is not a Protected Zone file.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` not touched. |
| Supabase patterns | ⚠️ SEE NOTE | No `any` casts (a typed assertion `as Array<{ symbol: string }> \| null` is used, not `any`); errors are checked (`if (error) ...`) but **not** re-thrown — they're logged and the function degrades gracefully (falls back to open-symbols-only, or logs and returns on upsert failure). This diverges from `supabase-patterns.md`'s general "if (error) throw error" guidance, but is explicitly spec-mandated (C-03, mirroring `position-health-check.ts`'s established resilience idiom for standalone batch scripts) rather than an oversight. The `selection_history` read uses a date-range filter (`.gte('created_at', ...)`) instead of a row-count `.limit()`; `design.md`'s Alternatives Considered table explicitly reasoned through this and judged the date bound sufficient — not a violation. |
| TypeScript quality | ⚠️ SEE NOTE | No `any` types; no mutation of passed-in objects (only local accumulator arrays). `main()` is ~54 lines (lines 50-103), slightly over the repo's "functions < 50 lines" guideline — but this mirrors `position-health-check.ts`'s own `main()` (which is substantially longer), and the code was specified verbatim in the FIX/PROMPT under an explicit "implement exactly as specified" instruction, so this is an accepted, spec-directed exception rather than a defect. File is 109 lines, well under 800. |
| Security | ✅ | No hardcoded secrets (env vars via `process.env.X!`, matching precedent); no SQL injection surface (Supabase query builder throughout, no raw SQL); logged error content is the same class of Supabase/Alpaca error objects already logged elsewhere in this codebase, no secrets or PII. |

## Task Checklist

- Completed: 15/16 tasks (3 pre-implementation + 12 implementation + 1 of 2 post-implementation). The one remaining unchecked box, "Run `/review`," is this review itself.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **Live dry-run verification was blocked, not completed** (T-12): the script's logic was verified statically (types, structure, `onConflict` re-checked live against the real constraint) but the actual `getBars()` fetch loop and row-mapping code path were never exercised against real Alpaca/Supabase data, because `getOpenPositionContexts()` failed first with `Invalid API key`. This was proven to be a pre-existing local `.env.local` issue (the unmodified `position-health-check.ts` fails identically), not a defect introduced by this CHANGE — but it does mean this script's happy path has zero live execution evidence yet, only static verification. Recommend Amaury refresh `SUPABASE_SERVICE_ROLE_KEY` locally and run a dry run before (or shortly after) this first goes live via the scheduled workflow, to catch anything static analysis can't (e.g. a `selection_history` row whose `candidates_offered` shape doesn't match the assumed `{ symbol: string }[]`).

### LOW (optional)
- **Untested code path, by design precedent**: no test file was written, matching `position-health-check.ts`'s own precedent (which also has zero tests). This is a reasonable, explicitly-considered choice (T-11), but both scripts now share the same testing gap — worth a future decision on whether this class of standalone script should get basic coverage (e.g. a unit test for `getSymbolUniverse()`'s union/dedup logic, which is pure and easily testable in isolation) independent of this CHANGE.
- **Inline 7-day lookback literal**: `Date.now() - 7 * 24 * 60 * 60 * 1000` (line 31) is a meaningful business threshold (the "last 7 days" from FR-01) expressed as an inline computed literal rather than a named constant. Minor readability nit; not a functional issue, and the code matches the FIX/PROMPT's verbatim specification.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. All 10 functional requirements, all 3 non-functional requirements, and all 5 constraints are satisfied by static/structural verification and one live check (the `onConflict` constraint match). The one MEDIUM note is that the script's live happy-path (real Alpaca fetch + real Supabase upsert) has not yet been exercised end-to-end due to an unrelated, pre-existing local credential issue — this doesn't block merging the code, but it does mean the first real signal on whether this works end-to-end will come from either a fixed local dry run or the first scheduled/manual workflow run. Recommend watching that first run's `[DAILY_BARS_DONE]` log closely.
