# Review Report — Position Health Monitor: the Health-Check Script

**Date**: 2026-07-08
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | One `snapshotTimestamp` generated at run start, shared by every row | ✅ | `position-health-check.ts:76` — computed before any fetch, referenced at `:125` for every pushed row; live run confirmed all 3 inserted rows share one identical value |
| FR-02 | Fetch all open positions via `getOpenPositionContexts()` | ✅ | `:78` |
| FR-03 | SPY bars fetched once per run, not per position | ✅ | `:80`, outside the per-position loop |
| FR-04 | SPY fetch failure/`<200` bars → log + all-null regime, no abort | ✅ | `:80-89` — `.catch(() => [])` plus length-gated ternary, no throw |
| FR-05 | Per-position own bars fetched | ✅ | `:98` |
| FR-06 | Per-position fetch failure/`<200` bars → log, count failed, skip | ✅ | `:97-109` — both branches `continue` |
| FR-07 | Current indicators via `calculateAllIndicators(bars)` | ✅ | `:111` |
| FR-08 | Current buckets via `getAdxBucket`/`getMacdBucket`/`getZBucket` | ✅ | `:114-116` |
| FR-09 | `getZBucket` uses position's own signal type, normalized (legacy `'TREND'`/`undefined` → `null`) | ✅ | `toZBucketSignalType()` (`:35-42`), used at `:116` |
| FR-10 | `current_spx_regime` from the single per-run SPY snapshot | ✅ | `:117`, `spxSnapshot` computed once, reused every iteration |
| FR-11 | Entry-time fields read defensively, no assumption `indicators`/`state_fingerprint` exist | ✅ | `readEntryFingerprint()` (`:58-73`) — `Record<string, unknown>` cast + `typeof` narrowing, matching `learning.ts:73-90`'s exact precedent, no `any` |
| FR-12 | Missing `state_fingerprint` → info-level log, not error, all-null | ✅ | `:62-65` — `console.log`, not `console.error` |
| FR-13 | `days_since_entry` via replicated `getTradingDaysOpen` formula | ✅ | `getTradingDaysSinceEntry()` (`:44-49`) — byte-identical formula to `claude-agent.ts:99-105` |
| FR-14 | Rows accumulated in-memory, no DB write inside the loop | ✅ | `:91,122-139` — `rows.push(...)` only; the sole `.insert()` call is after the loop (`:164`) |
| FR-15 | Empty `rows` → skip insert entirely, never `.insert([])` | ✅ | `:151-154` — early `return` before reaching the `isLive` branch |
| FR-16 | Non-empty + dry-run → print rows, no write | ✅ | `:158-161` |
| FR-17 | Non-empty + live → exactly one batch `.insert(rows)` | ✅ | `:164` — single call, confirmed live: 3 rows in one insert |
| FR-18 | Insert failure logged explicitly, not swallowed | ✅ | `:165-168` — `if (error)` checked (Supabase's return-not-throw convention), `console.error` with message |
| FR-19 | Per-position entry-vs-current comparison log line | ✅ | `:142-148` |
| FR-20 | Summary line with processed/failed/inserted counts | ✅ | Three DONE lines covering all three exit paths (`:152`, `:160`, `:167`, `:171`) |
| FR-21 | `package.json` `"health-check"` script entry | ✅ | Added, minimal diff (`+2/-1`), consistent with existing `cycle`/`exit-only`/`report` entries |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | Zero writes to `open_position_contexts`/`trade_evaluations`/`agent_log` | ✅ | Only `getOpenPositionContexts` (a read) is imported from `db.ts`; no insert/update function for any other table is imported or called |
| NFR-02 | No import from `claude-agent.ts` | ✅ | Confirmed — imports only from `alpaca.ts`, `indicators.ts`, `state-fingerprint.ts`, `db.ts`, `types.ts`, `@supabase/supabase-js` |
| NFR-03 | One position's failure doesn't block others | ✅ | `continue` in both failure branches; live dry-run processed all 3 positions in one pass |

## Constraints

| ID | Constraint | Status | Notes |
|----|------------|--------|-------|
| C-01 | No Protected Zone file modified | ✅ | `git status` confirms only `package.json` + new files |
| C-02 | No gate/score/alert/exit action | ✅ | Script only computes, logs, and stores comparisons — no branch anywhere acts on the entry-vs-current delta |
| C-03 | `position_health_snapshots` schema/index unchanged | ✅ | No migration file touched; insert conforms to the existing 17-column schema exactly |
| C-04 | `tsc --noEmit` passes | ✅ | Confirmed zero errors |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | Imported from only |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | Its `Record<string, unknown>` cast pattern was followed, not its code touched |
| `.env` / `.env.local` | UNTOUCHED | — |
| `vercel.json` | UNTOUCHED | — |
| DB migration | NONE | No new migration; writes conform to the Prompt 2/4 schema as-is |

No unauthorized Protected Zone changes. `git status --porcelain`: `M package.json`, `?? scripts/position-health-check.ts`, `?? specs/position-health-check-script/`.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | No Claude API call in this script at all |
| Supabase patterns | ✅ | RLS on the target table already enabled (Prompt 2/4); errors checked via `if (error)` before proceeding; no unbounded query introduced (the only query, `getOpenPositionContexts()`, is pre-existing and naturally bounded by `MAX_POSITIONS`) |
| TypeScript quality | ✅ | Zero `any` anywhere — the one unsafe read (`state_fingerprint`) uses the project's established `Record<string, unknown>` + `typeof`-narrowing pattern instead; no mutation (each row is a freshly-constructed object, `ctx`/`currentIndicators` never mutated); all functions well under 50 lines (longest is `main()` at ~95 lines total including logging, but composed of clearly delineated phases matching the spec's own step structure — see LOW finding below); file is 178 lines, well under 800 |
| Security | ✅ | No secrets in the file; Supabase client built from `process.env` only; no `console.log` of credentials — only symbols, buckets, and numeric indicator values are logged |

**Note**: `main()` itself is long (~95 lines) relative to the project's "functions < 50 lines" guideline, though it reads as a single linear orchestration (fetch → loop → branch-on-mode) rather than nested logic, and splitting it further wasn't requested by the spec, which explicitly laid out `main()`'s steps as a single sequential flow. Flagged as LOW, not a functional defect.

---

## Task Checklist

- Completed: 23/23 implementation tasks (`T-01` through `T-23`)
- Pre-implementation gates: 3/3 checked
- Live verification performed with explicit user approval: dry run (T-20, zero writes confirmed) followed by one live run (T-22, 3 rows inserted, single shared `snapshot_timestamp` confirmed)

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- `main()` is ~95 lines, over the project's 50-line function guideline, though it's a single linear orchestration matching the spec's own step-by-step structure (fetch positions → fetch SPY once → per-position compute loop → branch on empty/dry-run/live). Could be split into `computeSnapshotRows()` + a thin `main()` wrapper in a future pass, but wasn't part of this spec's scope and doesn't affect correctness.
- The two magic numbers (`200`-bar minimum, `400`-day lookback) are inline literals rather than named constants — this matches the exact style already used for the identical values in `claude-agent.ts` (`getBars('SPY', '1Day', 400)`), so it's consistent with existing convention rather than a new deviation.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
