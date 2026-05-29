# Review Report — Pool A Pre-Filter

**Date**: 2026-05-29
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Remove INSTRUMENT_BLACKLIST symbols from Pool A | ✅ | Line 61: `!INSTRUMENT_BLACKLIST.has(c.symbol)` |
| FR-02 | Remove open position symbols from Pool A | ✅ | Line 62: `!heldSymbols.has(c.symbol)` — `heldSymbols` built from `positions` at line 58 |
| FR-03 | Remove candidates with \|changePercent\| ≥ 15 | ✅ | Line 63: `Math.abs(c.changePercent) < 15` — strict `<` correctly excludes exactly 15 |
| FR-04 | Sort: profitable history first | ⚠️ | Lines 81–90: sort uses `e.outcome === 'profitable' \|\| e.pnlPct > 0`. The second condition is undocumented in the spec — FR-04 specifies "prior profitable selection outcome" only. See MEDIUM finding. |
| FR-05 | Truncate Pool A to max 15 | ✅ | Line 93: `candidates.slice(0, 15)` |
| FR-06 | Fixed pipeline order: blacklist → held → overbought → sort → truncate | ✅ | Lines 61→62→63→86-90→93 — exact order per spec |
| FR-07 | Pool B symbols passed unchanged | ✅ | `sectorSnapshots` fetched via `getStockSnapshots` unchanged (lines 66-73). `sectorLines` and prompt section untouched. |
| FR-08 | Claude prompt and response schema unchanged | ✅ | `SELECTION_SYSTEM_PROMPT` and prompt template identical to pre-change. `max_tokens: 512`, model unchanged. |
| NFR-01 | No additional API calls | ✅ | Steps 1–3 are pure filters. Step 4 reuses existing `selectionEvals`. Step 5 is a slice. |
| NFR-02 | Steps 1–3 synchronous; Step 4 uses existing fetch | ✅ | Lines 61–63 are synchronous. Step 4 runs after `await Promise.all([getSelectionEvaluations(50)])` at line 78. |
| C-01 | Prompt, selection count, response schema unchanged | ✅ | Verified — no diff in prompt string or Claude call params. |
| C-02 | Pool B logic, getStockSnapshots, downstream trading untouched | ✅ | `recordSelectionOutcome()`, `getStockSnapshots()`, and all callers in `claude-agent.ts` are unchanged. |
| C-03 | No Protected Zone file modified | ✅ | `config.ts` imported read-only. All other Protected Zone files untouched. |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | IMPORTED (read-only) | `INSTRUMENT_BLACKLIST` imported — file not modified |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

No unauthorized Protected Zone changes.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `stock-selector.ts` does not touch Claude's decision pipeline |
| TypeScript — no `any` | ✅ | `goodSymbols` is `Set<string>`, sort comparator is typed via `ScreenerStock` |
| Immutability | ✅ | `candidates` is a local parameter — reassignment is valid. External `positions` array untouched. |
| Function size | ✅ | New code is ~15 lines within an existing function |
| No magic numbers | ⚠️ | `15` appears twice (overbought threshold, slice size) without named constants. See LOW finding. |
| Error handling | ✅ | No new error paths introduced; pre-filter ops cannot throw |
| No hardcoded secrets | ✅ | — |
| Security | ✅ | No new user input handling, no SQL, no external calls |

---

## Task Checklist

- Completed: 8/8 tasks marked `[x]`
- Pending: `tsc --noEmit` (blocked on `npm install` — not a code issue, environment constraint)

---

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

**M-01 — FR-04 sort condition broader than spec**

`goodSymbols` is built with:
```ts
selectionEvals.filter(e => e.outcome === 'profitable' || e.pnlPct > 0)
```

FR-04 specifies "symbols with a prior profitable selection outcome" — strictly `e.outcome === 'profitable'`. The added `|| e.pnlPct > 0` is undocumented and could promote a symbol with `outcome: 'no_trade'` but positive P&L (e.g. if evaluation timing is off). In practice this is benign, but it deviates from the spec without documentation.

**Options**: Remove the `|| e.pnlPct > 0` clause to match the spec exactly, OR document it in `requirements.md` as an intentional enhancement. Either resolves this finding.

### LOW

**L-01 — Magic numbers: `15` used without named constants**

`Math.abs(c.changePercent) < 15` and `candidates.slice(0, 15)` use bare numeric literals. Per project coding style, named constants are preferred for meaningful thresholds. Suggested addition at the top of `stock-selector.ts`:

```ts
const MAX_DAILY_CHANGE_PCT = 15   // filter threshold: news spikes above this are statistical noise
const MAX_POOL_A_CANDIDATES = 15  // reduced from 30 — higher signal-to-noise for Claude
```

Not blocking, but improves readability and makes future tuning explicit.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. One MEDIUM finding (undocumented sort enhancement vs. spec) that should be resolved before the next feature build on top of this code. One LOW finding (magic numbers). Safe to commit as-is with the MEDIUM noted for tracking.

---

## Recommended follow-up

1. Resolve M-01: either tighten the sort condition to `e.outcome === 'profitable'` only, or update FR-04 in `requirements.md` to acknowledge the `pnlPct > 0` fallback.
2. Resolve L-01: extract the two `15` literals into named constants.
3. Run `npm install && npx tsc --noEmit` to confirm zero TypeScript errors before committing.
