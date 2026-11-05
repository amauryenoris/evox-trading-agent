# Review Report — CHANGE 1: extract the prompt-builder from claude-agent.ts (pure move)

**Date**: 2026-11-05
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: `git status` and `git diff` (3 tracked files changed, 4 new untracked), the `claude-agent.ts` diff (3 added lines, 226 removed; hunks listed below), that goldens, harness files and the characterization test have **no change against `HEAD`** (0 modified paths), `npx tsc --noEmit` (clean), ESLint on the new files (clean) and on `claude-agent.ts` (the same 3 warnings as before), the characterization suite three times (22/22 each), the new unit tests plus the characterization suite with `fetch` and sockets forced to throw (72/72), the new unit tests under `TZ=Asia/Tokyo` (50/50), the full suite (**73 files, 1,045/1,045**), coverage, and `npm run build` (green). The one-off check with non-default env values (identical prompts before and after) comes from the implementation run and is not repeated here. Nothing is committed (the baseline is `21b58b3`, CHANGE 0b).

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Create `src/lib/prompt-builder.ts` | ✅ | 237 lines. |
| FR-02 | Move `SYSTEM_PROMPT` | ✅ | |
| FR-03 | Move the five label helpers | ✅ | |
| FR-04 | Move `buildEnrichedPrompt` incl. the ACTIVE SETUP TYPE text | ✅ | |
| FR-05 | Move with identical code | ⚠️ | A line diff of the original blocks against the new module shows only the listed deltas (imports, `export`, `PromptEnv`, signature typings, `env`, five renames). Everything else is byte-identical. The signature typing change is a deviation from the design (see M-1). |
| FR-06 | No behaviour-relevant renames | ✅ | Only the five `process.env.X` -> `env.X`. |
| FR-07 | Move nothing outside the list | ✅ | The diff hunks are exactly the three blocks plus the import edits. |
| FR-08 | Claude call, parameters, parsing and decisions stay | ✅ | `model: 'claude-sonnet-4-6'`, `max_tokens: 1024`, `system: SYSTEM_PROMPT` and `decision.action = 'HOLD'` remain in `claude-agent.ts`. |
| FR-09 | No network | ✅ | Passes with `fetch` and sockets poisoned. |
| FR-10 | No database | ✅ | No db import. |
| FR-11 | No `Date.now` / `Math.random` | ✅ | Grep: none. |
| FR-12 | No `process.env` read | ✅ | Grep: only a comment mentions it. |
| FR-13 | `MAX_POSITION_SIZE`, `MAX_POSITIONS`, `STOP_LOSS_PCT` supplied as an argument | ✅ | `env: PromptEnv`. |
| FR-14 | Expressions unchanged apart from the source | ✅ | Defaults, parse and rounding untouched (diff). |
| FR-15 | Stop if another impure input appears | ✅ | None found; host-locale formatting is not an impure read of "now". |
| FR-16 | Import `SYSTEM_PROMPT` and `buildEnrichedPrompt` | ✅ | One added import line. |
| FR-17 | Pass `process.env` as the last argument | ✅ | Line 2070 of the new file. |
| FR-18 | Other arguments and Claude parameters unchanged | ✅ | |
| FR-19 | Remove only newly unused names from imports | ✅ | `regimeMultiplier` and `LearnContext`; no other import line changed. |
| FR-20 | No export of `claude-agent.ts` changed | ✅ | |
| FR-21 | No re-export unless needed | ✅ | None needed; no other file imports a moved name. |
| FR-22 | List any re-export | ✅ | None added, stated in the report. |
| FR-23 | Characterization suite passes with no golden change | ✅ | 22/22. |
| FR-24 | No golden regenerated, edited or deleted | ✅ | 0 modified paths under `__golden__/`. |
| FR-25 | Stop and report if a golden differs | ✅ | N/A, none differed. |
| FR-26 | Identical results in three runs | ✅ | Re-run here. |
| FR-27 | Unit tests independent of the harness | ✅ | `prompt-builder.test.ts` does not import the harness. |
| FR-28 | Exact label strings at every boundary | ✅ | Tables for rsi, macd, bb, sma, kalman. |
| FR-29 | Exact output for no-setup and the five setup types | ✅ | Full literals for MEAN_REVERSION and for the all-optional case; exact active-setup sections for no setup and all five types; full-output equality with the original for every type via the differential test. |
| FR-30 | Optional sections asserted | ✅ | Watchlist, news-adjusted threshold, learn mode, sector, news, position are all in the literals. |
| FR-31 | Env read only from the argument | ✅ | Three tests (values, defaults, `process.env` ignored). |
| FR-32 | `SYSTEM_PROMPT` equals its original text | ✅ | Equality with the frozen copy plus start/end checks. |
| FR-33 | Differential test vs a frozen copy | ✅ | 9,216 prompt inputs plus label grids. |
| FR-34 | No dependence on host time zone or locale beyond the code | ✅ | Expectations use the same locale API; passes under `TZ=Asia/Tokyo`. Locale other than the host default was not exercised. |
| FR-35 | Add the module to the pr-review protected list | ✅ | One line added after `learning.ts`; file still parses. |
| FR-36 | Nothing else changed in `pr-review.yml` | ✅ | Diff is that single line. |
| FR-37 | Add to `coverage.include` | ✅ | One entry. |
| FR-38 | `tsc` passes | ✅ | |
| FR-39 | Full Vitest passes | ✅ | 1,045/1,045 (was 995). |
| FR-40 | Build passes | ✅ | |
| FR-41 | ESLint, no new warning | ✅ | Same 3 warnings in `claude-agent.ts` as before. |
| FR-42 | `claude-agent.ts` diff is removed blocks, one import, the import-name removals and the one call argument | ✅ | Hunks: `-48 +48,2` (import), `-77` (type name), `-87,47`, `-806,177` (the three blocks), `+2070` (argument). |
| FR-43 | Line counts before and after | ✅ | 2,787 -> 2,564. |
| FR-44 | Report at `.tmp/prompt-builder-extraction-report.md` | ✅ | |
| FR-45 | Report contents | ✅ | |
| FR-46 | Uncommitted | ✅ | |
| NFR-01 | No change to prompt text, thresholds, flags, sizing, gates, setups, model, `max_tokens` | ✅ | Goldens (prompt text and call parameters) unchanged. |
| NFR-02 | No import from `claude-agent.ts` | ✅ | |
| NFR-03 | Imports limited to `./position-sizing`, `./config` and types | ✅ | Plus a type-only import of `AlpacaNewsArticle` from `./alpaca` (erased at runtime). |
| NFR-04 | No secret printed | ✅ | |
| NFR-05 | No live or network call in verification | ✅ | |
| NFR-06 | New module at least 80% covered | ✅ | 100% statements, 98.5% branches, 100% lines. |
| C-01 | Edit `claude-agent.ts` only as stated | ✅ | |
| C-02 | No other Protected Zone file | ✅ | |
| C-03 | No exported name or signature used elsewhere changed | ✅ | `buildEnrichedPrompt` was not exported; no other file used it. |
| C-04 | No quirk fixed | ✅ | Host-locale `toLocaleString`, ATR display and trailing spaces preserved. |
| C-05 | No commit/push | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Imported read-only by the new module. |
| src/lib/claude-agent.ts | MODIFIED | Expected: listed in `design.md` as "⚠️ Requires Amaury confirmation"; the owner authorization was given in the request and the edit is limited to what the spec allows. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`.env*`, `vercel.json`, `package.json` and the lockfile are also untouched. No golden or harness file is modified.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `SYSTEM_PROMPT` is byte-identical (equality test); `decision.action = 'HOLD'` is still forced after parsing; the response schema text is unchanged; Claude still never decides. |
| Supabase patterns | ✅ | N/A, no queries. |
| TypeScript quality | ✅ | No `any` or `@ts-ignore` in the new files. `buildEnrichedPrompt` is about 110 lines (over the 50-line guideline) because it is moved verbatim (L-2). The new file is 237 lines. |
| Security | ✅ | No secrets; the module no longer reads the environment. |

