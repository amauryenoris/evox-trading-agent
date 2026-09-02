# Design — PositionsTable ACTIVATION_PCT: Add TREND_PULLBACK_3DAY

## Architecture Decision

This is a one-line addition to a hardcoded, manually-synced constant object inside a single dashboard component: `src/components/dashboard/PositionsTable.tsx`. It lives entirely in the presentation layer — `ACTIVATION_PCT` exists solely to render the "trailing-stop activates at X%" label on a position card, and has no effect on actual trading behavior (the real, authoritative `ACTIVATION_PCT` map lives in `claude-agent.ts` and already includes `TREND_PULLBACK_3DAY: 0.06`; that map governs real trailing-stop logic and is untouched here).

## Data Flow

1. `PositionCard` (`PositionsTable.tsx`) receives a `PositionDisplay` prop with `signalType` (typed as `string | null` in `src/lib/types.ts`).
2. Line 36-37: `const signal = p.signalType ?? 'default'; const activatePct = ((ACTIVATION_PCT[signal] ?? 0.05) * 100).toFixed(0)`.
3. Today, for `signal === 'TREND_PULLBACK_3DAY'`, the lookup misses and falls back to `0.05` → renders "5%".
4. After this fix, the lookup hits the new `TREND_PULLBACK_3DAY: 0.06` entry → renders "6%", matching the real value `claude-agent.ts` already uses for this setup's trailing stop.
5. No other component, API route, or backend file reads this specific object — it's local to this file.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add the single missing key to the existing object (as specified) | Matches the existing manual-duplication pattern exactly; minimal diff; fixes the live incorrect value immediately | Perpetuates the manual-sync pattern (a value can drift again if `claude-agent.ts`'s map changes without this file being updated) | Chosen — matches the explicitly scoped, narrow fix; the manual-duplication pattern itself is called out as intentionally out of scope |
| Extract `ACTIVATION_PCT` into a shared constants module imported by both `claude-agent.ts` and `PositionsTable.tsx` | Eliminates the drift class of bug permanently | Larger architectural change; touches a Protected Zone file (`claude-agent.ts`) for a change that doesn't need Protected Zone access otherwise; explicitly out of scope per this task's constraints | Rejected — out of scope, a good candidate for a future consolidation effort |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/components/dashboard/PositionsTable.tsx` | MODIFY | Add one key-value pair (`TREND_PULLBACK_3DAY: 0.06`) to the existing `ACTIVATION_PCT` object literal (lines 7-13). No other line changes. |

## Protected Zone Impact

None — `src/components/dashboard/PositionsTable.tsx` is listed under "Touch freely" in `CLAUDE.md`'s File Permission Matrix. No Amaury confirmation beyond normal spec review is required for this change.

## Database Changes

None.

## Open Questions

None — this is a fully-specified, low-ambiguity, single-line fix with no design decisions left open.
