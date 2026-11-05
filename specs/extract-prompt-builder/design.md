# Design — CHANGE 1: extract the prompt-builder from claude-agent.ts (pure move, no behaviour change)

## Architecture Decision

This is step 1 of the STEP 0 split plan: a leaf, string-only block moves from `src/lib/claude-agent.ts` (2,787 lines) into a new module `src/lib/prompt-builder.ts`, and `claude-agent.ts` imports it back. The block is the system prompt, the five indicator-label helpers and `buildEnrichedPrompt`. Nothing in it makes a decision, calls a service or touches state; it only formats text. It is the best first move because the characterization harness already locks the exact prompt text and the Claude call parameters in its goldens (scenarios a and b), so a byte-identical move can be proved automatically. One mechanical deviation from "identical code" is required by the purity rule: `buildEnrichedPrompt` reads three environment variables, so they arrive as an argument.

## What moves (current line numbers, verified in the spec phase; the file is unchanged since STEP 0)

| Item | Lines in `claude-agent.ts` | New home |
|---|---|---|
| Section header + `SYSTEM_PROMPT` | 86-132 | `prompt-builder.ts` (exported) |
| Section header + `rsiLabel`, `macdLabel`, `bbLabel`, `smaLabel`, `kalmanLabel` | 806-857 | `prompt-builder.ts` (exported so they can be unit-tested; `export` is the only addition) |
| Section header + `buildEnrichedPrompt` (incl. ACTIVE SETUP TYPE text) | 859-981 | `prompt-builder.ts` (exported) |

About 220 lines move; `claude-agent.ts` should drop from 2,787 to roughly 2,570 (exact figure reported at implementation). Nothing else moves. `callClaudeWithRetry` (line 989) stays.

## Purity audit of the moved code (done in the spec phase)

| Concern | Finding | Handling |
|---|---|---|
| Network / database | none | none needed |
| `Date.now`, `Math.random` | none. `new Date(n.created_at).toLocaleTimeString('en-US')` formats an argument (host time zone applies) | unchanged; not a read of "now" |
| `process.env` | **3 variables, 5 occurrences** inside `buildEnrichedPrompt`: `MAX_POSITION_SIZE` (twice), `MAX_POSITIONS` (twice), `STOP_LOSS_PCT` (once) | passed in as an argument (below) |
| Imported constants | `ZSCORE_ENTRY_THRESHOLD` from `./config` (still used elsewhere in `claude-agent.ts`) | the new module imports it from `./config`, same source (O-4) |
| Imported functions | `regimeMultiplier` from `./position-sizing` (pure) | imported by the new module |
| Types | `TechnicalIndicators`, `AlpacaAccount`, `AlpacaPosition`, `LearnContext`, `AlpacaNewsArticle` | type-only imports |
| Host locale | `indicators.volume.toLocaleString()` uses the host default locale | kept as is (known quirk, C-04) |
| Other files using the moved names | none: the names are not exported; `market-daily-briefing.ts` and `stock-selector.ts` have their own unrelated prompts | no re-export needed |

## The env argument (the one reported deviation)

`buildEnrichedPrompt` gains one trailing parameter, `env: PromptEnv`, where `PromptEnv = { MAX_POSITION_SIZE?: string; MAX_POSITIONS?: string; STOP_LOSS_PCT?: string }`. Inside the function the five occurrences change from `process.env.X` to `env.X`, nothing else (for example `parseFloat(env.MAX_POSITION_SIZE ?? '0.10')`), so defaults and rounding are untouched. The call site in `claude-agent.ts` (line ~2281) appends `process.env`; `NodeJS.ProcessEnv` is assignable to `PromptEnv`. The parameter is required, so no call can silently fall back to defaults. The function is not exported today, so no other file's signature changes.

## Data flow (unchanged)

1. `runAgentCycle` builds `learningContext`, `macroContext`, `symbolNews`, `watchlistContext`, `effectiveThreshold`, `signalType`, `sectorRotationContext` (all in `claude-agent.ts`).
2. It calls `buildEnrichedPrompt(...)` (now from `prompt-builder.ts`) with the same arguments plus `process.env`, and passes `SYSTEM_PROMPT` as `system` to `callClaudeWithRetry` (still in `claude-agent.ts`).
3. The returned string is the single user message. Parsing and decisions are untouched.

## Edits to claude-agent.ts (and only these)

1. Delete the three moved blocks with their section-header comments.
2. Add one import: `import { SYSTEM_PROMPT, buildEnrichedPrompt } from './prompt-builder'`.
3. Call site: add `process.env` as the last argument.
4. Remove names that become unused from existing import lines (expected: `regimeMultiplier` from `./position-sizing`, `LearnContext` from `./types`; confirmed by grep at implementation; `AlpacaNewsArticle` and `ZSCORE_ENTRY_THRESHOLD` stay, they are still used).

## Tests (new files, independent of the harness)

