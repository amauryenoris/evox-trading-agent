# Design — Sector Rotation Prompt Context

## Architecture Decision

Sector rotation is a cycle-wide, non-symbol-specific analytical layer, architecturally identical in role to `macroContext`: computed once per `runAgentCycle()` invocation from freshly fetched bars, formatted to plain text, and threaded into every symbol's prompt unchanged. It lives in a new pure-calculation module, `src/lib/sector-rotation.ts`, following the same separation already established by `state-fingerprint.ts` (pure calculation, no I/O) — kept as a distinct file rather than extended into `state-fingerprint.ts`, since sector rotation is a conceptually different data source (relative performance across ETFs) from SPX regime classification (a single index's trend state). The fetch (I/O) and orchestration (calling the pure function, building the text, logging it) stay in `claude-agent.ts`, mirroring exactly how `spxSnapshot`/`computeSpxSnapshot()` and `macroContext`/`macroNews` are currently orchestrated in the same function.

## Data Flow

1. `runAgentCycle()` extends its existing `Promise.all(...)` (currently fetching account, positions, clock, SPY bars at claude-agent.ts:990-1000) with three additional `getBars()` calls for GDX, XLE, XLK — same call shape and `.catch(() => [])` fallback as the SPY fetch.
2. Immediately after `computeSpxSnapshot(spyBars)` (currently claude-agent.ts:1002), call `computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)` from the new module. This is a pure function: for each sector, compute its 20-day return and SPY's 20-day return from the same anti-lookahead reference index (`bars.length - 2`), then subtract.
3. Pass the resulting `SectorRotationSnapshot` into `formatSectorRotationContext()` (also pure) to produce a plain-text block, and log it once (`console.log('[SECTOR_ROTATION]', ...)`), mirroring the existing `[MACRO_SPX]` log pattern.
4. The resulting string is computed once, before the per-symbol loop begins (same lifecycle stage as `macroContext`), and passed unchanged into every `buildEnrichedPrompt()` call within that loop via a new trailing optional parameter.
5. Inside `buildEnrichedPrompt()`'s template literal, the text is rendered conditionally — only when non-empty — between the existing "MACRO & MARKET CONTEXT" and "RECENT NEWS FOR {symbol}" sections.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extend `state-fingerprint.ts` with sector functions | One fewer file | Mixes SPX-regime concerns with cross-ETF relative-strength concerns; breaks that file's confirmed narrow scope | Rejected |
| Smuggle sector text into the existing `macroContext` string | No new parameter needed | Conflates two independently-sourced data feeds (news headlines vs. price-derived relative strength) into one string; harder to test or later disable independently | Rejected |
| New optional trailing parameter on `buildEnrichedPrompt()` | Zero-touch for the sole existing call site; mirrors the already-approved `learnContext`/`currentFingerprint`-style backward-compatible pattern | Slightly longer parameter list (12 positional params) | **Chosen** |
| Refactor `buildEnrichedPrompt()` to a single options object | Would prevent future parameter-list growth | Out of scope — touches every call site and the function body's parameter destructuring for no requirement-driven reason (YAGNI) | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/sector-rotation.ts` | CREATE | `SectorRotationSnapshot` interface, `computeSectorRotation()`, `formatSectorRotationContext()` — pure functions, no I/O |
| `src/lib/claude-agent.ts` | MODIFY (Protected Zone — pre-authorized) | (1) Import the two new functions; (2) extend the cycle-start `Promise.all` with GDX/XLE/XLK `getBars()` calls; (3) call `computeSectorRotation()` + `formatSectorRotationContext()` once per cycle and log the result; (4) add `sectorRotationContext` as a new optional trailing parameter (default `''`) to `buildEnrichedPrompt()`; (5) insert a conditional "SECTOR ROTATION" section into the prompt template between the MACRO and RECENT NEWS sections; (6) pass `sectorRotationContext` at the sole `buildEnrichedPrompt()` call site (claude-agent.ts:1784-1795) |
| `src/lib/__tests__/sector-rotation.test.ts` | CREATE | Unit tests for `computeSectorRotation()` and `formatSectorRotationContext()`, following the `compute-spx-snapshot-window.test.ts` precedent of importing and testing the pure functions directly |

