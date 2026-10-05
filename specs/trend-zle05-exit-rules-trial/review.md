# Review Report — TREND_ZLE05 Exits: Drop EMA50 Break, Add Z-Score Exhaustion Exit, 5% Profit Target

**Date**: 2026-10-05
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Exclude TREND_ZLE05 from the EMA50-break rule | ✅ SATISFIED | `:308` condition is now `signalType === 'TREND' \|\| signalType === 'TREND_PULLBACK'` — `TREND_ZLE05` removed |
| FR-02 | EMA50-break rule unchanged for TREND/TREND_PULLBACK | ✅ SATISFIED | Block body at `:308-312` byte-for-byte identical to pre-change code, confirmed via diff (only the condition's symbol list changed) |
| FR-03 | Close TREND_ZLE05 when finite zScore >= TREND_ZLE05_Z_EXIT | ✅ SATISFIED | `:315-319`: `if (!exitReason && signalType === 'TREND_ZLE05') { if (Number.isFinite(zScore) && zScore >= TREND_ZLE05_Z_EXIT) { ... } }` |
| FR-04 | null/undefined/NaN zScore must not trigger the new exit | ✅ SATISFIED | `Number.isFinite(zScore)` guard rejects `NaN`; `undefined`/`null` are type-impossible here since `zScore` is a non-null local already extracted from a guaranteed-non-null `ind.kalman` (`:203`, guarded by the `:188` early-continue) — covered by test T-12 |
| FR-05 | New rule applies only to TREND_ZLE05 | ✅ SATISFIED | Condition is `signalType === 'TREND_ZLE05'` exactly; test T-13 confirms TREND_PULLBACK with zScore >= 1.25 does not exit via this path |
| FR-06 | New rule evaluated after profit target/time stop, before trailing stop, where EMA50-break for TREND_ZLE05 used to sit | ✅ SATISFIED | Placed at `:314-319`, immediately after the TREND/TREND_PULLBACK EMA50 block (`:308-312`) and before EMA_RECLAIM (`:322`) — exactly the evaluation-order slot the old TREND_ZLE05 EMA50 branch occupied |
| FR-07 | `TREND_ZLE05_Z_EXIT` named constant = 1.25 | ✅ SATISFIED | `:289` `const TREND_ZLE05_Z_EXIT = 1.25` |
| FR-08 | TREND_ZLE05 profit target = 0.05 | ✅ SATISFIED | `PROFIT_TARGET_PCT.TREND_ZLE05 = 0.05` (`:285`); test T-17/T-18 confirm the 5% boundary |
| FR-09 | Every other signal type (incl. legacy null) profit target = 0.10 | ✅ SATISFIED | `default: 0.10` (`:286`) used via `PROFIT_TARGET_PCT[signalType ?? 'default'] ?? PROFIT_TARGET_PCT['default']` (`:292`) — `null` maps to `'default'` key correctly; test T-19 parametrized across all 6 remaining types |
| FR-10 | `PROFIT_TARGET_PCT` named constant map, `TREND_ZLE05: 0.05` + `default: 0.10` | ✅ SATISFIED | `:284-287`, matches exactly |
| FR-11 | Profit-target message states the actually-applied threshold | ✅ SATISFIED | `:294`: `` `...${(pnlPct * 100).toFixed(1)}% >= ${(profitTargetPct * 100).toFixed(0)}%)` `` — dynamic, no hardcoded "10%" remains |
| FR-12 | New exit message reads exactly `"Exit rule: z-score X.XX reached 1.25 (entry ceiling) — move exhausted"` | ✅ SATISFIED | `:317` matches verbatim, `zScore.toFixed(2)` for `X.XX` |
| FR-13 | `TREND_ZLE05_Z_EXIT` comment mirrors the entry ceiling and flags revisiting | ✅ SATISFIED | `:288` comment text matches the requirement's wording |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | `tsc --noEmit` zero errors | ✅ SATISFIED | Re-ran during review: clean |
| NFR-02 | Full suite passes, no regressions, new tests added | ✅ SATISFIED | Re-ran during review: 51 files / 483 tests passed (466 pre-existing + 17 new) |
| NFR-03 | TREND_ZLE05 entry conditions unchanged (`zScore <= 1.25` in `trendZLE05Setup`) | ✅ SATISFIED | Confirmed live: entry ceiling now at `:1912` (shifted only by the +17 lines this change inserted earlier in the file), text identical; `git diff` shows zero hunks in the 1760-2000 region |
| NFR-04 | No other signal type's entry conditions altered | ✅ SATISFIED | Same diff-hunk evidence — all entry-detection code is outside the 3 hunks this change produced (all within `:175-320`) |
| NFR-05 | Trailing-stop math, ACTIVATION_PCT, ATR_MULT, STOP_LOSS_PCT, 20-day time stop, rotation, runExitOnly() unchanged | ✅ SATISFIED | `ACTIVATION_PCT`/`ATR_MULT`/`MIN_DISTANCE_PCT` block (`:339-357`) confirmed byte-for-byte identical; time-stop check (`:296-298`) untouched; `evaluateRotation()` and `run-cycle.ts` outside the diff entirely |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone (`claude-agent.ts`) requires fresh explicit confirmation | ✅ SATISFIED | Obtained via `AskUserQuestion` at `/implement` time — not inferred from the `tasks.md` checkbox, which was checked but had left its answer blank until resolved in-conversation |
| C-02 | No file changes besides `claude-agent.ts` + one test file | ✅ SATISFIED | `git status --short` / `git diff --stat` confirm exactly these two files (plus the new spec folder itself) |
| C-03 | `risk-manager.ts`, `indicators.ts`, `config.ts`, `learning.ts` untouched | ✅ SATISFIED | Confirmed via `git diff --stat` |
| C-04 | No DB/migration changes | ✅ SATISFIED | None present |
| C-05 | `types.ts` untouched | ✅ SATISFIED | Confirmed via `git diff --stat`; the Open Question's chosen resolution (map new reason to existing `Z_SCORE_EXIT`) stayed entirely inside `claude-agent.ts`'s `toExitReason()` |
| C-06 | `gate-importance.ts` untouched | ✅ SATISFIED | Confirmed via `git diff --stat` |
| C-07 | TREND_ZLE05 prompt text (`:791-793` region) untouched | ✅ SATISFIED | Outside the 3 diff hunks |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Listed in `design.md` Impact table; explicitly confirmed by Amaury at `/implement` time via `AskUserQuestion`, separate from spec approval |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized Protected Zone modification. The single modified file was anticipated in `design.md`, separately confirmed, and the diff's 3 hunks are all confined to the exit-rule block (`:169-320`) — no touch to setup detection, position sizing, or any other sensitive region of this large file.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `decision.action = 'HOLD'` override sites unchanged by this diff; Claude's prompt/response handling is entirely untouched — this change is deterministic exit-rule logic that runs independently of any Claude call |
| Supabase patterns | ➖ N/A | No `db.ts` or query changes in this feature |
| TypeScript quality | ✅ | No `any` casts in new code; the two new blocks and the modified profit-target check are pure conditionals with no mutation of existing objects; both new/modified blocks are well under 50 lines; `PROFIT_TARGET_PCT`/`TREND_ZLE05_Z_EXIT` are named constants, no new magic numbers introduced (the `1.25`/`0.05` literals are each defined exactly once, as required) |
| Security | ✅ | No secrets touched; no new logging of sensitive data; `console.warn` paths in `toExitReason()` unchanged |

**Pre-existing condition, not introduced by this change**: `claude-agent.ts` is 2636 lines, well over the 800-line file-size guideline (same condition noted in the prior `macro-bars-truncation-fix` review). This change adds a net +17 lines to an already-oversized file; splitting it is out of scope for this trial.

**Implementation deviation from `design.md`, documented and justified**: the design doc's illustrative snippet placed `PROFIT_TARGET_PCT`/`TREND_ZLE05_Z_EXIT` "near `:322`, alongside `ACTIVATION_PCT`/`ATR_MULT`." The actual implementation declares them earlier (immediately before `let exitReason`'s first use, now `:283-289`), because `const` is not hoisted in JS/TS and `PROFIT_TARGET_PCT` is consumed at the profit-target check, which runs before the trailing-stop constants' declaration point. This is a correct, necessary fix to an implementation detail the design sketch got wrong — not a scope deviation. `tasks.md` T-01/T-02 document this explicitly.

---

## Task Checklist

- Pre-Implementation: 4/4 checked (spec approval, Protected Zone confirmation, Open Question answered — with its answer actually recorded, not left blank — and migrations N/A)
- Implementation Checklist: 28/28 tasks completed (T-01 through T-28)
- Post-Implementation: 2/3 checked at time of this review (this `/review` run satisfies item 1; item 2, Protected Zone confirmation, was already checked with a citation to the in-conversation confirmation; item 3 is a note-only reminder for Amaury about the 15-20-trade review window, not a gating task)

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- None — the one placement deviation from `design.md` (constant declaration order) was necessary, correctly identified during implementation, and is fully documented in `tasks.md`; it does not need further action.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
