# Design — News Intelligence MACRO Symbol Fallback Fix

## Architecture Decision

This is a single-expression bug fix contained entirely within `classifyNewsItem()` in `src/lib/news-intelligence.ts` — no architectural change. The function already returns a `NewsClassification` object per headline; the only change is which value populates its `symbol` field when `scope === 'MACRO'`. No new files, no new data flow, no new dependencies.

## Data Flow

Unchanged, except for one branch:

1. `newsIntelligenceLayer()` calls `classifyNewsItem(client, article.headline, primarySymbol)`, where `primarySymbol = article.symbols?.[0] ?? null` (the Alpaca-tagged ticker, ambient/unreliable for MACRO articles).
2. Claude Haiku returns `parsed.{scope, symbol, sentiment, impact, reasoning}` as JSON.
3. **Current (buggy)**: `symbol: parsed.symbol ?? symbol` — always falls back to the ambient ticker when `parsed.symbol` is `null`, including when `scope === 'MACRO'` and the `null` was intentional and correct per the prompt's own rule.
4. **Fixed**: `symbol: parsed.scope === 'MACRO' ? null : (parsed.symbol ?? symbol)` — MACRO branch short-circuits to `null` unconditionally; SYMBOL branch keeps the exact existing fallback chain.
5. The returned `NewsClassification` is persisted via `saveNewsEvent()` (unchanged) and also feeds `buildThresholdMap()` in the same cycle (unchanged — already scope-keyed, not symbol-keyed, for MACRO aggregation).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `symbol: parsed.scope === 'MACRO' ? null : (parsed.symbol ?? symbol)` | Minimal, explicit, matches the prompt's own MACRO/symbol=null rule exactly; SYMBOL branch untouched | None significant | **Chosen** |
| Fix at the prompt level (tell Claude to never omit symbol) | N/A | Doesn't fix the root cause — the bug is in the `??` fallback logic, not in what Claude returns; prompt already correctly instructs `symbol MUST be null` for MACRO | Rejected |
| Strip `symbol` from `NewsClassification` entirely for MACRO rows (schema change) | Would make the invariant unrepresentable | Touches `NewsEvent` type, `saveNewsEvent()`, `getWeeklyNewsStats()`, and DB rows — far larger blast radius than the confirmed bug requires; explicitly out of scope per Amaury's decision to keep this isolated | Rejected |
| Also patch `getWeeklyNewsStats()` now to defensively filter null symbols | Would close the downstream misattribution immediately | Explicitly deferred by Amaury as a separate decision — `bullishBoosts`/`bearishPenalties`'s type (`symbol: string | null`) already tolerates a null value without erroring, so nothing breaks if left alone | Rejected (deferred) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/news-intelligence.ts` | MODIFY | Line 139: `symbol: parsed.symbol ?? symbol` → `symbol: parsed.scope === 'MACRO' ? null : (parsed.symbol ?? symbol)` |
| `src/lib/__tests__/news-intelligence.test.ts` | CREATE | First test file for this module (zero prior coverage). Covers the three cases in FR-01–FR-04 by testing `classifyNewsItem()`'s symbol-assignment logic directly. |

## Verified Facts (STEP 0)

**Current lines 125-148 of `news-intelligence.ts`** (no drift since the diagnostic; bug confirmed at line 139):
```ts
125	  try {
126	    const response = await client.messages.create({
127	      model: 'claude-haiku-4-5-20251001',
128	      max_tokens: 256,
129	      messages: [{ role: 'user', content: prompt }],
130	    })
131	    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
132	    const jsonMatch = text.match(/\{[\s\S]*\}/)
133	    if (!jsonMatch) return null
134	    const parsed = JSON.parse(jsonMatch[0]) as Partial<NewsClassification>
135	    if (!parsed.scope || !parsed.sentiment || !parsed.impact) return null
136	    const adjustment = getThresholdAdjustment(parsed.sentiment, parsed.impact)
137	    return {
138	      scope: parsed.scope,
139	      symbol: parsed.symbol ?? symbol,
140	      sentiment: parsed.sentiment,
141	      impact: parsed.impact,
142	      threshold_adjustment: adjustment,
143	      reasoning: parsed.reasoning ?? '',
144	    }
145	  } catch {
146	    return null
147	  }
148	}
```

**Test coverage confirmed**: `Glob src/lib/__tests__/*news*` returns no matches — `news-intelligence.ts` has zero existing unit tests. NFR-02 requires adding the module's first test file, scoped narrowly to the symbol-assignment fix (not full coverage of the whole module, which is out of scope here).

**`getWeeklyNewsStats()` post-fix behavior (informational, not modified)** — `db.ts:680-713`. Its return type is already `bullishBoosts: Array<{ symbol: string | null; adjustment: number }>` (and same for `bearishPenalties`), and the mapping is `events.filter(...).map((e) => ({ symbol: e.symbol, adjustment: e.threshold_adjustment }))` with no scope filter and no null-check. Post-fix, a MACRO row with a strong adjustment will appear in these arrays with `symbol: null` — it will **not** error and will **not** be silently dropped; it will be included as a `{ symbol: null, adjustment: ... }` entry. Whatever currently renders these arrays (the weekly PDF report) will need to decide how to display a null-symbol entry, but that is explicitly a separate follow-up decision per the originating request — not addressed by this fix.

## Protected Zone Impact

`src/lib/news-intelligence.ts` is not in CLAUDE.md's core Protected Zone list (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`), but it **is** listed separately in the File Permission Matrix under "Confirm with Amaury before touching" (reason: "Threshold adjustment logic"). ⚠️ This file requires confirmation before edits. Amaury has already authorized this specific, isolated change via the originating request's explicit diagnostic-and-fix instruction — same pre-authorization pattern used for the sector-rotation feature's `claude-agent.ts` touch.

## Database Changes

None — no schema change, no migration, no backfill (per C-02).

## Open Questions

None. The one ambiguity flagged by the originating request (how `getWeeklyNewsStats()` handles a null-symbol row post-fix) has been answered above as informational reporting, not a design decision blocking this fix.
