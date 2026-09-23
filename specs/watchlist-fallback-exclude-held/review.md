# Review Report — Exclude heldSymbols from the Static TRADING_WATCHLIST Fallback Path

**Date**: 2026-09-23
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Exclude open-position symbols from the static `watchlist` fallback list when the dynamic path fails | ✅ SATISFIED | `claude-agent.ts` fallback chain (~line 1186) gains `.filter((s) => !openPositionSymbols.has(s))`, applied to every symbol before `watchlist` is assigned in the `catch` block. |
| FR-02 | Derive the held-symbol test from the same `Set` already used by the main loop's `openPositionSymbols.has(symbol)` skip check — not a separate computation | ✅ SATISFIED | `openPositionSymbols` is now declared once (~line 1151, hoisted from its old location at ~1479) and referenced by both the fallback filter and the main-loop skip check (~line 1564) — confirmed only one `new Set(positions.map(...))` construction exists in the file (`grep` for `openPositionSymbols` shows exactly one declaration, two usages). |
| FR-03 | Do NOT apply `INSTRUMENT_BLACKLIST` filtering to the fallback watchlist at construction | ✅ SATISFIED | No blacklist logic added to the fallback block; `INSTRUMENT_BLACKLIST.has(symbol)` remains solely at its pre-existing location in the main loop (now ~line 1559, shifted only by the +4-line hoist). |
| FR-04 | Do NOT apply quality filters (change-percent/relative-volume) to the fallback watchlist | ✅ SATISFIED | No such logic added; the fallback block gained exactly one `.filter()` clause (the held-symbol one). |
| FR-05 | Leave `TRADING_WATCHLIST` env var name and its 9-symbol default unchanged | ✅ SATISFIED | `process.env.TRADING_WATCHLIST ?? 'AAPL,MSFT,NVDA,XOM,CVX,MP,NEM,GOOGL,META'` is byte-for-byte identical in the diff. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | `npx tsc --noEmit` zero new errors | ✅ SATISFIED | Re-run independently — clean, no output. |
| NFR-02 | Change confined to `src/lib/claude-agent.ts` | ✅ SATISFIED | `git status --porcelain` shows only `claude-agent.ts` modified among source files. |
| NFR-03 | Diff consists of exactly two edits — relocated declaration + one appended filter step | ✅ SATISFIED | `git diff` shows exactly three hunks: the new hoisted declaration, the appended `.filter()`, and the deletion of the old declaration site (replaced with an explanatory comment) — matching "relocate + filter" as one conceptual pair of edits, no unrelated lines touched. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Confirmed via `git diff --stat` — no output. |
| src/lib/claude-agent.ts | **MODIFIED** | Listed in `design.md`'s Impact on Existing Files table; explicit, fresh, in-conversation confirmation from Amaury was obtained before implementation began (per `tasks.md` Pre-Implementation and the `/implement` transcript) — not inferred from the pre-checked spec checkbox alone. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`claude-agent.ts`'s modification is expected and authorized — consistent with `design.md`'s explicit ⚠️ flag and the confirmation gate the implementation step honored.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `decision.action = 'HOLD'` override (line 2036) and all per-branch `action: 'HOLD'` literals are unchanged and untouched by this diff — the change is confined to the watchlist-construction section (~1148-1186) and a comment-only edit at ~1482, nowhere near the Claude call, response parsing, or decision-schema code. No new language altering Claude's role. |
| Supabase patterns | ➖ N/A | No new queries; `db.ts` untouched. |
| TypeScript quality | ✅ | No `any` types introduced. `openPositionSymbols` construction (`new Set(positions.map((p) => p.symbol))`) is a pure read of `positions`, unchanged from its prior form — no mutation. The touched region is a few lines within an already-large function; this spec did not introduce a new function, so the file's pre-existing size is unaffected by this change specifically. No new magic numbers. |
| Security | ✅ | No hardcoded secrets. No new query/injection surface. No `console.log` with sensitive data introduced. |

## Task Checklist

- Completed: 15/16 tasks (`specs/watchlist-fallback-exclude-held/tasks.md`)
- The one remaining `[ ]` is the self-referential "Run /review watchlist-fallback-exclude-held" line — satisfied by this review being produced.

## Additional Verification (independently re-run)

- `npx tsc --noEmit`: **0 errors** (re-verified fresh).
- `npx vitest run` (full suite, not just `stock-selector.test.ts`): **437/437 tests passed across 47 files**, no regressions.
- `git diff --stat` across `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, and `stock-selector.ts`: **no output** — confirms all seven are untouched, including `stock-selector.ts` (explicitly required by T-11, since this fallback path is designed to bypass it entirely).
- `grep -n openPositionSymbols src/lib/claude-agent.ts`: exactly one declaration (hoisted, ~line 1151) and two usages (the new fallback filter, ~line 1186; the pre-existing main-loop skip check, ~line 1564) — confirms FR-02/NFR-03's "one Set, not two" requirement at the source level, not just by inspection of the diff.

## Design Fidelity Check

- The design's "Correction to the CHANGE prompt's stated context" (the held-symbol `Set` did not actually exist before the fallback block, contrary to the original prompt's assumption) is borne out by the shipped diff: the hoist was necessary and is exactly what was implemented, not worked around differently.
- The "Known Behavior Note" (the fallback path may now return fewer than 9 symbols when positions are open, with no top-up) holds against the shipped code — no refill logic was added anywhere in the diff, consistent with C-05.
- `enforceStopLosses()`/`enforceExitRules()` calls are unaffected — they are not part of this diff and continue to operate on `positions` directly, not `watchlist`.

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- None

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. All 5 functional requirements and 3 non-functional requirements satisfied, Protected Zone modification was explicit, authorized, and confined to exactly what `design.md` specified, analyst purity is intact, and the full test suite (437 tests) passes with no regressions. This closes the third and final leg of the candidate-pool held-symbol leak (Pool A was already correct; Pool B and this static fallback are now both fixed). Ready to commit.
