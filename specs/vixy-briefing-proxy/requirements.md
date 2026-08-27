# Requirements — VIXY 1-Day % Change into Market Daily Briefing

## Functional Requirements

FR-01: The system shall compute VIXY's 1-day percentage change from its confirmed close (yesterday) versus the prior confirmed close (day before yesterday), excluding today's still-forming bar.

FR-02: The system shall return `null` from the 1-day change computation when fewer than 3 bars are supplied.

FR-03: The system shall return `null` from the 1-day change computation when the reference past close is `0`.

FR-04: The system shall include a formatted VIX-proxy line in the daily briefing's Claude prompt, alongside the existing SPX, sector-rotation, and macro-sentiment sections.

FR-05: Where the 1-day change value is `null`, the system shall render a "no data" message for the VIX-proxy prompt line.

FR-06: Where the 1-day change value is not `null`, the system shall render a signed percentage in the VIX-proxy prompt line.

FR-07: The system shall include, in every rendering of the VIX-proxy prompt line (data present or absent), wording that identifies VIXY as directional-only and explicitly not the real VIX index level.

FR-08: The system shall persist the computed 1-day change value (or `null`) to `market_daily_briefings.vix_proxy_change`, replacing today's hardcoded `null`.

FR-09: Where the VIXY bars fetch fails or returns insufficient data, the system shall allow the rest of the daily-briefing cycle to complete normally, with `vix_proxy_change` persisted as `null`.

## Non-Functional Requirements

NFR-01: This change shall not add a new external data provider — VIXY is fetched via the existing Alpaca `getBars()` path, identically to SPY/GDX/XLE/XLK.

NFR-02: This change shall not alter the existing SPY/GDX/XLE/XLK fetches, their individual `.catch()` fallbacks, or the `spxSnapshot`/`sectorRotation` computations.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, a Protected Zone file — explicitly authorized by Amaury for this change, confined to the two insertion points described in this spec (a new `Promise.all` entry and a new `generateDailyBriefing()` argument).

C-02: `src/lib/sector-rotation.ts` must not be modified — the 1-day change computation lives entirely in `market-daily-briefing.ts` as a new, separate function.

C-03: `src/lib/db-market-briefing.ts` must not be modified — the `vix_proxy_change` column already exists.

C-04: `upcoming_events_note` must remain `null` — out of scope for this change.

C-05: `NARRATIVE_SYSTEM_PROMPT`'s existing JSON response schema and wording must not change beyond incorporating the new VIX-proxy data section into the prompt's input list.

C-06: The existing `market-daily-briefing.test.ts` `buildBriefingRecord` test (currently asserting `vix_proxy_change: null`) shall be deliberately updated to assert a real, non-null value — this is an intentional, spec-mandated update, not a prohibited regression.

C-07: No other existing test assertion, in either `market-daily-briefing.test.ts` or `db-market-briefing.test.ts`, may be modified.

C-08: `npx tsc --noEmit` and `npm run build` must both pass.

## Out of Scope

- Replacing this proxy with real VIX data via FMP — explicitly deferred to a future change once paid FMP access is activated; this implementation is designed to have a minimal, isolated replacement surface (one compute function, one formatter, one narrative caveat) when that happens.
- `upcoming_events_note` / any economic-calendar data — a separately deferred piece.
- Any change to `sector-rotation.ts`'s 20-day relative-strength computation or its `relativeReturnPct()` helper.
- Backfilling `vix_proxy_change` for any historical `market_daily_briefings` rows already persisted with `null`.