## Verified Facts (STEP 0)

**`macroContext` construction** (claude-agent.ts:1069-1072, current):
```ts
const macroNews = await getMacroNews(12, 8).catch(() => [] as AlpacaNewsArticle[])
const macroContext = macroNews.length > 0
  ? macroNews.map((n) => `• ${n.headline} (${new Date(n.created_at).toLocaleTimeString('en-US')})`).join('\n')
  : 'No major macro news in the last 12 hours.'
```
Style convention confirmed: ternary on data presence, single fallback sentence when there's no data at all (not a per-item "no data" placeholder). `formatSectorRotationContext()` adapts this at the per-sector granularity instead, since sector rotation has three independent values rather than a variable-length news list — each sector line falls back to "no data" independently (FR-07), which is the closest per-item equivalent of the same convention rather than a literal copy, given the shape difference (list of headlines vs. three fixed named ETFs).

**Template lines around the insertion point** (claude-agent.ts:633-640, current — confirmed no drift beyond the diagnostic's approximate line numbers 636/638, which were off by ~1-2 lines from a prior version):
```ts
  return `ANALYSIS REQUEST: ${symbol}

--- MACRO & MARKET CONTEXT (last 12h headlines) ---
${macroContext}

--- RECENT NEWS FOR ${symbol} (last 24h) ---
${symbolNewsSection}
```
Insertion point confirmed: the new section goes after line 636 (`${macroContext}`) and before line 638 (`--- RECENT NEWS FOR...`).

**Optional-section conditional convention** (claude-agent.ts:683-685, current — this is the pattern to replicate, not `effectiveThreshold`'s single-line variant):
```ts
${watchlistContext ? `
--- NEAR-MISS WATCHLIST CONTEXT ---
${watchlistContext}
` : ''}
```

**`buildEnrichedPrompt()` call sites** (confirmed via full-repo grep): exactly **one** call site exists, at claude-agent.ts:1784-1795, inside the per-symbol loop. The originating request's assumption that a second "ranking/best-candidate path" might call it separately does **not** hold — no such second call site exists anywhere in `src/`. This means the new optional parameter requires touching exactly one call site (to pass the new value) and zero other call sites (none exist to break).

**`getBars()` signature** (alpaca.ts:76-81, unchanged): `getBars(symbol, timeframe = '1Day', daysBack = 260, limit = 250)`. The existing SPY fetch uses `getBars('SPY', '1Day', 400)` (3 args, default `limit=250`) — GDX/XLE/XLK fetches mirror this exactly.

**`computeSpxSnapshot()` style precedent** (state-fingerprint.ts:39-77): pure function, `bars.length - 2` anti-lookahead convention, returns an object with `null` fields when insufficient history. `computeSectorRotation()` follows the same anti-lookahead index and null-propagation style.

**`AlpacaBar` shape** (types.ts:66-75): includes `t: string` and `c: number` among other fields, so `getBars()`'s return value (`AlpacaBar[]`) is structurally assignable to the `{ t: string; c: number }[]` parameter type used by `computeSectorRotation()` — no mapping/adapter needed at the call site.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is touched. **This is pre-authorized** — the originating request states explicitly this change is authorized by Amaury for this feature. No additional confirmation gate is being requested in this spec beyond noting it here, per repo convention (`specs/README.md` §3).

## Database Changes

None.

## Open Questions

None — all STEP 0 verification points were confirmed against current source, and no design ambiguity remains. One deviation from the originating request is noted above (single call site instead of the assumed possible second one) but does not require a decision — it simply narrows the implementation surface.
