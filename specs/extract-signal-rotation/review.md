# Review Report — CHANGE split-4: extract the legacy signal classifier and the rotation chooser (pure move)

**Date**: 2026-11-10
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verified at implementation time: `git status` and `git diff` (5 tracked files modified, 3 new untracked), the `claude-agent.ts` diff (1 added line, 89 removed), a byte comparison of the moved block against `HEAD`, CR counts, `tsc`, the characterization file three times, the full suite, ESLint, `git status` on the goldens and a YAML parse of `pr-review.yml`. Run `/review` for an independent second pass.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Create `signal-rotation.ts` | ✅ | 91 lines |
| FR-02 | Move `SignalResult` | ✅ | Was `claude-agent.ts:624-627`; now `signal-rotation.ts:8-11` |
| FR-03 | Move `generateSignalType` | ✅ | Was `:629-660`; now `signal-rotation.ts:13-44` |
| FR-04 | Move `RotationDecision` | ✅ | Was `:666-670`; now `signal-rotation.ts:50-54` |
| FR-05 | Move `evaluateRotation` | ✅ | Was `:672-707`; now `signal-rotation.ts:56-91` |
| FR-06 | Move the two banners | ✅ | Both banners are in the new module |
| FR-07 | `evaluateRotation` stays `async` | ✅ | `export async function` |
| FR-08 | Call-site block unchanged | ✅ | The original `:1523-1549` text is intact in the current file (now at `:1435-1461`) |
| FR-09 | Text copied unchanged except `export` | ✅ | Byte comparison: 88 lines equal after adding `export` to the 4 declarations |
| FR-10 | Priority-1 reason text unchanged | ✅ | Inside the byte-compared block; asserted again in the new test |
| FR-11 | Signatures unchanged | ✅ | |
| FR-12 | No rename | ✅ | |
| FR-13 | No parameter or injection | ✅ | |
| FR-14 | Only three imports | ✅ | `ZSCORE_ENTRY_THRESHOLD` from `./config`; the two types from `./types` |
| FR-15 | No import from `claude-agent.ts` | ✅ | |
| FR-16 | `config.ts` not edited | ✅ | Not in `git diff` |
| FR-17 | New module in LF | ✅ | 0 CR |
| FR-18 | No import cycle | ✅ | `config.ts` has no imports; neither `config.ts` nor `types.ts` mentions `signal-rotation` (grep: 0) |
| FR-19 | No rule fixed | ✅ | Observations only (see Findings) |
| FR-20 | Delete the block | ✅ | `:620-708` of HEAD (89 lines) |
| FR-21 | Add the import after `./execution-gates` | ✅ | `claude-agent.ts:30` |
| FR-22 | Keep `ZSCORE_ENTRY_THRESHOLD`, `TechnicalIndicators`, `AlpacaPosition` imports | ✅ | Still used (`ZSCORE_ENTRY_THRESHOLD` 5 uses) |
| FR-23 | Remove only newly unused names | ✅ | None became unused; `tsc` clean and no new ESLint warning |
| FR-24 | No other change | ✅ | Current file equals HEAD minus the block plus the import |
| FR-25 | Touched lines in CRLF | ✅ | |
| FR-26 | CR count = line count | ✅ | 2396 / 2396 (was 2484 / 2484) |
| FR-27 | `pr-review.yml`: `signal-rotation.ts` | ✅ | After `execution-gates.ts`, same indent |
| FR-28 | `pr-review.yml`: `macro-bars-staleness.ts` | ✅ | |
| FR-29 | `vitest.config.ts`: `signal-rotation.ts` | ✅ | |
| FR-30 | `vitest.config.ts`: `macro-bars-staleness.ts` | ✅ | |
| FR-31 | CLAUDE.md File Structure row | ✅ | After `execution-gates.ts` |
| FR-32 | Row says legacy classifier, rotation chooser, not live detection | ✅ | Text as authorized |
| FR-33 | CLAUDE.md "Confirm" row | ✅ | Reason text as authorized |
| FR-34 | CR counts before and after | ✅ | CLAUDE.md 313/313 -> 315/315; vitest 0/22; pr-review 0/252 -> 0/254 |
| FR-35 | Line endings kept | ✅ | |
| FR-36 | No other line changed | ✅ | numstat: pr-review `2 0`, CLAUDE.md `2 0`, vitest `1 1` |
| FR-37 | `pr-review.yml` parses as YAML | ✅ | Parsed with `js-yaml` 4.3.2 (a transitive dependency; the `yaml` package is not installed). One job `pr-review`; both new paths are present in the parsed content |
| FR-38 | Baseline recorded | ✅ | tsc clean; characterization 23/23 x3; full 1114 in 77 files; 3 known ESLint warnings; docs-5 SHA `a94014bf...` |
| FR-39 | No golden changed | ✅ | 0 paths under `__golden__` |
| FR-40 | Stop if a golden changes | ✅ | N/A, including `h-rotation-close.json` |
| FR-41 | No golden regenerated | ✅ | |
| FR-42 | docs-5 `tasks.md` untouched | ✅ | SHA unchanged |
| FR-43 | Observe behaviour first | ✅ | Throwaway test file run on the original text; deleted afterwards |
| FR-44 | Observed values are the expected values | ✅ | The 53 tests passed on the first GREEN run |
| FR-45 | Throwaway script deleted | ✅ | Not in `git status` |
| FR-46 | RED fails for the right reason | ✅ | `Cannot find module '../signal-rotation'` |
| FR-47 | MR at/below the threshold | ✅ | Below fires (0.4333666666666667); exactly at: NO_SIGNAL |
| FR-48 | MR RSI and %B | ✅ | RSI 44 fires, 45 and null do not; %B 0.19 fires, 0.2 does not |
| FR-49 | MR confidence and cap | ✅ | 0.6, 1 at z=-3, 1 at z=-6 |
| FR-50 | TF ADX 25 / 25.01 | ✅ | 25: NO_SIGNAL; 25.01: TREND_FOLLOWING |
| FR-51 | TF MACD | ✅ | Histogram 0 and positive; `macdLine` equal/below `signalLine`; null |
| FR-52 | TF price against `sma50` | ✅ | null fires; equal and below do not; above fires |
| FR-53 | TF RSI | ✅ | 50 no; 50.01 and 74.99 yes; 75 and null no |
| FR-54 | TF confidence and cap | ✅ | 0.5002, 0.6, 1 at 50, 1 at 80 |
| FR-55 | NO_SIGNAL, null kalman, null macd | ✅ | |
| FR-56 | Confidence 0.69 / 0.70 | ✅ | `Signal too weak for rotation` below 0.70 |
| FR-57 | Priority 1 at -0.8 / -0.81 | ✅ | Exact reason text asserted |
| FR-58 | Priority 2 at 0.05 / 0.0501 and 0.80 / 0.81 | ✅ | Only P&L 0.0501 with confidence 0.81 rotates |
| FR-59 | No-candidates path | ✅ | |
| FR-60 | Position without kalman | ✅ | Skipped; also a symbol missing from the cache |
| FR-61 | Tie of two priority-1 candidates | ✅ | First in array order wins, in both orders |
| FR-62 | Priority 1 beats priority 2 | ✅ | |
| FR-63 | Empty `openPositions` | ✅ | |
| FR-64 | No network, key or fake timers | ✅ | |
| FR-65 | `tsc` passes | ✅ | |
| FR-66 | Characterization x3 identical | ✅ | 23/23 each |
| FR-67 | Full suite and count | ✅ | 1167 in 78 files (1114 + 53 new tests) |
| FR-68 | ESLint, nothing new | ✅ | 0 errors; the same 3 warnings in `claude-agent.ts`; none in the new files |
| FR-69 | Goldens clean | ✅ | |
| FR-70 | Only allowed files | ✅ | See Findings |
| FR-71 | Diff is the block deletion and the import | ✅ | `claude-agent.ts` numstat `1 89` |
| FR-72 | Moved vs deleted text | ✅ | Equal apart from `export` (byte comparison) |
| FR-73 | CR per touched file | ✅ | See FR-26, FR-34 and the new files (0) |
| FR-74 | This review | ✅ | |
| FR-75 | Old and new `file:line` | ✅ | See FR-02 to FR-05 |
| FR-76 | List docs citing moved lines | ✅ | None: 0 hits for `claude-agent.ts:\d` and 0 for the function names in docs, `.claude` and scripts |
| FR-77 | List observations | ✅ | See Findings |
| FR-78 | No commit or push | ✅ | |
| NFR-01 | No behaviour change | ✅ | Goldens identical |
| NFR-02 | No import from `claude-agent.ts` | ✅ | |
| NFR-03 | `ZSCORE_ENTRY_THRESHOLD` only read | ✅ | |
| NFR-04 | No live call | ✅ | |
| NFR-05 | No secret printed | ✅ | |
| NFR-06 | Coverage at least 80% | ✅ | Every branch of the four moved declarations is asserted (coverage tool not run) |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Only imported from |
| src/lib/claude-agent.ts | MODIFIED (authorized) | One block deletion and one import |
| src/lib/risk-manager.ts | UNTOUCHED | |
| src/lib/indicators.ts | UNTOUCHED | |
| src/lib/news-intelligence.ts | UNTOUCHED | |
| src/lib/watchlist-monitor.ts | UNTOUCHED | |
| src/lib/learning.ts | UNTOUCHED | |
| src/lib/prompt-builder.ts | UNTOUCHED | |
| src/lib/exit-cooldown.ts | UNTOUCHED | |
| src/lib/execution-gates.ts | UNTOUCHED | |
| src/lib/macro-bars-staleness.ts | UNTOUCHED | Only registered in coverage and the audit list |
| .github/workflows/pr-review.yml | MODIFIED (authorized) | Two lines |
| vitest.config.ts | MODIFIED (authorized) | Two entries |
| CLAUDE.md | MODIFIED (authorized) | Two table rows |

