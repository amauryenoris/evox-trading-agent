# Design — Fix RejectedSetups' Stale Filter + Broaden to Spread Gate and MR_RANGING_ADX_GATE

## Architecture Decision

This is a pure read/display fix confined to two already-existing files, both in the "Touch freely" zone per `CLAUDE.md`: `src/app/api/rejected-today/route.ts` (the query + per-row classification) and `src/components/dashboard/RejectedSetups.tsx` (the type union + badge rendering + empty-state text). No new file, no new query, no schema change, no Protected Zone involvement.

## Data Flow

1. `/api/rejected-today` queries `agent_log` filtered to today, `error ILIKE` one of 4 prefixes (currently 2, stale) — widened to `TREND_ZGT125%`, `TREND_QUALITY_FAIL%`, `Spread gate%`, `MR_RANGING_ADX_GATE%`.
2. Each returned row is classified into a `kind` by checking which prefix its `error` field starts with — the existing pattern (`err.toUpperCase().startsWith('TREND_QUALITY_FAIL') ? 'TREND_QUALITY_FAIL' : 'TREND_ZGT05'`, a binary ternary) extends to a 4-way check (an `if`/`else if` chain checking each prefix in turn, or an equivalent ternary chain — the exact shape is an implementation detail left to `/implement`, constrained only by NFR-01: extend the existing prefix-matching pattern, don't restructure it into a lookup table or separate module).
3. `reason` text per kind: `TREND_ZGT125` and `TREND_QUALITY_FAIL` reuse their existing reason-string construction (z-score/ADX values already parsed from `indicators`); `SPREAD_GATE` and `MR_RANGING_ADX_GATE` need their own reason strings built from the same `indicators` object already being destructured (z-score from `kalman.zScore`, ADX from `indicators.adx` — both already extracted per-row) — no new indicator field needs parsing beyond what's already read.
4. `RejectedSetups.tsx` receives the 4-kind array, renders a table row per entry with a badge whose label matches the kind (`Z>1.25`, `QUALITY`, a short Spread-gate label, a short MR-Ranging-ADX label).
5. Empty state renders when `rows.length === 0`, with text no longer scoped to "trend" specifically.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Also include Liquidity gate and the generic "Setup gate:" message now, since the component is already being touched | One fix instead of two later | Both are confirmed dormant (0 rows/30 days) — adds classification branches and badge labels for categories with no current data to validate against, and explicitly rejected by the user's design decision | Rejected — 4 categories only, per explicit scope |
| Restructure classification into a lookup table (`Record<string, {kind, label}>`) keyed by prefix | Slightly more extensible for a future 5th/6th category | Explicitly out of scope (NFR-01) — the CHANGE spec instructs extending the existing ternary/if pattern, not restructuring it | Rejected — extend existing shape |
| Fix `ui.tsx`'s separate stale `TREND_ZGT05` `SignalBadge` entry in the same pass, since it's the same root cause (threshold renamed, references not updated) | Fixes a second, related stale reference while already in this area of the codebase | Different component (`SignalBadge`, used for `signalType` display elsewhere), different file, not mentioned in the CHANGE's file list or DO NOT CHANGE section — silently expanding scope | Rejected — out of scope, noted for awareness only, not touched |
| Keep the Card label "Rejected Today · monitoring" unchanged | Simpler diff | Explicitly confirmed by the user's own CHANGE section as acceptable to keep, since it was never trend-specific wording | Kept as-is — not a "decision" so much as confirmed no-op |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/app/api/rejected-today/route.ts` | MODIFY | Widen the `.or(...)` filter from 2 to 4 prefixes; extend the per-row `kind`-assignment logic from a 2-way to a 4-way classification; add reason-string construction for the 2 new kinds using already-parsed `indicators` fields |
| `src/components/dashboard/RejectedSetups.tsx` | MODIFY | Widen `RejectedEntry['kind']` union from 2 to 4 values; update the `TREND_ZGT05`→`TREND_ZGT125` badge label from "Z>0.5" to "Z>1.25"; add 2 new badge label mappings (`SPREAD_GATE`, `MR_RANGING_ADX_GATE`); update empty-state text to drop "trend"-specific wording |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. Neither touched file is in `CLAUDE.md`'s File Permission Matrix's "Confirm with Amaury before touching" list; both are dashboard/API files in the "Touch freely" zone.

## Database Changes

None. No migration, no new column, no new table — the fix only widens an existing `SELECT ... WHERE error ILIKE ...` filter already present in `route.ts`.

## Open Questions

- None. This is a narrowly-scoped, fully-diagnosed fix: the stale-filter root cause, the live category distribution, and the message richness of all 4 target categories were independently confirmed via live code reads and a live database query earlier in this session, immediately before this spec was written.
