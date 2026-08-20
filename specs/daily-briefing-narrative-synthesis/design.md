# Design — Market Daily Briefing (Prompt 2/3: Narrative Synthesis + Orchestration)

## Architecture Decision

This prompt adds one new file, `src/lib/market-daily-briefing.ts`, holding two functions:

1. **`synthesizeDailyBriefingNarrative(spxSnapshot, sectorRotation, macroSentiment): Promise<string>`** — the pure Claude-synthesis function. Takes the three pre-computed inputs as parameters, builds a prompt, calls Claude following `selectStocksForAnalysis()`'s exact pattern, and returns the narrative text. No Supabase access. Testable only at the level of its deterministic sub-logic (prompt assembly / response parsing replicated in tests), matching this codebase's established convention of never mocking the Anthropic SDK.
2. **`generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment): Promise<string>`** — the orchestration function. Computes today's date string inline (`new Date().toISOString().split('T')[0]`), checks for an existing row via the new `getMarketDailyBriefingByDate()` db.ts function, and either (a) returns the existing row's `narrative` unchanged, or (b) calls `synthesizeDailyBriefingNarrative()`, upserts the full row via the new `upsertMarketDailyBriefing()` db.ts function, and returns the newly synthesized narrative.

Two new functions are added to `db.ts`, following the file's uniform patterns:

- **`getMarketDailyBriefingByDate(briefingDate: string): Promise<MarketDailyBriefing | null>`** — a `.select('*').eq('briefing_date', briefingDate).maybeSingle()`-style lookup, returning `null` when no row exists for that date (this is the "first cycle of day" detection the unique index was built for in Prompt 1/3).
- **`upsertMarketDailyBriefing(record: Omit<MarketDailyBriefing, 'id' | 'created_at'>): Promise<void>`** — `.upsert({...}, { onConflict: 'briefing_date' })` followed by the standard `if (error) throw new Error(...)`, matching every other upsert in the file.

A new `MarketDailyBriefing` interface is added to `types.ts`, alongside the other DB-row types `db.ts` already imports from there.

**Field naming decision**: `MarketDailyBriefing`'s fields are declared in `snake_case`, matching the table's actual column names directly (`spx_price`, `macro_sentiment_bullish_count`, etc.) — mirroring `NewsEvent`'s convention rather than `OpenPositionContext`'s/`TradeEvaluation`'s camelCase-with-mapping convention. This is a deliberate choice: `computeSpxSnapshot()`'s and `computeSectorRotation()`'s outputs already use these exact snake_case field names (confirmed in the diagnostic), so a snake_case `MarketDailyBriefing` lets `generateDailyBriefing()` spread those two objects directly into the upsert payload with zero field-renaming — introducing a camelCase mapping layer here would add translation code purely for stylistic consistency with a different existing type, at the cost of the "no field-name translation needed" property the diagnostic specifically called out as valuable.

## Data Flow

