# Review Report — CHANGE split-7: extract callClaudeWithRetry from claude-agent.ts (pure move)

**Date**: 2026-11-13
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verified at implementation time: `git status`/`git diff`, SHA-256 of every `src/lib/*.ts` and of the 81 goldens before and after, a byte comparison of the moved text against `HEAD`, the `claude-agent.ts` diff against HEAD minus the block, CR counts, `tsc`, the characterization file three times, the full suite, ESLint, a coverage run of the new module from its own test and a YAML parse of `pr-review.yml`. Run `/review` for an independent second pass.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Create `claude-call.ts` | ✅ | 31 lines, LF |
| FR-02 | Move `:437-465` | ✅ | Now `claude-call.ts:3-31` (banner `:3-5`) |
| FR-03 | Export `callClaudeWithRetry` | ✅ | Was `claude-agent.ts:443-465` (private); now `claude-call.ts:9-31`, `export` |
| FR-04 | `RETRYABLE_STATUS_CODES` private | ✅ | Was `:441`; now `claude-call.ts:7`, not exported |
| FR-05 | Delete `:437-466` | ✅ | 30 lines removed; the next banner is now at `:437` |
| FR-06 | Call site unchanged | ✅ | Diff touches no line of `runAgentCycle`; the call is now at `:1496` |
| FR-07 | Copy unchanged except the type import and `export` | ✅ | Lines 3-31 of the module equal HEAD `:437-465` (29 lines) once `export` is removed |
| FR-08 | Only CRLF to LF | ✅ | |
| FR-09 | Retry count, statuses, delay, jitter, text, order unchanged | ✅ | Inside the byte-compared block; the new tests assert the observed values |
| FR-10, FR-11 | Signature and names unchanged | ✅ | |
| FR-12 | One import, `import type Anthropic` | ✅ | `claude-call.ts:1`; `tsc` accepts `Anthropic.Message` through the type import |
| FR-13 | No runtime import | ✅ | |
| FR-14 | No import from `claude-agent` | ✅ | grep: 0 |
| FR-15 | No import cycle | ✅ | Only `claude-agent.ts` imports `claude-call.ts` |
| FR-16, FR-17 | LF and one trailing newline | ✅ | 0 CR; file ends `}\n` |
| FR-18 | Nothing fixed | ✅ | See Findings |
| FR-19 | Import after `./order-execution` | ✅ | `claude-agent.ts:28` |
| FR-20 | `import Anthropic` kept | ✅ | `:1`; `new Anthropic` still used |
| FR-21 | No re-export | ✅ | |
| FR-22 | Remove only unused imports | ✅ | None became unused |
| FR-23 | No other change | ✅ | numstat `1 30`; the diff against HEAD minus the block shows only the new import line |
| FR-24 | CRLF and CR = lines | ✅ | 1986 / 1986 (was 2015 / 2015) |
| FR-25 | `vitest.config.ts` entry | ✅ | After `order-execution.ts` |
| FR-26 | `pr-review.yml` entry | ✅ | After `order-execution.ts`, same indent |
| FR-27, FR-28 | CLAUDE.md rows | ✅ | After the `order-execution.ts` rows |
| FR-29 | Reason text | ✅ | Same text in both rows |
| FR-30 | CR counts before and after | ✅ | CLAUDE.md 319/319 -> 321/321; vitest 0/22 -> 0/22; pr-review 0/256 -> 0/257 |
| FR-31 | No other line changed | ✅ | numstat: pr-review `1 0`, CLAUDE.md `2 0`, vitest `1 1` |
| FR-32 | YAML parses | ✅ | `js-yaml` |
| FR-33 | Other copies untouched | ✅ | `market-daily-briefing.ts` not in `git diff` |
| FR-34 | No other doc edited | ✅ | |
| FR-35, FR-36 | Baseline recorded and matched | ✅ | HEAD `969be71`; tsc clean; characterization 87/87 x3; full 1240 in 80 files; 3 known ESLint warnings; 81 goldens and 43 production files hashed; `claude-agent.ts` 2015/2015; nothing differed |
| FR-37 | HEAD text saved | ✅ | Outside the repo |
| FR-38, FR-39 | Goldens unchanged; stop on a difference | ✅ | N/A: none changed |
| FR-40 | Existing tests unedited | ✅ | |
| FR-41 | `docs-5` `tasks.md` untouched | ✅ | `a94014bf...` before and after |
| FR-42 | Observe first through the harness | ✅ | Disposable test with the `claude:` callback throwing errors with `status`, `pump` and `Math.random` fixed; deleted afterwards |
| FR-43 | 429 then success | ✅ | 2 calls; warn `Claude API 429 (attempt 1/4) — retrying in 1000ms` (random 0), `1250ms` (0.5), `1500ms` (1) |
| FR-44 | 529 | ✅ | Same as 429 |
| FR-45 | Exhaustion | ✅ | 5 calls at 0, 1000, 3000, 7000 and 15000 ms; 4 warns; the same error object rethrown at 15000 ms, with no wait after the last attempt |
| FR-46 | Status 400 | ✅ | 1 call, no warn |
| FR-47 | No status | ✅ | 1 call, no warn; same path as golden (j) |
| FR-48 | `maxRetries` 1 and 0 | ✅ | 2 calls with `attempt 1/1`; 1 call; observed through a disposable copy of the function text (Q-2), deleted afterwards |
| FR-49 | Values in `design.md` | ✅ | |
| FR-50 | Observed values as expected | ✅ | The 12 tests passed on the first GREEN run |
| FR-51 | Throwaway deleted | ✅ | Not in `git status` |
| FR-52 | RED for the right reason | ✅ | `Cannot find module '../claude-call'` |
| FR-53 | Hand-made fake client, no SDK mock | ✅ | |
| FR-54 | `Math.random` spy, fake timers, restored | ✅ | `afterEach`: `useRealTimers` and `restoreAllMocks` |
| FR-55 | Exact warn text asserted | ✅ | |
| FR-56 | Cases FR-43 to FR-48 | ✅ | Plus the first-call success and the 30000 ms delay cap |
| FR-57 | No network or key | ✅ | |
| FR-58 | `tsc` passes | ✅ | |
| FR-59 | Characterization x3 | ✅ | 87/87 each |
| FR-60 | Full suite and count | ✅ | 1252 in 81 files (1240 + 12) |
| FR-61 | ESLint, nothing new | ✅ | 0 errors; the same 3 warnings in `claude-agent.ts` (now `:442`, `:1225`, `:1639`); none in the new files |
| FR-62 | Goldens identical | ✅ | |
| FR-63 | Byte comparison | ✅ | Equal |
| FR-64 | Coverage of the new module | ✅ | `claude-call.ts`: 15/15 statements, 7/7 branches (before the move the same code had 9/15 and 3/7) |
| FR-65 | CR per file | ✅ | `claude-agent.ts` 1986/1986; new files 0 |
| FR-66 | Only allowed files | ✅ | Modified: `claude-agent.ts`, `pr-review.yml`, `vitest.config.ts`, `CLAUDE.md` (and `docs-5` `tasks.md`, modified before this change); new: module, test, spec folder |
| FR-67 | Other hashes unchanged | ✅ | Only `claude-agent.ts` differs among the 43 production files; `claude-call.ts` is new |
| FR-68 | This review | ✅ | |
| FR-69 | Old and new `file:line`; observed values | ✅ | See FR-02 to FR-06 and `design.md` |
| FR-70 | List documents | ✅ | See Findings L-2 |
| FR-71 | List pending observations | ✅ | See Findings L-1 |
| FR-72 | Temporary files deleted | ✅ | Disposable test, copy and coverage output removed |
| FR-73 | No commit or push | ✅ | |
| NFR-01 to NFR-04 | No behaviour change, no network, no secret, 100% coverage | ✅ | |
| C-01 to C-06 | Constraints | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | |
| src/lib/claude-agent.ts | MODIFIED (authorized) | One block deletion and one import line |
| src/lib/risk-manager.ts | UNTOUCHED | |
| src/lib/indicators.ts | UNTOUCHED | |
| src/lib/news-intelligence.ts | UNTOUCHED | |
| src/lib/watchlist-monitor.ts | UNTOUCHED | |
| src/lib/learning.ts | UNTOUCHED | |
| src/lib/market-daily-briefing.ts and the rest | UNTOUCHED | |
| .github/workflows/pr-review.yml | MODIFIED (authorized) | One line |
| vitest.config.ts | MODIFIED (authorized) | One entry |
| CLAUDE.md | MODIFIED (authorized) | Two table rows |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | No change to the Claude call, prompt, parameters or the forced `HOLD` |
| Supabase patterns | ✅ | Not applicable |
| TypeScript quality | ✅ | No `any`; the test casts a fake client through `unknown` |
| Security | ✅ | No secrets |

