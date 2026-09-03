# Requirements — Remove Redundant Signal-Type Label from PerformanceAnalytics.tsx

## Background (confirmed against current code, 2026-09-03)

- `src/components/dashboard/PerformanceAnalytics.tsx:258-261` renders each `sigs` entry's card header with both a `SignalBadge` and a separate text `<span>{s.label}</span>` — largely redundant text next to the badge (e.g. badge "Trend PB" + label "Trend PB", badge "Trend PB 3D" + label "Trend PB 3-Day").
- Confirmed via full-file grep (prior diagnostic this session): `s.label` (the `Sig` interface field) has exactly one consumer in the entire file — this one render location. No `aria-label`, `title`, `alt`, tooltip, or any other attribute anywhere reads it. `SignalBadge` (`ui.tsx`) takes only a `signal` prop, not `label`.
- User decision: render-only removal. The `label` field stays in the `Sig` interface (line 160) and all 5 object-literal assignments (lines 165, 174, 183, 192, 201) — becoming unused-but-harmless dead data, not touched by this change.
- `PerformanceAnalytics.tsx` is not a Protected Zone file — no special Amaury authorization is required beyond normal spec approval.

## Functional Requirements

FR-01: The system shall render only the `SignalBadge` for each signal-type card, without an adjacent text label.
FR-02: The system shall continue to render the trades-count span, the `KVMini` stat grid, and the `Progress` bar for each card exactly as before this change.
FR-03: The system shall continue to compute and store a `label` value for all 5 `sigs` entries, even though it is no longer rendered.

## Non-Functional Requirements

NFR-01: The change shall not alter the `Sig` interface or any `label: '...'` value in the `sigs` array construction — data model stays byte-for-byte unchanged, only the render output changes.

## Constraints

C-01: `PerformanceAnalytics.tsx` is not in the Protected Zone — no special Amaury confirmation beyond normal spec approval is required.
C-02: Do not modify the `Sig` interface (line 160) or any of the 5 `label: '...'` assignments in the `sigs` array (lines 165, 174, 183, 192, 201).
C-03: Do not modify `SignalBadge` (`ui.tsx`).
C-04: Do not modify the trades-count span, the `KVMini` grid, or the `Progress` bar below this block.
C-05: Do not modify any other file.

## Out of Scope

- Removing the `label` field from the `Sig` interface or the data model entirely (a separate, larger cleanup — explicitly deferred by user decision).
- Any change to `SignalBadge`'s own rendering, tones, or labels (`ui.tsx`).
- Any change to how `sigs` is built or filtered.
