# Requirements — PositionsTable ACTIVATION_PCT: Add TREND_PULLBACK_3DAY

## Background (confirmed against current code, 2026-09-02)

- `src/components/dashboard/PositionsTable.tsx:7-13` defines a manually-duplicated copy of `claude-agent.ts`'s `ACTIVATION_PCT` map, annotated with the comment `// ADAPTED: mirrors claude-agent.ts ACTIVATION_PCT — same values, kept in sync manually`:
  ```ts
  const ACTIVATION_PCT: Record<string, number> = {
    MEAN_REVERSION: 0.05,
    TREND:          0.06,
    TREND_PULLBACK: 0.06,
    TREND_ZLE05:    0.03,
    EMA_RECLAIM:    0.04,
  }
  ```
  `TREND_PULLBACK_3DAY` is absent. `claude-agent.ts`'s real map already contains `TREND_PULLBACK_3DAY: 0.06`.
- `PositionsTable.tsx:37` reads this map with a fallback for unknown keys: `const activatePct = ((ACTIVATION_PCT[signal] ?? 0.05) * 100).toFixed(0)`. For any position with `signalType === 'TREND_PULLBACK_3DAY'`, this silently falls back to `0.05` (displayed as "5%") instead of the correct `0.06` ("6%") — a live, currently-visible incorrect value for any open `TREND_PULLBACK_3DAY` position.
- `PositionsTable.tsx` is not a Protected Zone file. Per `CLAUDE.md`'s File Permission Matrix, `src/components/dashboard/**` is listed under "Touch freely" — no special Amaury authorization is required beyond normal spec approval.
- No test file exists for `PositionsTable.tsx` (confirmed via repo-wide glob for `*PositionsTable*` — only the component file itself matches). No test will be affected by this change.

## Functional Requirements

FR-01: The system shall use `0.06` as the trailing-stop activation percentage for a position where `signalType === 'TREND_PULLBACK_3DAY'`.
FR-02: The system shall continue to use the existing, unchanged activation percentage for each of the 5 previously-defined signal types (`MEAN_REVERSION`, `TREND`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`).
FR-03: The system shall continue to fall back to `0.05` for any `signalType` value not present in the map (unchanged existing behavior, e.g. `null`/`undefined`/an unrecognized string).

## Non-Functional Requirements

NFR-01: The change shall be a single added key-value pair to the existing `ACTIVATION_PCT` object literal — no restructuring, no extraction to a shared module.

## Constraints

C-01: This feature does not touch the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — no special Amaury confirmation beyond normal spec approval is required.
C-02: Do not modify the 5 existing key-value pairs in `ACTIVATION_PCT`.
C-03: Do not modify how `ACTIVATION_PCT` is consumed elsewhere in `PositionsTable.tsx` (line 37 and its usage stay as-is).
C-04: Do not modify `claude-agent.ts`, `/api/performance/route.ts`, `ui.tsx`, `report-generator.ts`, `db.ts`, or any other file — each of those is a separately-scoped follow-up identified in the prior diagnostic, not part of this fix.
C-05: Do not attempt to eliminate the manual-duplication pattern (e.g. importing the map from a shared constants module) — that is a larger architectural change, out of scope here.

## Out of Scope

- `/api/performance/route.ts`'s missing `signalTypeBreakdown` bucket for `TREND_PULLBACK_3DAY`.
- `ui.tsx`'s `SignalBadge` map missing a `TREND_PULLBACK_3DAY` entry.
- `report-generator.ts`'s weekly-PDF signal-type breakdown missing `emaReclaim`/`trendPullback3Day` buckets.
- `db.ts`'s `as` type-cast unions missing `'EMA_RECLAIM'`/`'TREND_PULLBACK_3DAY'`.
- Any architectural change to how the dashboard's duplicated constants stay in sync with `claude-agent.ts`.
