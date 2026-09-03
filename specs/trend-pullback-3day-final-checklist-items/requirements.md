# Requirements — TREND_PULLBACK_3DAY Dashboard Badge + Weekly Report Breakdown + db.ts Type-Safety Cleanup

## Background (confirmed against current code, 2026-09-03)

- `src/components/dashboard/ui.tsx:83-97` — `SignalBadge`'s `map` object has exactly 13 entries (`MR`, `TP`, `ZLE`, `EMA`, `TREND`, `TREND_FOLLOWING`, `PULLBACK_EMA50`, `TREND_PULLBACK`, `TREND_ZLE05`, `TREND_ZGT05`, `EMA_RECLAIM`, `NEWS_FILTER`, `NO_SETUP`) — no `TREND_PULLBACK_3DAY` key. Fallback (line 98, `map[signal] ?? { tone: 'neutral', label: signal }`) renders a neutral gray badge showing the raw string `"TREND_PULLBACK_3DAY"` — not a crash, just visually inconsistent with the other trend-family badges.
- `src/lib/report-generator.ts:319-323` (verbatim, confirmed, unchanged from the task prompt's line numbers) — 3 filters (`mrTrades`, `trendPullbackTrades`, `trendZLE05Trades`) feed a local `buildSignalStats()` function (defined at line 309, **not** named `signalStats` — that name belongs to `route.ts`'s separate, differently-shaped function). No `emaReclaimTrades` or `trendPullback3DayTrades` filter exists.
- `report-generator.ts:355-360` — the returned `signalTypeBreakdown` object literal has 4 keys (`meanReversion`, `trend`, `trendPullback`, `trendZLE05`) — no `emaReclaim`, no `trendPullback3Day`.
- **Important correction to the task prompt's plan, found via live verification**: `report-generator.ts:122-127` declares a **strict, named interface** `SignalTypeBreakdown { meanReversion: SignalTypeStats; trend: SignalTypeStats; trendPullback?: SignalTypeStats; trendZLE05?: SignalTypeStats }`, referenced at line 154 as the return-type contract for `calculateDiagnostics()`. Unlike `PerformanceAnalytics.tsx`'s loose inline type (already updated in a prior CHANGE this session), this is a real TypeScript interface. Adding `emaReclaim`/`trendPullback3Day` keys to the object literal at lines 355-360 **without** also adding them to this interface will fail `npx tsc --noEmit` (excess-property check on an object literal assigned against a named interface type). The task prompt's CHANGE section did not mention this interface — it must be updated too, or `tsc` will not pass, which the prompt's own VERIFY section requires.
- **Second correction, found via live verification**: `report-generator.ts:643-680` is the PDF's actual text-rendering section for the Signal Type Breakdown (`doc.text(...)` calls reading `stb.meanReversion`, `stb.trendPullback`, `stb.trendZLE05` — `stb.trend` is also unrendered here, mirroring the dashboard's dead `trend` key). This section is explicitly listed as untouchable by the task prompt ("Do NOT modify report-generator.ts's HOLDs Breakdown section, or any other part of the file beyond the 2 new filters and the 2 new keys in `signalTypeBreakdown`"). **Consequence**: after this CHANGE, `emaReclaim` and `trendPullback3Day` trade stats will be computed and present in the `signalTypeBreakdown` data object, but neither will actually appear in the printed PDF text — the rendering code that would need to read `stb.emaReclaim`/`stb.trendPullback3Day` doesn't exist and adding it is out of scope. This means the task prompt's stated Goal #2 ("weekly PDF report's Signal Type Breakdown includes both EMA_RECLAIM and TREND_PULLBACK_3DAY") is **only partially achieved** by the scoped CHANGE — the data is computed but not surfaced in the actual report a reader sees. This mirrors the two-layer pattern already solved for the live dashboard (API route + `PerformanceAnalytics.tsx` component) — a further CHANGE adding the corresponding `doc.text()` lines would be needed to fully close this gap, and is out of scope here per the prompt's own constraints.
- `src/lib/db.ts:188` and `:316` — two identical type-cast unions, confirmed verbatim and at the same line numbers as the task prompt states: `(row.signal_type as 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | null) ?? null`. Repo-wide search confirms these are the **only two** occurrences of this pattern — no third site exists. These are compile-time-only assertions; the real string value already passes through unchanged at runtime regardless of the union's contents.
- No existing test touches `SignalBadge`, `buildSignalStats`, `calculateDiagnostics`, or either `db.ts` cast site directly (one test file, `outcome-classification.test.ts`, contains a comment referencing `buildSignalStats`/`signalStats` by name but does not import or exercise either function — confirmed via read).
- None of the three files (`ui.tsx`, `report-generator.ts`, `db.ts`) are in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — no special Amaury authorization is required beyond normal spec approval.

