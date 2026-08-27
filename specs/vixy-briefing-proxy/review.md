# Review Report — VIXY 1-Day % Change into Market Daily Briefing

**Date**: 2026-08-27
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | 1-day % change: confirmed close (yesterday) vs. prior confirmed close, excluding today's partial bar | ✅ SATISFIED | `market-daily-briefing.ts:14-23` — `refIndex = bars.length - 2` (yesterday), `bars[refIndex - 1]` (prior day); matches `sector-rotation.ts`'s anti-lookahead convention |
| FR-02 | `< 3` bars → `null` | ✅ SATISFIED | `market-daily-briefing.ts:17`; verified by test `returns null when fewer than 3 bars are supplied` |
| FR-03 | Zero past close → `null` | ✅ SATISFIED | `market-daily-briefing.ts:21`; verified by test `returns null when the past close is zero` |
| FR-04 | VIX-proxy line included in the Claude prompt alongside SPX/sector-rotation/macro sections | ✅ SATISFIED | `market-daily-briefing.ts:134-135` — new `--- VIX PROXY ---` section added to the prompt text |
| FR-05 | `null` → "no data" message | ✅ SATISFIED | `market-daily-briefing.ts:84` |
| FR-06 | Non-null → signed percentage | ✅ SATISFIED | `market-daily-briefing.ts:85-86` |
| FR-07 | Directional-only/not-real-VIX-level wording present **in every rendering, data present or absent** | ❌ **VIOLATED** | `market-daily-briefing.ts:84` — the `null`/"no data" branch renders exactly `'VIX proxy (VIXY): no data'`, with **no** directional-only caveat text at all. Only the non-null branch (line 86) includes it. See Findings below — this is a spec-internal inconsistency, not an implementation deviation: the CHANGE section's own provided code (which was followed verbatim) contradicts FR-07's explicit wording. |
| FR-08 | Computed value (or `null`) persisted to `vix_proxy_change` | ✅ SATISFIED | `market-daily-briefing.ts:110`; verified by the updated `buildBriefingRecord` test (`-3.42` → `vix_proxy_change: -3.42`) |
| FR-09 | VIXY fetch failure/insufficient data → cycle completes normally, `vix_proxy_change` stays `null` | ✅ SATISFIED (mostly ➖ not directly testable end-to-end) | `claude-agent.ts`'s new `Promise.all` entry has its own `.catch(() => [])`, matching the SPY/GDX/XLE/XLK pattern exactly; `computeVixyChangePct([])` returns `null` (< 3 bars); the outer `try/catch` around `generateDailyBriefing(...)` in `claude-agent.ts` (pre-existing, unchanged) already provides cycle-level resilience. Live-verified twice (spec-writing and implementation time) that VIXY actually returns data today, so the failure path itself is exercised only by the empty-bars unit test, not a live failure simulation — reasonable given VIXY's confirmed availability. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | No new external provider — Alpaca `getBars()` only | ✅ SATISFIED | `claude-agent.ts` — new entry uses the same `getBars()` function as SPY/GDX/XLE/XLK |
| NFR-02 | Existing SPY/GDX/XLE/XLK fetches, their `.catch()`s, and `spxSnapshot`/`sectorRotation` computations unaltered | ✅ SATISFIED | Confirmed via diff — those lines are byte-identical, only a new entry/lines added around them |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | `claude-agent.ts` touch confined to the two authorized points | ✅ SATISFIED | Diff shows exactly: import addition, one new `Promise.all` entry, one new compute+log block, one call-site argument addition — nothing else in the file changed |
| C-02 | `sector-rotation.ts` not modified | ✅ SATISFIED | Absent from `git diff --stat` |
| C-03 | `db-market-briefing.ts` not modified | ✅ SATISFIED | Absent from `git diff --stat` |
| C-04 | `upcoming_events_note` stays `null` | ✅ SATISFIED | `market-daily-briefing.ts:111` — untouched |
| C-05 | `NARRATIVE_SYSTEM_PROMPT`'s wording grows to mention the VIX-proxy input | ❌ **VIOLATED** | `market-daily-briefing.ts:54-61` — the constant's descriptive sentence ("You will receive an SPX trend snapshot, sector rotation data, and a macro news sentiment count.") was **not** updated to mention VIX-proxy data, even though the actual VIX-proxy section was correctly added to the live prompt text (FR-04). Functionally harmless — Claude still receives the VIX-proxy line either way, since the system prompt doesn't restrict what the user-message prompt may contain — but it's a literal, acknowledged gap against this constraint. See Findings. |
| C-06 | `buildBriefingRecord` test deliberately updated to a real value | ✅ SATISFIED | Test now passes `-3.42` and asserts `vix_proxy_change: -3.42`, explicitly reported as intentional in the completion report |
| C-07 | No other test assertion modified | ⚠️ PARTIAL, disclosed | The 2 `generateDailyBriefing` tests required a mechanical `null` 4th-argument addition and one `toHaveBeenCalledWith(...)` assertion update, made unavoidable by the new non-optional `vixyChangePct` parameter — not a behavioral/intent change to either test, and explicitly flagged as such in the completion report rather than silently done |
| C-08 | `tsc --noEmit` / `npm run build` pass | ✅ SATISFIED | Both verified clean; full suite 366/366 passing (40 files, up from 360 pre-change) |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | **MODIFIED** | Authorized by Amaury for this specific change (spec C-01); diff confined to exactly the two described insertion points — no gate, signal-detection, position-sizing, or trade-execution logic touched |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity (claude-agent.ts) | ✅ | This change touches only the daily-briefing data-gathering block, entirely separate from the per-symbol analyst call/schema (`AgentDecision`, action-forcing, `SYSTEM_PROMPT`) elsewhere in the file — none of that is touched |
| Supabase patterns | ➖ N/A | No DB queries added or modified; `db-market-briefing.ts` untouched |
| TypeScript quality | ✅ | No `any` anywhere in the diff; immutable patterns preserved (`buildBriefingRecord` still returns a fresh object literal); `market-daily-briefing.ts` 175 lines, test file 259 lines — both well under 800; `claude-agent.ts` is 2309 lines but that's a pre-existing condition, not introduced or worsened meaningfully by this 13-line diff; no new magic numbers |
| Security | ✅ | No secrets, no hardcoded credentials; no sensitive data in prompts or logs |

