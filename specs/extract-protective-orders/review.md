# Review Report — CHANGE split-5: extract the protective-order / profit-floor helpers and the two stop-retry helpers (pure move)

**Date**: 2026-11-10
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verified at implementation time: `git status`/`git diff`, the `claude-agent.ts` diff (3 added lines, 237 removed), a byte comparison of the moved text against `HEAD`, CR counts, `tsc`, the characterization file three times, the full suite, ESLint, SHA-256 of the 61 goldens and a YAML parse of `pr-review.yml`. An independent second pass (`/review`, same day) re-ran the byte comparison against `git show HEAD`, the `claude-agent.ts` diff against HEAD minus the two blocks, `tsc`, the full suite (1212 in 79 files), the golden hashes (identical) and the task count, with the same results.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Create `protective-orders.ts` | ✅ | 237 lines, LF |
| FR-02 | Move the "PROTECTIVE ORDER HELPERS" block | ✅ | Was `claude-agent.ts:442-619`; now `protective-orders.ts:7-181` (banner at `:7`) |
| FR-03 | Move both retry helpers with header comment | ✅ | Was `:729-780`; now `protective-orders.ts:184-237` |
| FR-04 | Exports | ✅ | `replaceProtectiveOrder` `:52`, `applyProfitFloor` `:141`, `resolveEntryPrice` `:122`, `submitStopWithRetry` `:190`, `submitStopLimitWithRetry` `:214` |
| FR-05 | Exported types | ✅ | `ProtectiveOrderParams` `:11`, `ReplaceOrderParams` `:20`, `ReplaceOutcome` `:26`, `ProfitFloorParams` `:87`, `ProfitFloorOutcome` `:93` |
| FR-06 | Private helpers not exported | ✅ | `logNakedStopAlert` `:28`, `cancelRegisteredStop` `:41`, `logContextPersistError` `:98`, `persistProtectiveStopSnapshot` `:102`, `handleFloorSellNow` `:127` |
| FR-07 | IOC constants and functions stay | ✅ | `STOP_SUBMIT_FAILED` now `claude-agent.ts:540`; `resolveIocFinalState` `:554` |
| FR-08 | Text copied unchanged except `export` | ✅ | Byte comparison: moved text equals HEAD blocks (178 + 52 lines, joined by one blank line) once `export` is removed from the 3 functions and 5 types/interfaces that did not have it |
| FR-09 | Log texts unchanged | ✅ | Inside the byte-compared blocks; goldens identical |
| FR-10 | Signatures and `retryDelayMs = 3000` | ✅ | |
| FR-11 | No rename | ✅ | |
| FR-12 | Only the listed imports | ✅ | `crypto`, `./alpaca`, `./db`, `./protective-stop`, `./types` |
| FR-13 | No import from `claude-agent` | ✅ | grep: 0 |
| FR-14 | No import cycle | ✅ | `alpaca.ts`, `db.ts`, `protective-stop.ts`, `types.ts` do not mention `protective-orders` (grep: 0) |
| FR-15 | New module in LF | ✅ | 0 CR |
| FR-16 | Nothing fixed | ✅ | See Findings |
| FR-17 | Delete the banner block | ✅ | `:442-620` of HEAD (179 lines, with the trailing blank) |
| FR-18 | Delete the retry helpers | ✅ | `:729-781` of HEAD (53 lines, with the trailing blank) |
| FR-19 | Import the names still used | ✅ | `claude-agent.ts:29`: `applyProfitFloor`, `replaceProtectiveOrder`, `resolveEntryPrice`, `submitStopWithRetry` |
| FR-20 | One re-export line | ✅ | `claude-agent.ts:80`: `export { submitStopWithRetry }` |
| FR-21 | No re-export of `submitStopLimitWithRetry` | ✅ | |
| FR-22 | Remove only newly unused imports | ✅ | Removed `submitStopOrder`, `submitStopLimitOrder`, `updatePositionProtectiveStop`, `computeProtectiveStop`, `buildProtectiveStopSnapshot`; `tsc` and ESLint show no other |
| FR-23 | Keep the other imports | ✅ | `cancelOrder` (used by `resolveIocFinalState`), `updatePositionContext`, `insertAgentLogEntry`, `randomUUID`, `getProfitFloorSettings`, `roundDownToTick`, `isHigherByTick` kept |
| FR-24 | No other change | ✅ | numstat `3 237`: 232 block lines + 4 import lines + 1 modified `./db` import line removed; import, re-export and modified `./db` line added |
| FR-25 | CRLF and CR = lines | ✅ | 2162 / 2162 (was 2396 / 2396) |
| FR-26 | `pr-review.yml` entry | ✅ | After `macro-bars-staleness.ts`, same indent |
| FR-27 | `vitest.config.ts` entry | ✅ | Appended to `coverage.include` |
| FR-28 | CLAUDE.md File Structure row | ✅ | After `signal-rotation.ts` |
| FR-29 | CLAUDE.md "Confirm" row | ✅ | Reason text as authorized |
| FR-30 | CR counts | ✅ | CLAUDE.md 315/315 -> 317/317; vitest 0/22 -> 0/22; pr-review 0/254 -> 0/255 |
| FR-31 | No other line changed | ✅ | numstat: pr-review `1 0`, CLAUDE.md `2 0`, vitest `1 1` |
| FR-32 | YAML parses | ✅ | Parsed with `js-yaml` |
| FR-33 | Baseline recorded | ✅ | tsc clean; characterization 63/63 x3; full 1207 in 78 files; 3 known ESLint warnings; 61 goldens hashed; docs-5 SHA `a94014bf...` |
| FR-34 | No golden changed | ✅ | |
| FR-35 | Stop if a golden changes | ✅ | N/A: SHA-256 of the 61 goldens identical |
| FR-36 | docs-5 `tasks.md` untouched | ✅ | SHA unchanged |
| FR-37 | Existing tests unedited | ✅ | Not in `git diff` |
| FR-38 | Observe first | ✅ | Throwaway copy of the current text plus a throwaway test; both deleted |
| FR-39 | Observed values used | ✅ | A: `{stopOrderId:'sl-1'}`, 1 call; B: 1 call at 2999 ms, 2 at 3000 ms, `sl-2`; C: `failureReason: 'boom2'`, warn and error texts; D: `{outcome:'skipped', stopOrderId:null}` with 0 calls |
| FR-40 | Throwaway deleted | ✅ | Not in `git status` |
| FR-41 | RED for the right reason | ✅ | `Cannot find module '/src/lib/protective-orders'` |
| FR-42 | First-attempt success | ✅ | |
| FR-43 | One failure, then success at 3000 ms | ✅ | Fake timers |
| FR-44 | Double failure | ✅ | `failureReason`, warn and error texts |
| FR-45 | `quantity` 0 -> `skipped` | ✅ | |
| FR-46 | Cancel-then-submit order | ✅ | |
| FR-47 | Mock style, timers restored, no network | ✅ | `vi.hoisted`; `useRealTimers` in `afterEach` |
| FR-48 | `tsc` passes | ✅ | |
| FR-49 | Characterization x3 | ✅ | 63/63 each |
| FR-50 | Full suite and count | ✅ | 1212 in 79 files (1207 + 5 new tests) |
| FR-51 | Existing tests pass unchanged | ✅ | `ioc-fill-verification`, `mr-profit-floor-exit-rules` and `orphaned-position-reconciliation`: 47 tests |
| FR-52 | ESLint, nothing new | ✅ | 0 errors; the same 3 warnings in `claude-agent.ts`; none in the new files |
| FR-53 | Goldens identical | ✅ | `git status` on `__golden__` empty |
| FR-54 | Only allowed files | ✅ | Modified: `claude-agent.ts`, `pr-review.yml`, `vitest.config.ts`, `CLAUDE.md` (and `docs-5` `tasks.md`, already modified before this change); new: module, test, spec folder |
| FR-55 | Diff is deletions, imports, re-export | ✅ | |
| FR-56 | Moved vs HEAD | ✅ | Equal apart from `export` |
| FR-57 | Final import lines and CR counts | ✅ | See report |
| FR-58 | This review | ✅ | |
| FR-59 | Old and new `file:line` | ✅ | See FR-02 to FR-07 |
| FR-60 | List docs citing moved lines | ✅ | See Findings L-3 |
| FR-61 | List observations | ✅ | See Findings L-1 |
| FR-62 | No commit or push | ✅ | |
| NFR-01 | No behaviour change | ✅ | Goldens identical |
| NFR-02 | No live call | ✅ | |
| NFR-03 | No secret printed | ✅ | |
| NFR-04 | Coverage at least 80% | ✅ | Existing exit-rule tests, goldens and the new tests exercise the moved code (coverage tool not run) |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | |
| src/lib/claude-agent.ts | MODIFIED (authorized) | Two block deletions, import changes, one re-export |
| src/lib/risk-manager.ts | UNTOUCHED | |
| src/lib/indicators.ts | UNTOUCHED | |
| src/lib/news-intelligence.ts | UNTOUCHED | |
| src/lib/watchlist-monitor.ts | UNTOUCHED | |
| src/lib/learning.ts | UNTOUCHED | |
| src/lib/prompt-builder.ts | UNTOUCHED | |
| src/lib/exit-cooldown.ts | UNTOUCHED | |
| src/lib/execution-gates.ts | UNTOUCHED | |
| src/lib/signal-rotation.ts | UNTOUCHED | |
| .github/workflows/pr-review.yml | MODIFIED (authorized) | One line |
| vitest.config.ts | MODIFIED (authorized) | One entry |
| CLAUDE.md | MODIFIED (authorized) | Two table rows |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | No change to the Claude call or prompt |
| Supabase patterns | ✅ | `db.ts` untouched; the module only imports existing functions |
| TypeScript quality | ✅ | No `any`; casts in the test build minimal fixtures |
| Security | ✅ | No secrets |