| File | Content |
|---|---|
| `src/lib/__tests__/prompt-builder.test.ts` | exact-string tests: every label branch and boundary (rsi 30/40/60/70, histogram/line combinations, percentB 0/0.2/0.8/1, SMA above/below/missing, Kalman null/signals/annotation); `buildEnrichedPrompt` for no-setup and each of MEAN_REVERSION, TREND_PULLBACK, TREND_ZLE05, EMA_RECLAIM, TREND_PULLBACK_3DAY; optional sections present/absent; env values read from the argument (changing the argument changes the three prompt lines, changing `process.env` does not); `SYSTEM_PROMPT` exact text |
| `src/lib/__tests__/fixtures/legacy-prompt.ts` | frozen verbatim copy of the original code (same method as `legacy-sizing.ts`), reading `process.env` as the original did |
| differential test (in the same test file) | for a grid of indicators x setups x optional sections x env values, new output equals legacy output exactly |

Tests compute host-dependent fragments (volume `toLocaleString`, news time) with the same API instead of hard-coding them, so they do not depend on the machine locale.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Pass `env` as one narrow argument (chosen) | Smallest edit; five mechanical renames; call site adds one token | The call site hands over the whole `process.env` | Chosen |
| Three separate numeric parameters | Explicit | Changes the parse/default expressions (logic edit) | Rejected |
| Keep the three env reads inside the new module | Zero body edits | Violates the purity rule | Rejected |
| Move only the labels now, the builder later | Zero body edits | Leaves the large block in place; no gain | Rejected |
| Include `callClaudeWithRetry` | Fewer steps later | STEP 0 puts it in `claude-client.ts`; out of scope | Rejected |
| Re-export moved names from `claude-agent.ts` | Backward compatible | Nothing imports them | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/prompt-builder.ts` | CREATE | Moved code, `export` on the moved names, `PromptEnv` type, the five `env.` renames |
| `src/lib/claude-agent.ts` | MODIFY (Protected, explicit owner authorization) | Removed blocks, one import, one call argument, unused-name removals |
| `src/lib/__tests__/prompt-builder.test.ts` | CREATE | Direct and differential tests |
| `src/lib/__tests__/fixtures/legacy-prompt.ts` | CREATE | Frozen original |
| `.github/workflows/pr-review.yml` | MODIFY | One line added to `PROTECTED_ZONE` |
| `vitest.config.ts` | MODIFY | One entry added to `coverage.include` |
| `.tmp/prompt-builder-extraction-report.md` | CREATE | Deliverable (gitignored) |

No golden file, harness file, other workflow or other source file changes.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is touched. The request states explicit owner authorization limited to moving the prompt-building code out and importing it back; this spec treats that as the confirmation for this change only. All other Protected Zone files are untouched. (The PreToolUse hook that the STEP 0 report could not locate is not a factor here: the authorization is given in the conversation.)

## Database Changes

None.

## Open Questions

- **O-1** The CHANGE 0b hardening (harness extension and 15 regenerated goldens) is still **uncommitted** in the working tree. For "zero golden changes" to be checkable with `git diff`, the baseline should be committed first. Default and recommendation: commit CHANGE 0b before implementing this change. If you prefer not to, the implementation will snapshot the golden hashes before starting and compare after, and the report will say so.
- **O-2** The STEP 0 plan included a differential test against a frozen copy (`legacy-prompt.ts`). It duplicates about 140 lines in a test fixture. Default: include it (strongest proof of identity, independent of the harness). Say if you prefer only the exact-string tests.
- **O-3** The env argument shape (`env: PromptEnv`, call site passes `process.env`). Default as designed; the alternative is three explicit parameters (rejected above because it edits expressions).
- **O-4** `ZSCORE_ENTRY_THRESHOLD` stays imported from `./config` inside the new module (a constant, same source as before) instead of being passed as an argument. Default: import. This makes `prompt-builder.ts` depend on a Protected Zone file read-only.
- **O-5** Host dependence of `toLocaleString()` (volume) and `toLocaleTimeString('en-US')` (news times) is preserved. Default: keep, document, do not fix.
- **O-6** Add `export` to the label helpers so they can be unit-tested directly. Default: yes (an addition, not a logic change).
- **O-7** Remove the names that become unused from existing import lines (`regimeMultiplier`, `LearnContext`). Default: yes, to avoid new lint warnings; these are the only edits to existing lines besides the call argument.
- **O-8** `CLAUDE.md`'s permission matrix lists only the 7 original files and the pr-review audit will list the new module after this change. Default: edit only `pr-review.yml` (as authorized); updating the `CLAUDE.md` matrix is a separate request.
- **O-9** Add `src/lib/prompt-builder.ts` to `coverage.include`. Default: yes.
- **O-10** Timing: the cron workflows run the checked-out `main`, so a merge takes effect on the next run. Default: no action in this change; merge outside the cron windows (agent-cron 14-20 UTC and agent-exits 13:30 and 19:55 UTC, Mon-Fri).
