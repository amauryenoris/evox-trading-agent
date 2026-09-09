# Design — Raise max_tokens for selectStocksForAnalysis() (CHANGE 1 of 3)

## Architecture Decision

This is a single-value change to one Claude API call parameter, confined to `stock-selector.ts` (and its test file), with one open placement question for the new constant covered below. No architectural change — `selectStocksForAnalysis()`'s control flow, the outer fallback in `claude-agent.ts`, and `selection_history`'s schema are all untouched. This is the first of three planned, deliberately separated changes for the JSON-truncation incident: this one only raises the ceiling that caused the confirmed 2026-09-07 truncation; CHANGE 2 (per-step error isolation) and CHANGE 3 (failure persistence) are separate, later decisions.

## Data Flow

1. `selectStocksForAnalysis()` builds the Pool A + Pool B prompt (`stock-selector.ts:147-163`) — unchanged.
2. It calls `client.messages.create({ model, max_tokens, system, messages })` (`stock-selector.ts:166-171`) — only `max_tokens`'s value changes, from `3000` to `8000`, sourced from a named constant instead of an inline literal.
3. Response parsing (`stock-selector.ts:173-177`) and the `insertSelectionDecision()` write (`stock-selector.ts:186`) — unchanged; with headroom now available, `JSON.parse` at line 177 is expected to stop throwing `SyntaxError: Unexpected end of JSON input` for the full ~30-candidate Pool A+B set, letting execution reach the write instead of being caught by `claude-agent.ts`'s outer `try/catch` and falling back to the static watchlist.
4. `stock-selector.test.ts:302-314`'s existing assertion is updated to expect `8000` instead of `3000`, so it continues to test the real, current behavior rather than being left broken.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `8000` (as specified) | Diagnostic estimated real need at ~4500-6000 tokens for the candidate_scores array alone, before reasoning/selected-symbols text on top; 8000 gives real headroom above that estimate, not just a bare-minimum bump | Higher cost/latency per call than a tighter number would be — acceptable given this call happens once per cycle (not per-symbol) and directly caused a multi-day data-loss incident | **Chosen** — explicitly specified, and consistent with the diagnostic's own token-need estimate |
| Leave `max_tokens` inline, just change `3000` → `8000` | Smaller diff (one line) | FIX/PROMPT explicitly wants a named constant, not a bare magic number, and this value has now caused one real incident — worth naming for future discoverability even though no other `max_tokens` call site in this codebase does this (see Open Questions) | Rejected — not what was specified |
| Constant placed in `config.ts` (as the FIX/PROMPT instructs) | Matches the FIX/PROMPT's explicit Step 1 instruction; centralizes with other named numeric parameters | `config.ts` is genuinely Protected Zone (contradicting the FIX/PROMPT's own "not Protected Zone" framing — see requirements.md C-02) and is scoped as "trading parameters" (z-score threshold, spread, quote staleness, blacklist) — a Claude API tuning knob is a different domain, and no existing Claude call's `max_tokens` (there are 4 others: `news-intelligence.ts:128`, `learning.ts:149`, `claude-agent.ts:1959`, `market-daily-briefing.ts:140`) lives in `config.ts` either — all 4 are inline literals in their own files | **Open question — not decided here, see below** |
| Constant placed as a local, module-scoped constant directly in `stock-selector.ts` (e.g. alongside `MAX_DAILY_CHANGE_PCT`/`MAX_POOL_A_CANDIDATES`, which already follow exactly this pattern in this same file) | No Protected Zone touch at all; matches this file's own existing local-constant convention (`stock-selector.ts:20-22` already has 3 such constants); matches how every other Claude call's `max_tokens` in this codebase is handled (inline in its own file, just not literal) | Diverges from the FIX/PROMPT's literal Step 1 instruction to put it in `config.ts` | **Open question — not decided here, see below** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | Line 168: `max_tokens: 3000` → `max_tokens: SELECTION_MAX_TOKENS` (or equivalent name), sourced from either a new local constant in this file or an import from `config.ts` — see Open Questions. |
| `src/lib/config.ts` | MODIFY (conditional) | Only if Amaury chooses the config.ts placement — see Open Questions. **Protected Zone — requires explicit confirmation before this file is touched**, notwithstanding the FIX/PROMPT's incorrect "not Protected Zone" framing. |
| `src/lib/__tests__/stock-selector.test.ts` | MODIFY | Line 312 (currently `expect.objectContaining({ max_tokens: 3000 })`) updated to `8000`. No other test in this file touched. |

## Protected Zone Impact

**Conditional on the Open Question below.** If the constant is placed in `config.ts`: ⚠️ Requires Amaury's explicit, in-conversation confirmation before implementation — `config.ts` is Protected Zone per `CLAUDE.md`, regardless of the originating FIX/PROMPT's claim otherwise. If the constant is instead placed locally in `stock-selector.ts` (not Protected Zone): **None — no Protected Zone file is touched.**

`claude-agent.ts` (Protected Zone) is explicitly NOT touched by this CHANGE either way, per FR-05/C-01 — confirmed unchanged by design.

## Database Changes

None.

## Open Questions

- **Where should the new `max_tokens` constant live — `config.ts` (Protected Zone, but matches the FIX/PROMPT's literal instruction) or a local constant in `stock-selector.ts` (not Protected Zone, matches this file's own existing local-constant convention and every other `max_tokens` call site's inline-in-its-own-file pattern)?** The FIX/PROMPT itself hedges on this ("confirm actual placement convention at implementation time rather than guessing") while still giving `config.ts` as its Step 1 instruction — but that instruction rests on an incorrect Protected Zone assumption. This needs Amaury's explicit choice before implementation, not an assumption either way. Recommendation if asked: the local `stock-selector.ts` constant, since it requires no Protected Zone confirmation, matches this file's own established pattern (`MAX_DAILY_CHANGE_PCT`, `HIGH_RELATIVE_VOLUME_THRESHOLD`, `MAX_POOL_A_CANDIDATES` are all already local constants in this exact file), and matches how every other Claude call's `max_tokens` in this codebase already works — but this is a recommendation, not a decision made on Amaury's behalf.