```
Caller (Prompt 3/3 — out of scope here)
   │  supplies pre-computed:
   │    spxSnapshot        (from computeSpxSnapshot())
   │    sectorRotation     (from computeSectorRotation())
   │    macroSentiment     (from getAggregateMacroSentiment())
   ▼
generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment)
   │
   │  today = new Date().toISOString().split('T')[0]
   ▼
db.ts: getMarketDailyBriefingByDate(today)
   │
   ├── row exists ──────────────────────────────► return existing row.narrative
   │
   └── row missing
          │
          ▼
     market-daily-briefing.ts: synthesizeDailyBriefingNarrative(spxSnapshot, sectorRotation, macroSentiment)
          │  new Anthropic({ apiKey }) → client.messages.create({ model: 'claude-sonnet-4-6', ... })
          │  response.content[0] → strip ```json fences → parse
          ▼
     narrative: string
          │
          ▼
     db.ts: upsertMarketDailyBriefing({ briefing_date: today, ...spxSnapshot, ...sectorRotation,
                                          macro_sentiment_bullish_count: macroSentiment.bullishCount,
                                          macro_sentiment_bearish_count: macroSentiment.bearishCount,
                                          macro_sentiment_neutral_count: macroSentiment.neutralCount,
                                          narrative })
          │
          ▼
     return narrative
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `MarketDailyBriefing` fields in snake_case, matching table columns directly | Zero field-name translation between `computeSpxSnapshot()`/`computeSectorRotation()` outputs and the upsert payload; matches `NewsEvent`'s existing precedent | Inconsistent with `OpenPositionContext`/`TradeEvaluation`'s camelCase convention elsewhere in `types.ts` | Chosen |
| `MarketDailyBriefing` fields in camelCase, with a mapping step before upsert | Consistent with the majority convention in `types.ts` | Adds a translation layer purely for stylistic consistency; the diagnostic specifically confirmed 1:1 field-name match as a design advantage to preserve | Rejected |
| `generateDailyBriefing()` returns `void` | Simpler signature | Prompt 3/3 (or any other future caller) would need a second call to re-fetch the narrative it just ensured exists — pointless extra DB round trip | Rejected |
| `generateDailyBriefing()` returns the narrative `string` (existing or newly synthesized) | Single call gives the caller exactly what it needs, whether the row was fresh or pre-existing | None significant | Chosen |
| `generateDailyBriefing()` accepts a `briefingDate` parameter instead of computing "today" internally | More flexible (could theoretically backfill a past date) | Not needed by Prompt 3/3's use case (always "today"); backfill is explicitly out of scope; matches the "first cycle of day" framing from Prompt 1/3's design, which is about *today*, not an arbitrary date | Rejected |
| Existence check via `.select('id').eq('briefing_date', ...).limit(1)` (lightweight) | Slightly less data transferred | The orchestration function needs the existing row's `narrative` on the "already exists" branch anyway (FR-05), so a lightweight existence-only check would require a second query | Rejected |
| Existence check via `.select('*').eq('briefing_date', ...).maybeSingle()` (full row) | Single query serves both the existence check and the "return existing narrative" branch | None significant | Chosen |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/market-daily-briefing.ts` | CREATE | `synthesizeDailyBriefingNarrative()` and `generateDailyBriefing()` |
| `src/lib/db.ts` | MODIFY | Add `getMarketDailyBriefingByDate()` and `upsertMarketDailyBriefing()`; extend the existing `./types` import with `MarketDailyBriefing` |
| `src/lib/types.ts` | MODIFY | Add `MarketDailyBriefing` interface (snake_case, matching the table) |
| `src/lib/__tests__/` | CREATE | Test file(s) for `generateDailyBriefing()`'s branching (mocked `db.ts`) and for `synthesizeDailyBriefingNarrative()`'s replicated deterministic sub-logic |

No other file changes. `news-intelligence.ts`, `stock-selector.ts`, `state-fingerprint.ts`, `sector-rotation.ts`, `claude-agent.ts`, and the `market_daily_briefings` migration are all read-only precedents for this prompt, not modified by it.

## Protected Zone Impact

None of `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts` are touched. `types.ts` is explicitly "Touch freely" per `CLAUDE.md`. `db.ts` and the new `market-daily-briefing.ts` file are outside the CLAUDE.md permission matrix's protected list (same situation as the prior `news-classification-record-type` fix).

**None — this feature does not require Protected Zone changes or Amaury confirmation.**

## Database Changes

None — no migration. This prompt only reads/writes the `market_daily_briefings` table created in Prompt 1/3, via two new `db.ts` functions.

## Open Questions

- `max_tokens` for the synthesis Claude call: `selectStocksForAnalysis()` uses `512` for a short JSON selection response; a multi-sentence market narrative likely needs more headroom. Proposing `1024` as a reasonable default (double the precedent, still conservative) — flagging for Amaury's confirmation since it's a cost/quality tradeoff, not something derivable from an existing precedent.
- Narrative output format: should the synthesis prompt request plain prose text (like `classifyNewsItem()`'s `reasoning` field) or strict JSON matching `selectStocksForAnalysis()`'s parsing pattern (`{"narrative": "..."}`) for consistency with NFR-01's "exact pattern" requirement? Proposing strict JSON (`{"narrative": "..."}`) parsed the same way as `selectStocksForAnalysis()` (fence-strip + `JSON.parse`), since NFR-01 calls for replicating that exact response-handling code path — flagging for Amaury's confirmation since it's the one place this prompt's precedent-following requirement has two plausible readings.
