# Design — daily_bars sync script + workflow (CHANGE 2 of 2 for historical OHLC persistence)

## Architecture Decision

This CHANGE lives entirely in two new files: `scripts/daily-bars-sync.ts` (a standalone CLI script, run via `tsx`, not part of the Next.js app or the main trading cycle) and `.github/workflows/daily-bars-sync.yml` (its dedicated cron trigger). It follows the exact precedent already established by `scripts/position-health-check.ts` / `.github/workflows/position-health.yml` — a pattern this repo already uses for out-of-band, observability/data-collection jobs that read production helpers (`getBars()`, `getOpenPositionContexts()`) directly rather than running inside `runAgentCycle()`. This CHANGE only writes to `daily_bars` (created in CHANGE 1); it does not read from it, and nothing yet consumes it.

## Data Flow

1. GitHub Actions triggers the workflow on its cron schedule (weekdays, 21:00 UTC) or via manual `workflow_dispatch`.
2. `main()` calls `getSymbolUniverse()`, which:
   a. Calls `getOpenPositionContexts()` (existing `db.ts` helper) → open position symbols.
   b. Queries `selection_history` directly (own Supabase client) for rows with `created_at >= now() - 7 days`, extracting every `symbol` from each row's `candidates_offered` JSON array.
   c. Returns the deduplicated union of (a) and (b).
3. For each symbol in the universe, `main()` calls `getBars(symbol, '1Day', 400, 400)` (existing `alpaca.ts` helper). On a fetch failure, it logs and continues to the next symbol (`failed++`); on success, it maps each `AlpacaBar` into a row shaped for `daily_bars` (`bar_date` derived from `AlpacaBar.t` by truncating to the date portion) and appends to an in-memory `rows` array (`processed++`).
4. After the loop, if `RUN_DAILY_BARS_SYNC !== 'true'`, the script logs the row count that *would* be upserted and exits (dry run, matching `position-health-check.ts`'s `RUN_HEALTH_CHECK` gate).
5. If live, the script calls `db.from('daily_bars').upsert(rows, { onConflict: 'symbol,bar_date' })` once, in a single batch, and logs the final summary line.
6. `main().catch(...)` handles any uncaught error, logs it, and exits with code 1 (matching the existing precedent, causing the GitHub Actions job to fail loudly rather than silently).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Full 400-day re-fetch every run, upsert-idempotent (as specified) | Simple; self-heals any gap from a missed run automatically; no first-seen-vs-tracked branching logic; matches `position-health-check.ts`'s own established simplicity | Slightly more API calls/compute than a delta-only fetch | **Chosen** — explicitly specified as a user-approved design decision; daily cost is small at ~20-40 symbols. |
| Incremental fetch (only days newer than the latest stored `bar_date` per symbol) | Fewer API calls per run | Requires a `db.ts` read helper and per-symbol "last known date" branching logic — added complexity explicitly ruled out for this CHANGE | Rejected — not specified, adds scope. |
| Route the write through a new `db.ts` helper function | Consistent with the "all DB operations go through `db.ts`" guidance in `.claude/skills/supabase-patterns.md` | FIX/PROMPT explicitly mirrors `position-health-check.ts`'s own established precedent of writing via its own client, for consistency with the one existing model this script is built from; also explicitly listed as out of scope ("Do NOT add a db.ts helper function") | Rejected — not specified; the existing precedent (`position-health-check.ts`) already deviates from that general guidance for this exact class of standalone script, and CHANGE 2 is instructed to match it exactly. |
| Symbol universe from `selection_history.candidates_offered` (last 7 days) UNION open positions | Directly reuses data already being persisted every cycle — no new capture logic, no re-invocation of scanner/selection logic (confirmed in this session's earlier diagnostic) | 7-day window is a judgment call — a symbol evaluated 8+ days ago and never since drops out of the universe until re-evaluated | **Chosen** — explicit user-approved design decision. |
| A dedicated `db.ts` query limited with `.limit()` for the `selection_history` read | Matches the "all queries have `.limit()`" Supabase-patterns guidance | The query is already bounded by the `created_at >= 7-days-ago` filter, which is the correct bound for this use case (not an unbounded scan) — an arbitrary row-count `.limit()` on top would be a speculative, unrequested addition | Rejected — the date filter is the correct and sufficient bound here. |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `scripts/daily-bars-sync.ts` | CREATE | New standalone script — symbol universe, bar fetch, upsert, dry-run gate — exactly as specified in the FIX/PROMPT. |
| `.github/workflows/daily-bars-sync.yml` | CREATE | New workflow — weekday 21:00 UTC cron + `workflow_dispatch`, mirroring `position-health.yml`. |
| `package.json` | MODIFY | Add one line to `"scripts"`: `"daily-bars-sync": "tsx scripts/daily-bars-sync.ts"`, alongside the existing `"health-check"` entry. No other line touched. |

No other file is created or modified by this CHANGE — `scripts/position-health-check.ts`, `.github/workflows/position-health.yml`, `src/lib/alpaca.ts`, `src/lib/db.ts`, and the `daily_bars` migration are all left untouched, per the FIX/PROMPT's explicit DO NOT CHANGE list.

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`. `package.json` and new `scripts/`/`.github/workflows/` files are in the "Touch freely" category per `CLAUDE.md`'s File Permission Matrix.

## Database Changes

None — `daily_bars`' schema, RLS, and constraints were finalized and closed in CHANGE 1. This CHANGE only reads `selection_history` (existing table, read-only) and `open_position_contexts` (via the existing `getOpenPositionContexts()` helper), and writes to `daily_bars` (existing table, via upsert).

One verification-relevant fact carried over from CHANGE 1's live-verified state: the constraint backing `UNIQUE (symbol, bar_date)` is named `daily_bars_symbol_bar_date_key`, and Supabase JS's `.upsert(rows, { onConflict: 'symbol,bar_date' })` takes a comma-separated **column list** (not the constraint name) — `'symbol,bar_date'` is the correct value to match that constraint, and this will be re-confirmed live during implementation per the FIX/PROMPT's VERIFY section rather than assumed.

## Open Questions

None. The script's exact code, the workflow's exact structure, the npm script line, and all design decisions (symbol universe, schedule, fetch window) were specified verbatim and approved in the originating FIX/PROMPT. The one item flagged for extra care during implementation — confirming `onConflict: 'symbol,bar_date'` against the live constraint — is a VERIFY-step task, not an open design question (CHANGE 1 already live-verified the constraint's column composition; this CHANGE's implementation will re-confirm the upsert syntax matches it).