## Task Checklist

- Completed: 32/34 boxes in `tasks.md` (4 pre-implementation, 28 implementation tasks, 2 post-implementation). The 2 Post-Implementation boxes (`/review` and the Protected Zone confirmation) stay open for the independent review.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** Pending observations (not changed):
  - The warn says `attempt N/4` while up to 5 attempts happen; the fifth never waits (observed: 5 calls, 4 warns).
  - The wrapper stacks on the SDK's own retries (SDK 0.80.0, `maxRetries` 2), so one analysis can make up to 15 HTTP requests.
  - `market-daily-briefing.ts:25-50` keeps a duplicated copy with the `[BRIEFING]` log prefix.
  - `learning.ts`, `news-intelligence.ts` and `stock-selector.ts` call the client without retry.
  - An error without `status` (for example a network error) is never retried.
  - With only 429 or 529 on every attempt, one symbol waits 15 s in the worst case, with no cycle-wide limit.
- **L-2** Documents that mention the symbol or cite old lines (not fixed): `.claude/skills/claude-api-patterns.md:47` and `:55-56`, `.claude/commands/implement.md:80`, `specs/fix-ioc-fill-verification/requirements.md:13` (cites `claude-agent.ts:629-651`, already stale) and `design.md:89`, `specs/extract-prompt-builder/{requirements,design}.md`, `specs/daily-briefing-narrative-synthesis/{requirements,review}.md`, `specs/market-briefing-extraction-and-di/{requirements,review,tasks}.md`, `specs/self-flagged-risk-wording/design.md:17`. `SDD.md:251` describes the retry in prose with no line numbers.
- **L-3** A first version of the observation test hung because its loop advanced 10 s while the backoff sums 15 s; it was rewritten to record the time of each call. No effect on the change.
- **L-4** `specs/docs-5-selector-criteria/tasks.md` is still modified and uncommitted.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
