# Requirements — Close 2 MEDIUM Findings from the VIXY Review

## Functional Requirements

FR-01: Where `computeVixyChangePct()`'s output is `null`, the system shall render a "no data" VIX-proxy message that includes the directional-only, not-the-real-VIX-level caveat wording.

FR-02: The system shall render the signed-percentage VIX-proxy message (the non-null case) with wording unchanged from its current form.

FR-03: The system shall describe the VIX-proxy reading as one of the inputs Claude receives, in `NARRATIVE_SYSTEM_PROMPT`'s descriptive sentence.

## Non-Functional Requirements

NFR-01: This fix shall not change `NARRATIVE_SYSTEM_PROMPT`'s JSON response schema.

NFR-02: This fix shall not alter any computation — only the two text strings identified in Context.

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`).

C-02: No file other than `src/lib/market-daily-briefing.ts` (and its test file, only if an existing assertion's exact string must be updated to match) may be modified.

C-03: `formatVixyChangeContext()`'s non-null branch must remain byte-identical.

C-04: `computeVixyChangePct()`, the `claude-agent.ts` VIXY wiring, and every other part of the VIXY feature must remain unchanged.

C-05: `npx tsc --noEmit` and `npm run build` must both pass.

## Out of Scope

- Any change to `computeVixyChangePct()`'s computation logic.
- Any change to `claude-agent.ts` — no part of this fix touches the Protected Zone.
- Any other wording in `NARRATIVE_SYSTEM_PROMPT` beyond the one descriptive sentence identified.
- Re-litigating whether the two prior findings were correctly classified as MEDIUM — this spec exists specifically to close them, not to re-evaluate them.
