# Requirements — Raise max_tokens for selectStocksForAnalysis() (CHANGE 1 of 3)

## Functional Requirements

FR-01: The system shall set `max_tokens` to `8000` on the Claude API call inside `selectStocksForAnalysis()`, replacing the current value of `3000`.

FR-02: The system shall express this value as a named constant, not an inline numeric literal, at the call site.

FR-03: The system shall NOT change any other parameter of that Claude API call (`model`, `system`, `messages`).

FR-04: The system shall NOT change any logic in `selectStocksForAnalysis()` other than the `max_tokens` value's source (screener-fetch logic, prompt construction, response parsing, and the Supabase write remain byte-identical).

FR-05: The system shall NOT change `claude-agent.ts`'s outer try/catch or static-watchlist fallback logic (`claude-agent.ts:1151-1167`).

FR-06: Where an existing test asserts the old `max_tokens` value, the system shall update that assertion to the new value rather than leave it failing.

## Non-Functional Requirements

NFR-01: The new constant shall be named descriptively enough to be unambiguous at its call site (e.g. indicates it governs the stock-selection Claude call specifically, not a generic/shared token limit).

## Constraints

C-01: This feature must not modify the Protected Zone (`claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) without explicit confirmation from Amaury — none of these are touched by this CHANGE's functional requirements.

C-02: **`src/lib/config.ts` is also a core Protected Zone file** per `CLAUDE.md` ("PROTECTED (confirm with Amaury before touching): src/lib/config.ts" — listed first, described as trading-parameter source of truth). The originating FIX/PROMPT's own header states config.ts is "not Protected Zone" — this is factually incorrect per this repository's own documented rules, re-verified live this session, and is corrected here rather than carried forward. **If `config.ts` is the chosen placement for the new constant (see design.md → Open Questions), that touch requires the same explicit, in-conversation Protected Zone confirmation as any other `config.ts` change** — not assumed from the FIX/PROMPT's mistaken framing.

C-03: This feature shall not modify any other test in `stock-selector.test.ts` beyond the one assertion that hard-codes the old `max_tokens` value.

C-04: This feature shall not add per-step error isolation, `stop_reason`-based failure classification, or any new database table — those are CHANGE 2 and CHANGE 3, explicitly deferred.

## Out of Scope

- CHANGE 2 (per-step error isolation in `claude-agent.ts:1151-1167` using `response.stop_reason`).
- CHANGE 3 (persisting selection failures to a new table).
- Any change to `insertSelectionDecision()`, `db.ts`, or `selection_history`'s schema.
- Re-tuning any other Claude call's `max_tokens` value in this codebase (`news-intelligence.ts`, `learning.ts`, `claude-agent.ts:1959`, `market-daily-briefing.ts`) — all four remain untouched, inline literals, exactly as they are today.