## Functional Requirements

FR-01: The system shall render a short, colored badge for a `TREND_PULLBACK_3DAY` signal instead of the neutral fallback badge.
FR-02: The system shall continue to render all 13 existing `SignalBadge` signal types exactly as before this change.
FR-03: The system shall compute `TREND_PULLBACK_3DAY` trade statistics in `report-generator.ts`'s `signalTypeBreakdown.trendPullback3Day` field.
FR-04: The system shall compute `EMA_RECLAIM` trade statistics in `report-generator.ts`'s `signalTypeBreakdown.emaReclaim` field (closing the pre-existing gap that predates `TREND_PULLBACK_3DAY`).
FR-05: The system shall continue to compute `meanReversion`, `trend`, `trendPullback`, and `trendZLE05` identically to before this change.
FR-06: The `db.ts` type-cast union at line 188 shall include `'EMA_RECLAIM'` and `'TREND_PULLBACK_3DAY'` as valid `signalType` values.
FR-07: The `db.ts` type-cast union at line 316 shall include `'EMA_RECLAIM'` and `'TREND_PULLBACK_3DAY'` as valid `signal_type` values, identically to FR-06.
FR-08: The system shall produce no runtime behavior change from FR-06/FR-07 — the underlying string values already pass through unchanged; only the compile-time type accuracy changes.

## Non-Functional Requirements

NFR-01: The `SignalTypeBreakdown` interface (`report-generator.ts:122-127`) shall be widened to include `emaReclaim?: SignalTypeStats` and `trendPullback3Day?: SignalTypeStats` so the object literal at lines 355-360 type-checks — this is a necessary consequence of FR-03/FR-04, not separately requested by the original task prompt, but required for `npx tsc --noEmit` to pass.
NFR-02: The new `TREND_PULLBACK_3DAY` `SignalBadge` entry shall use tone `'green'`, matching its trend-family siblings and the tone already chosen for it in `PerformanceAnalytics.tsx`'s `sigs` array (merged in a prior CHANGE).

## Constraints

C-01: None of the three touched files are in the Protected Zone — no special Amaury confirmation beyond normal spec approval is required.
C-02: Do not modify any `SignalBadge` map entry other than adding the one new `TREND_PULLBACK_3DAY` entry.
C-03: Do not modify `report-generator.ts`'s HOLDs Breakdown section (lines 229-274) — already confirmed in an earlier diagnostic this session to be correctly gate-message-keyed, not signal-type-keyed, and needing no changes.
C-04: Do not modify `report-generator.ts`'s PDF text-rendering section (lines 643-680) — out of scope per the task prompt; see the Background section's documented consequence that this means `emaReclaim`/`trendPullback3Day` will not appear in the actual printed PDF despite being computed.
C-05: Do not modify the 3 existing `report-generator.ts` filters (`mrTrades`, `trendPullbackTrades`, `trendZLE05Trades`) or the `trend` key's composition.
C-06: Do not modify `db.ts`'s function bodies — only the two type-cast union expressions at lines 188 and 316.
C-07: Do not add any new runtime validation, exhaustiveness check, or default-case handling beyond widening the two `db.ts` unions.
C-08: Do not modify `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `alpaca.ts`, `PositionsTable.tsx`, `PerformanceAnalytics.tsx`, or `/api/performance/route.ts` — all already fixed or out of scope per prior CHANGEs this session.

## Out of Scope

- Adding the corresponding `doc.text()` rendering lines to `report-generator.ts`'s PDF output section (lines 643-680) so `emaReclaim`/`trendPullback3Day` actually appear in the printed weekly report — see Background for why this CHANGE alone does not achieve full PDF parity with the dashboard, despite computing the correct data.
- Any runtime validation or exhaustiveness checking on `db.ts`'s widened union types.
- Any architectural change to eliminate the `signalType`-string-literal duplication across `claude-agent.ts`, `db.ts`, `report-generator.ts`, `route.ts`, `PerformanceAnalytics.tsx`, and `ui.tsx`.
