# Review Report — TREND_PULLBACK_3DAY Entry-Detection Wiring (CHANGE 2 of 3)

**Date**: 2026-08-27
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Detect `trendPullback3DaySetup` from `prevClose > sma200` + 3 down-closes | ✅ SATISFIED | claude-agent.ts:1549–1564, matches spec exactly. |
| FR-02 | Independent boolean, no reuse of existing setups' intermediates | ✅ SATISFIED | Verified by reading the block — references only `indicators.prevClose/sma200/closeMinus2/3/4`; no `ema50SlopeOk`, `adxOk`, `macdHistogram`, `zScore`, `momentumOk`. |
| FR-03 | Included in `setup_detected` OR-chain | ✅ SATISFIED | claude-agent.ts:1700. |
| FR-04 | `signalType` checks `trendPullback3DaySetup` first | ✅ SATISFIED | claude-agent.ts:1709 — ternary leads with it; the existing four setups' relative order among themselves is unchanged. |
| FR-05 | `ACTIVATION_PCT: 0.06`, `ATR_MULT: 1.5` for `TREND_PULLBACK_3DAY` | ✅ SATISFIED | Both maps updated; diff confirms the 5 pre-existing entries in each are byte-for-byte unchanged. |
| FR-06 | Setup is `false` if any of the 5 fields is null | ✅ SATISFIED | `!= null` short-circuit chain covers all 5 fields; verified by the new test file's 5 null-case tests, all passing. |
| FR-07 | No z-score/ADX/MACD condition | ✅ SATISFIED | Confirmed by inspection — the gate has exactly two boolean sub-checks, both pure price comparisons. |
| FR-08 | Existing 4 setups' internal logic untouched | ✅ SATISFIED | `git diff` shows zero lines changed inside `meanReversionSetup`, `trendSetup`, `trendZLE05Setup`, `emaReclaimSetup`. |
| FR-09 | No exit-condition branch added | ✅ SATISFIED | Confirmed — `enforceExitRules()` diff is exactly the two map entries, nothing else. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | Widen only `tsc`-flagged sites, report each | ✅ SATISFIED (minor gap) | 5 sites widened, all independently re-derivable from `git diff`. Reporting quality is slightly uneven: sites 4 (`watchlist-monitor.ts`) and 5 (`state-fingerprint.ts`) cite the specific error; sites 1–3 (`types.ts`) describe the resolution generically ("resolved a claude-agent.ts assignment error") rather than quoting the exact `tsc` error text per site. Not a functional problem — every site is verifiably a pure literal-union widen — but falls slightly short of the spec's "report... the specific error each resolved." **LOW.** |
| NFR-02 | Same `!= null` convention as CHANGE 1 | ✅ SATISFIED | Identical style to `closeMinus2/3/4`. |
| NFR-03 | `tsc --noEmit` + `npm run build` clean | ✅ SATISFIED | Re-verified independently during this review: both clean. |
| NFR-04 | Existing tests pass; overlap-scenario test flagged if absent | ✅ SATISFIED | 41 files / 377 tests pass. No multi-setup-overlap classification test exists in the codebase (confirmed by grep) — correctly flagged rather than silently assumed. A new dedicated test file (`trend-pullback-3day-setup.test.ts`, 11 tests) was added beyond what NFR-04 strictly required, consistent with the codebase's per-setup test convention and `CLAUDE.md`'s testing rule. |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Fresh, explicit Amaury confirmation for `claude-agent.ts` (not "Jorge," not CHANGE 1 carryover) | ✅ SATISFIED | Confirmed via an interactive question in this session, independent of spec-approval and independent of the disputed third-party claim. |
| C-02 | No changes to `indicators.ts`/`db.ts`/`alpaca.ts`/`risk-manager.ts` | ✅ SATISFIED | `git status --short src/` confirms all four untouched. |
| C-03 | No changes to `closePosition()`/`enforceExitRules()` beyond the 2 map entries | ✅ SATISFIED | Confirmed via diff. |
| C-04 | Live-immediate launch and top-priority reorder each explicitly reconfirmed | ✅ SATISFIED | Both were re-asked and re-confirmed via interactive questions in this session before implementation began, rather than accepted from the embedded prompt's "already approved" framing. |
| C-05 | Only `tsc`-required type sites touched | ✅ SATISFIED | All 5 sites were discovered by `tsc` errors, not pre-guessed; each was explicitly authorized (the two Protected Zone ones — `claude-agent.ts` and, discovered mid-implementation, `watchlist-monitor.ts` — via a second round of interactive confirmation). |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Listed in design.md's Impact table; explicitly authorized in-session. Expected. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | MODIFIED | **Not listed in design.md's original Impact table** — discovered mid-implementation as a `tsc`-driven cascade from widening `signalType`. Implementation correctly stopped and obtained separate, explicit authorization before touching it (documented in tasks.md T-05). No unauthorized change occurred, but design.md itself was never updated to reflect this — see MEDIUM finding below. |
| src/lib/learning.ts | UNTOUCHED | The `tsc` error at `learning.ts:178` was resolved by widening `types.ts:210` (a field type it reads from) — `learning.ts` itself needed no edit. |

No unauthorized Protected Zone changes. One Protected Zone file (`watchlist-monitor.ts`) was touched beyond the spec's original file list, but with proper mid-implementation authorization — a process success, not a violation, though the spec document itself is now slightly out of sync with what was actually built (see Findings).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | This change is entirely within setup-detection (upstream of the Claude call) — the Claude request/response/action-forcing code is untouched, confirmed via `git diff` (only two hunks: the exit-rules maps, and the setup-detection block/OR-chain/ternary). |
| Supabase patterns | ➖ N/A | `db.ts` not touched. |
| TypeScript quality | ✅ (one pre-existing condition noted) | No `any` types, no mutation, `!= null` used consistently. The new gate block itself is 18 lines, well-scoped. `runAgentCycle()` (the function this was added to) is already far beyond the 50-line guideline — this is pre-existing debt, not introduced or worsened materially by this diff (+21 lines to an already-large function). `claude-agent.ts` is 2332 lines total, already well past the 800-line file guideline before this change; again pre-existing, not attributable to this diff. |
| Security | ✅ | No secrets, no injection surface, no new logging of sensitive data. |

## Task Checklist

- Completed: 15/17 tracked checkboxes were `[x]` at review start (4 pre-implementation + 11 implementation/verification tasks); the 2 remaining Post-Implementation items ("Run /review", "Confirm Protected Zone files unchanged beyond claude-agent.ts") are being closed out by this review — see below.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **design.md's Impact on Existing Files table was incomplete.** ~~It lists only `claude-agent.ts` and `types.ts`~~ — **fixed during this review**: added an addendum documenting the `tsc`-driven cascade into `watchlist-monitor.ts` (Protected Zone, separately authorized) and `state-fingerprint.ts`, matching CHANGE 1's precedent of updating spec docs in place when implementation reveals a wider footprint.

### LOW (optional)
- **NFR-01's per-site error reporting is uneven.** Sites 1–3 (`types.ts:193/373/210`) are described by what they resolved in prose rather than the literal `tsc` error text, while sites 4–5 quote more precisely. Every site is independently verifiable via `git diff` and re-running `tsc` on a reverted copy, so this doesn't affect correctness — just report polish.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. The one MEDIUM finding (design.md documentation gap) was fixed during this review. Ready to commit.
