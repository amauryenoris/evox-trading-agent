# Design — Wire Market Daily Briefing into selectStocksForAnalysis() (Prompt 3/3)

## Architecture Decision

This is the final wiring step of the Market Daily Briefing feature, connecting the already-shipped synthesis/orchestration layer (`market-daily-briefing.ts`, `db-market-briefing.ts`) to the actual candidate-selection prompt. It touches exactly two files: `claude-agent.ts` (orchestrates the fetch, isolates its failure mode, passes the result downstream) and `stock-selector.ts` (accepts the narrative as a new optional parameter, injects it into the prompt using the same conditional-block idiom already established by `buildEnrichedPrompt()`'s `sectorRotationContext` parameter).

The core design constraint, confirmed by Amaury: **a briefing failure must never affect the static-watchlist fallback**. `selectStocksForAnalysis()`'s existing `try`/`catch` (`claude-agent.ts:1038-1052`) falls back to a static watchlist on ANY thrown error — including, if the briefing fetch were inside that same block, a `getAggregateMacroSentiment()`/`generateDailyBriefing()` failure that has nothing to do with dynamic stock selection actually working. The briefing fetch therefore gets its own, separate `try`/`catch`, placed *before* the existing block, so its only possible effect on downstream behavior is whether `briefingNarrative` is populated or empty — never whether dynamic selection is attempted at all.

## Data Flow

```
runAgentCycle()
   │
   │  (existing, unmodified) Promise.all: account, positions, clock, spyBars, gdxBars, xleBars, xlkBars
   │  (existing, unmodified) spxSnapshot = computeSpxSnapshot(spyBars)
   │  (existing, unmodified) sectorRotation = computeSectorRotation(...)
   │  (existing, unmodified) sectorRotationContext = formatSectorRotationContext(sectorRotation)
   ▼
NEW — isolated try/catch:
   │  macroSentiment = await getAggregateMacroSentiment(12)
   │  briefingNarrative = await generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment)
   │  (success) console.log('[BRIEFING]', briefingNarrative)
   │  (failure) console.error('[BRIEFING] Failed to generate/fetch daily briefing:', err)
   │            briefingNarrative stays '' (its let-initialized default)
   ▼
(existing, unmodified) try { candidates = await getMarketMovers(30); ... }
   │
   ▼
selectStocksForAnalysis(candidates, account, positions, briefingNarrative)   ← NEW 4th arg
   │
   │  (inside stock-selector.ts, NEW conditional section)
   │  ${briefingNarrative ? `--- TODAY'S MARKET BRIEFING ---\n${briefingNarrative}\n` : ''}
   ▼
Claude's existing selection call — unchanged mechanism, richer prompt context
```

`generateDailyBriefing()`'s own internal "already exists for today" check (built in Prompt 2/3) means this call is cheap on every cycle after the first of the day — no redundant Claude call, matching the confirmed design intent from the original diagnostic.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Briefing fetch inside the existing dynamic-selection `try`/`catch` | Fewer lines, one less `try` block | A `getAggregateMacroSentiment()`/`generateDailyBriefing()` failure would trigger the static-watchlist fallback even though dynamic selection itself would have worked fine — conflates two independent failure modes | Rejected — explicitly forbidden by Amaury's confirmed design decision |
| Briefing fetch in its own isolated `try`/`catch`, placed before the existing block | Failure isolation exactly as required; matches the existing GDX/XLE/XLK per-fetch `.catch()` isolation pattern already used just above it | One more block in an already-long function | Chosen |
| Pass `briefingNarrative` as a required (non-optional) 4th parameter | Forces every call site to be explicit | No other call site exists yet, and requiring it would make future ad-hoc calls (tests, potential future callers) more brittle for no benefit | Rejected |
| Pass `briefingNarrative` as an optional 4th parameter defaulting to `''` | Zero-friction default matching `buildEnrichedPrompt()`'s established `sectorRotationContext: string = ''` precedent exactly; any future caller omitting it gets identical pre-wiring behavior | None significant | Chosen |
| Insert the new prompt section inside Pool A/B construction | Might read as more "data-pool-like" | Diagnostic explicitly confirmed insertion point is portfolio-state-adjacent (after "Currently held"), not pool data — narrative context belongs with the other scene-setting lines, not the selection pools | Rejected |
| Insert the new prompt section right after "Currently held:" and before "--- POOL A ---" | Matches the confirmed insertion point; keeps macro/narrative context together before the data pools | None significant | Chosen |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Extend the `./news-intelligence` import; add an import for `generateDailyBriefing`; add one isolated `try`/`catch` block fetching `macroSentiment` + `briefingNarrative`; add `briefingNarrative` as a 4th argument to the existing `selectStocksForAnalysis()` call |
| `src/lib/stock-selector.ts` | MODIFY | Add `briefingNarrative: string = ''` as a 4th parameter; add one new conditional prompt section |
| `src/lib/__tests__/stock-selector.test.ts` | CREATE | First-ever test coverage for `selectStocksForAnalysis()` — covers the new conditional section only (non-empty vs. empty `briefingNarrative`), per the codebase's "never mock Anthropic" convention |

No other file changes. `market-daily-briefing.ts`, `db-market-briefing.ts`, `news-intelligence.ts`, `sector-rotation.ts`, `buildEnrichedPrompt()`, and all gate/signal/execution logic are untouched.

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is touched** — this is the CLAUDE.md hard Protected Zone. Although the diagnostic prompt states this wiring is "authorized by Amaury," and the change is narrowly scoped (2 import lines, ~8 new lines in an isolated try/catch, 1 argument added to an existing call — nothing in gate/signal/execution logic), **explicit confirmation is still required before implementation begins**, per this project's standing rule that Protected Zone changes are never assumed from spec approval alone. This is flagged here for that confirmation to be given explicitly in `tasks.md`'s Pre-Implementation checklist, not skipped because a diagnostic mentioned prior authorization.

`stock-selector.ts` is not in the CLAUDE.md hard Protected Zone or the `specs/README.md` extended list.

## Database Changes

None.

## Open Questions

- None. All design decisions (failure isolation, parameter defaulting, insertion point, import extension) were resolved across the two-round diagnostic per the prompt's stated context.