`specs/docs-5-selector-criteria/tasks.md` keeps its SHA from before this change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | No change to the Claude call, prompt or the forced `HOLD` |
| Supabase patterns | ✅ | Not applicable |
| TypeScript quality | ✅ | No `any`; casts in the test helpers are to build minimal fixtures |
| Security | ✅ | No secrets |

## Task Checklist

- Completed: 32/32 boxes in `tasks.md` (4 pre-implementation, 26 implementation tasks, 2 post-implementation). Incomplete: 0. Every check above was re-run independently at review time (byte comparison against `HEAD`, CR counts, `tsc`, characterization x3, full suite, ESLint, goldens, YAML parse) and gave the same results. One correction: the implementation report named the `yaml` package as the YAML parser; the parser that actually ran was `js-yaml`.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** Observations on the moved code, pinned by tests and not fixed:
  - `generateSignalType` uses a legacy MEAN_REVERSION rule (RANGING, `z < -1.3` strictly, RSI < 45 with null counted as no signal, %B < 0.2) and a TREND_FOLLOWING rule that matches no live setup; its result feeds only the `[SIGNAL]` log and the rotation trigger.
  - `evaluateRotation` priority 1 (`z >= -0.8`) never looks at a position's setup type; with several candidates the first in array order wins (stable sort).
  - The trigger `positions.length >= 5` in `runAgentCycle` uses the literal `5`.
  - After a rotation `openPositionsCount` is not decremented and no context or cooldown is written (documented in `SDD.md` and pinned by golden (h)).
- **L-2** `evaluateRotation` is `async` but contains no `await`; kept as is.
- **L-3** `specs/docs-5-selector-criteria/tasks.md` is still modified and uncommitted.
- **L-4** Local check of the byte comparison needed a UTF-8 aware script: a first attempt with Python's locale default reported a false difference on three em dashes; the corrected comparison (bytes) is equal.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