## Task Checklist

- Completed: 14/14 implementation tasks, 3/3 pre-implementation checks, 4/5 post-implementation checks — the remaining unchecked item is "Run `/review`" itself, fulfilled by this report.

## Findings

### CRITICAL (blocks merge)
None

### HIGH (should fix)
None

### MEDIUM (consider fixing)
- **FR-07 is violated by the spec's own provided code.** `formatVixyChangeContext()`'s `null` branch renders `'VIX proxy (VIXY): no data'` with no directional-only caveat, while FR-07 explicitly requires that wording "in every rendering... (data present or absent)." The implementation is byte-for-byte identical to the exact code the spec's own CHANGE section provided — this is a spec-authoring inconsistency (the CHANGE section's literal code and FR-07's stated requirement disagree), not a deviation introduced during implementation. Practical trading-safety risk is low (a "no data" message inherently makes no directional claim to be misread), but if Amaury wants FR-07 satisfied to the letter, the one-line fix is: `return 'VIX proxy (VIXY, directional only — not the real VIX level): no data'`.
- **C-05's `NARRATIVE_SYSTEM_PROMPT` wording was not updated.** The constant's descriptive sentence still lists only SPX/sector-rotation/macro-sentiment as inputs Claude will receive, not mentioning the new VIX-proxy section. Functionally harmless (the VIX-proxy line still reaches Claude via the actual prompt text, and the JSON response schema is unchanged), but it's a literal gap against C-05. One-line fix if desired: append ", and a VIX proxy" (or similar) to that sentence.

### LOW (optional)
- The 2 mechanical `generateDailyBriefing` test updates (adding `null` as the new 4th argument, and updating one `toHaveBeenCalledWith` assertion to include it) were unavoidable consequences of the new required parameter — correctly disclosed in the completion report and tasks.md rather than silently made. No action needed.
- `claude-agent.ts` at 2309 lines remains well over the project's 800-line file-size guideline — a pre-existing condition, not something this 13-line diff meaningfully worsens or is in scope to fix here.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL findings; the implementation faithfully follows the spec's CHANGE section and all constraints around scope, Protected Zone confinement, and test discipline. Two MEDIUM findings are spec-content gaps (FR-07's caveat missing from the null-data message; C-05's system-prompt wording not updated) rather than code defects — both are one-line fixes if Amaury wants them addressed, but neither poses a functional or trading-safety risk as shipped.