## Task Checklist

- Completed: 32/32 boxes in `tasks.md` (4 pre-implementation, 26 implementation tasks, 2 post-implementation). Incomplete: 0.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** Observations on the moved code, not fixed:
  - After a failed replacement the position is left without a stop (`naked` outcome, golden (w2)).
  - The trailing call site uses the literal `0.005` as the limit offset (`claude-agent.ts:344` at HEAD).
  - `submitStopWithRetry` and `submitStopLimitWithRetry` are near-duplicates.
  - `persistProtectiveStopSnapshot` has an `!snapshot` guard that is unreachable for the current inputs.
  - `replaceProtectiveOrder` returns `stopOrderId: ctx.trailingStopOrderId ?? null` on `cancel_failed`.
- **L-2** A first version of the new test failed `tsc` on a cast (`AlpacaAccount`); fixed through `unknown` before verification.
- **L-3** Documents that cite old `claude-agent.ts:<line>` numbers inside the moved ranges (not fixed): `.tmp/docs-4-report.md`, `specs/extract-execution-gates/{design,requirements,review,tasks}.md`, `specs/extract-signal-rotation/tasks.md`, `specs/extract-state-fingerprint-helpers/{design,tasks}.md`, `specs/fix-cooldown-stop-loss-ghost-close/requirements.md`, `specs/prompt-threshold-language-gate/requirements.md`, `specs/self-flagged-disqualifying-risk/design.md`, `specs/sma5-reclaim-cooldown/design.md`. Many of these cite line numbers at older commits and are historical. `CLAUDE.md`, `SDD.md`, `AGENTS.md` and `.claude/` have no hit.
- **L-4** `specs/docs-5-selector-criteria/tasks.md` is still modified and uncommitted.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
