# Design — Remove Redundant Signal-Type Label from PerformanceAnalytics.tsx

## Architecture Decision

Pure presentation-layer cleanup, confined to one JSX render location inside `PerformanceAnalytics.tsx`'s `sigs.map()` block. No data flow, type, or API change — the `Sig` interface and `sigs` array construction remain fully intact; only what's rendered from `s.label` is removed.

## Data Flow

1. `sigs` array is built as before (unchanged) — each entry still carries `label`.
2. In the render (`sigs.map((s) => ...)`), the card header `<div className="flex items-center gap-2.5">` currently renders `<SignalBadge signal={s.type} />` followed by `<span className="text-[11px] text-mute2">{s.label}</span>`.
3. The `<span>` is removed; the `<div>` now renders only `<SignalBadge signal={s.type} />`.
4. `s.label` becomes a computed-but-unread field for this render path — TypeScript does not flag unused object properties (only unused local variables/imports), so no compiler error results.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Render-only removal (as specified) | Matches explicit user decision; minimal, single-line diff; data model stays available for any other future consumer | `label` becomes dead data in the 5 object literals | Chosen — explicitly requested scope |
| Also remove `label` from the `Sig` interface and all 5 assignments | Fully eliminates dead code | Explicitly rejected by user decision — out of scope for this change | Rejected — deferred to a possible future cleanup |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/components/dashboard/PerformanceAnalytics.tsx` | MODIFY | Remove the `<span className="text-[11px] text-mute2">{s.label}</span>` line from the card-header render block. No other line changes. |

## Protected Zone Impact

None — `PerformanceAnalytics.tsx` is not in the Protected Zone. No Amaury confirmation beyond normal spec review is required.

## Database Changes

None.

## Open Questions

None — this is a fully-specified, single-line, low-ambiguity cosmetic change.