## Task Checklist

- Implementation tasks: 19/19 completed (T-01 to T-19), plus the 4 pre-implementation boxes = 23 `[x]`.
- 3 unchecked boxes remain under Post-Implementation (this review, Protected Zone confirmation, "nothing committed"). They close with this review and your commit decision; not implementation gaps.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** Deviation from the design: to keep `env` a required parameter, the four optional parameters were retyped from `x?: T` to `x: T | undefined`, because TypeScript rejects a required parameter after `?` ones. This is a type-only change (the single call site already passes all twelve arguments, and the compiler now forces the thirteenth), disclosed in the report, and the differential test proves identical output, but it is not "identical code" in the strict sense of FR-05. If you want strictness, the alternative is `env: PromptEnv = {}`, which would let a forgotten argument silently use the defaults; I would keep the current choice.
- **M-2** The call-site argument is protected by the compiler (the parameter is required) but not by a repository test: the characterization environment equals the defaults (`MAX_POSITIONS=5`, `MAX_POSITION_SIZE=0.10`, `STOP_LOSS_PCT=0.05`), so a call that passed `{}` instead of `process.env` would not change any golden. It was verified once by hand with non-default values (identical prompts before and after) but that check is not kept. A harness scenario with non-default env values (a small CHANGE 0c) would close this.

### LOW (optional)
- **L-1** `PromptEnv` has an index signature (`[key: string]: string | undefined`) so `process.env` is assignable; it also accepts any other key. Acceptable for an environment-shaped argument.
- **L-2** `buildEnrichedPrompt` is about 110 lines and the file mixes the system prompt, label helpers and the builder. A move was the goal; splitting the function would be a later, behaviour-affecting step.
- **L-3** The frozen copy `legacy-prompt.ts` (233 lines) duplicates the original code. It is the proof of identity now; consider deleting it after a few clean production cycles so it does not drift or confuse readers.
- **L-4** `prompt-builder.ts` depends read-only on `config.ts` (`ZSCORE_ENTRY_THRESHOLD`), a Protected Zone file. Same source as before, but it is a new edge in the dependency graph.
- **L-5** `pr-review.yml` now lists the new module, but the permission matrix in `CLAUDE.md` still names only the original seven files (outside this change's authorization), and the PreToolUse hook that STEP 0 could not find may not know the new path.
- **L-6** Host-locale dependence of `toLocaleString()` (volume) is preserved. The goldens were recorded under the host default locale; on a machine with a different default locale the characterization goldens would differ (pre-existing since CHANGE 0).
- **L-7** The two uncovered branch arms of the new module are on lines 170-171, the EMA50 and EMA200 lines: the case `ema50` present with `distanceToEma50Pct` null (prints `N/A` inside the parentheses) and the case `ema200` present with `ema50` null (omits the trend suffix). Both are reachable with partial indicator data; adding two inputs to the unit tests would reach 100% branches.
- **L-8** Operational: the change takes effect at the next cron run after the merge. Merge outside 14-20 UTC and the 13:30 / 19:55 UTC exit sweeps, Monday to Friday; the first scheduled cycle is the live check.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Suggested before relying on this as the pattern for step 2: add the non-default-env scenario (M-2), and decide whether to update the `CLAUDE.md` matrix (L-5).
