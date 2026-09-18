# Requirements — Fix RejectedSetups' Stale Filter + Broaden to Spread Gate and MR_RANGING_ADX_GATE

## Functional Requirements

FR-01: The system shall include `agent_log` rows whose `error` starts with `TREND_ZGT125` in `/api/rejected-today`'s query results.
FR-02: The system shall include `agent_log` rows whose `error` starts with `TREND_QUALITY_FAIL` in `/api/rejected-today`'s query results.
FR-03: The system shall include `agent_log` rows whose `error` starts with `Spread gate` in `/api/rejected-today`'s query results.
FR-04: The system shall include `agent_log` rows whose `error` starts with `MR_RANGING_ADX_GATE` in `/api/rejected-today`'s query results.
FR-05: The system shall not include `agent_log` rows whose `error` starts with `Liquidity gate` in `/api/rejected-today`'s query results.
FR-06: The system shall not include `agent_log` rows whose `error` starts with the generic `Setup gate: no mean reversion` message in `/api/rejected-today`'s query results.
FR-07: The system shall classify each returned row into exactly one of four kinds — `TREND_ZGT125`, `TREND_QUALITY_FAIL`, `SPREAD_GATE`, `MR_RANGING_ADX_GATE` — based on which error prefix the row's `error` field starts with.
FR-08: Where a row's kind is `TREND_ZGT125`, `RejectedSetups` shall render a badge labeled to reflect the 1.25 threshold (not the stale 0.5 threshold).
FR-09: Where a row's kind is `TREND_QUALITY_FAIL`, `RejectedSetups` shall render a badge with its existing "QUALITY" label, unchanged.
FR-10: Where a row's kind is `SPREAD_GATE`, `RejectedSetups` shall render a badge with a short, clear label reusing the existing `Badge` component's tone system.
FR-11: Where a row's kind is `MR_RANGING_ADX_GATE`, `RejectedSetups` shall render a badge with a short, clear label reusing the existing `Badge` component's tone system.
FR-12: Where zero rows are returned, `RejectedSetups` shall display empty-state text that does not reference "trend" specifically.

## Non-Functional Requirements

NFR-01: The classification logic added to `/api/rejected-today/route.ts` shall extend the existing per-row `kind`-assignment pattern (prefix-based `if`/ternary matching), not restructure it into a different shape (e.g. a lookup table, a separate classifier module).
NFR-02: No new Supabase query, table, or index shall be introduced — the existing single `agent_log` query is extended only by widening its `.or(...)` filter.

## Constraints

C-01: Neither `src/app/api/rejected-today/route.ts` nor `src/components/dashboard/RejectedSetups.tsx` is in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — no special authorization is required for this change, unlike the three `claude-agent.ts` fixes earlier this session.
C-02: The system shall not modify `src/lib/claude-agent.ts` or any error-message string produced by it — this change only alters what the dashboard reads and displays, not what gets logged.
C-03: The system shall not modify `src/components/dashboard/AgentReasoningLog.tsx` or any part of the Analytics tab.
C-04: The system shall not modify the 60-second polling interval, the shared `Card` component, or any other part of the Intelligence tab beyond `RejectedSetups.tsx` itself.
C-05: The system shall not add Liquidity gate or the generic "Setup gate: no mean reversion..." message to the query or classification — confirmed dormant (0 occurrences/30 days), explicitly excluded.

## Out of Scope

- `src/components/dashboard/ui.tsx`'s separate, also-stale `TREND_ZGT05` entry in `SignalBadge`'s tone map (line 94) — a different component, a different stale reference, unrelated to the `RejectedEntry`/`RejectedSetups` badge this spec touches. Noted for awareness in `design.md`, not part of this CHANGE.
- Liquidity gate and generic "Setup gate: no mean reversion..." coverage — dormant, deferred per the user's explicit design decision.
- Any change to `AgentReasoningLog.tsx`'s already-existing, broader "Gate Blocked" classification — this fix does not duplicate or replace it, it only repairs and extends this Intelligence-tab-specific, today-only, grouped view.
- Any new dashboard section, new API route, or new database query beyond widening the existing one.
