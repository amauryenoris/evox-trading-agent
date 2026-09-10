# Requirements — Selection Step Error Isolation (stop_reason diagnostics)

## Background

`selectStocksForAnalysis()` (`src/lib/stock-selector.ts`) has three internal
steps that can fail — the Claude API call, response parsing (JSON.parse), and
`insertSelectionDecision()` — plus a fourth failure boundary upstream in
`runAgentCycle()` (`src/lib/claude-agent.ts`): the `getMarketMovers()` screener
fetch / `< 10` candidates check. Today all four collapse into one generic
`catch` in `claude-agent.ts` (`console.warn('Dynamic selection failed, using
static watchlist:', err)`), so a screener outage, a Claude API error, a
malformed/truncated response, and a Supabase write failure are all
indistinguishable in the logs. This is CHANGE 2 of 3 (CHANGE 1, already
merged, raised `SELECTION_MAX_TOKENS` to 8000; CHANGE 3, separate and later,
will persist failures to a new `selection_failures` table). This change only
makes the failure mode identifiable in the log — it does not change what
happens on failure.

Verified against the current file state (2026-09-10):
- `stock-selector.ts`: Claude call at lines 166–172, response-type check +
  `JSON.parse` at lines 174–178, `insertSelectionDecision()` call at line 187.
  (The originating prompt cited 166–171 / 173–177 / 186 — a ~1-line drift from
  the file's current state; the three step boundaries themselves are
  structurally exactly as described.)
- `claude-agent.ts`: `try` at line 1153, `getMarketMovers(30)` at line 1154,
  `selectStocksForAnalysis()` call at line 1156, `catch` block at lines
  1161–1167 — matches exactly.

---

## Functional Requirements

FR-01: The system shall throw a `SelectionStepError` with step `'claude_call'` when the Claude API call inside `selectStocksForAnalysis()` fails.

FR-02: The system shall throw a `SelectionStepError` with step `'json_parse'` when the response-type check or `JSON.parse` of Claude's response inside `selectStocksForAnalysis()` fails.

FR-03: Where the `json_parse` failure coincides with `response.stop_reason === 'max_tokens'`, the system shall set the `SelectionStepError`'s detail to `'max_tokens'` instead of the raw parse error text.

FR-04: The system shall attach `response.stop_reason` to every `json_parse` `SelectionStepError`, whether or not `stop_reason` was `'max_tokens'`.

FR-05: The system shall throw a `SelectionStepError` with step `'db_write'` when `insertSelectionDecision()` inside `selectStocksForAnalysis()` fails.

FR-06: The system shall log, in `claude-agent.ts`'s selection-fallback `catch` block, which step failed (`claude_call` / `json_parse` / `db_write`) and the `stopReason` when present, when the caught error is a `SelectionStepError`.

FR-07: The system shall log a `screener_fetch` failure via the existing generic branch when the caught error in `claude-agent.ts` is not a `SelectionStepError`.

FR-08: The system shall fall back to the static `TRADING_WATCHLIST` (or its existing default string) on any of the four failure modes, unchanged from current behavior.

---

## Non-Functional Requirements

NFR-01: The change shall not alter `selectStocksForAnalysis()`'s successful-path return value, its successful-path side effects, or the Claude API call's parameters (`model`, `max_tokens`, `system`, `messages`).

NFR-02: `npx tsc --noEmit` and `npm run build` shall both pass after the change.

---

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone). Per house rule, this requires Amaury's fresh, explicit, in-conversation confirmation at implementation time — a prior claim of authorization (e.g. "authorized by Jorge, confirmed this session") from the originating prompt is not itself sufficient and must be re-confirmed directly with Amaury before `/implement` proceeds.

C-02: The system must not modify `SELECTION_MAX_TOKENS` or any other Claude call parameter.

C-03: The system must not add a Supabase table or write a failure row anywhere (that is CHANGE 3).

C-04: The system must not change the fallback watchlist's value, source (`TRADING_WATCHLIST` env var / default string), or the decision to fall back — only the log detail describing why.

C-05: The system must not modify `getMarketMovers()`, the Pool A pre-filter logic, or prompt construction in `selectStocksForAnalysis()`.

C-06: The system must not modify any part of `claude-agent.ts` beyond the new import and the body of the existing `catch` block (lines 1161–1167).

## Out of Scope

- CHANGE 1 (raising `SELECTION_MAX_TOKENS` — already merged) and CHANGE 3 (persisting failures to a `selection_failures` table).
- Any change to the fallback watchlist's value or selection logic.
- Any change to `getMarketMovers()`, the screener pre-filter, or prompt construction.
- Any change to `claude-agent.ts` outside the import statement and the one `catch` block.
