# Requirements — Active Cooldowns Card

## Functional Requirements

FR-01: The system shall provide a `GET /api/cooldowns` route that returns the current result of `getActiveCooldowns()`.
FR-02: The system shall respond to `GET /api/cooldowns` with a JSON object of the shape `{ cooldowns: Array<{ symbol: string, exit_reason: string, cooldown_until: string }> }`.
FR-03: The system shall display an "Active Cooldowns" card in the Intelligence tab of the dashboard.
FR-04: The system shall render the card immediately after the `RejectedSetups` component, outside the existing two-column grid.
FR-05: The system shall show, for each active cooldown, the symbol, the exit reason, and the cooldown expiry time formatted as a readable date/time.
FR-06: The system shall fetch cooldown data from `/api/cooldowns` immediately on mount.
FR-07: The system shall re-fetch cooldown data every 60 seconds while the card is mounted.
FR-08: The system shall stop polling when the card is unmounted.
FR-09: Where the fetch to `/api/cooldowns` fails or returns a non-OK response, the system shall leave the previously displayed cooldown list unchanged and shall not render an error state.
FR-10: Where no cooldowns are active, the system shall display a calm, muted "No active cooldowns" message inside the card.
FR-11: The system shall display the card's label including a live count of tracked cooldowns (e.g. "Active Cooldowns · N tracked").
FR-12: The system shall not provide any control to cancel, edit, or otherwise mutate a cooldown from this card.

## Non-Functional Requirements

NFR-01: The new component shall visually match the existing dashboard row-card idiom (`bg-surface2 border border-border rounded-lg p-3.5`) used by `NearMissWatchlist`.
NFR-02: The new API route shall introduce no new dependency and shall perform no data transformation beyond passing through `getActiveCooldowns()`'s result.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) — none of these files are touched by this feature.
C-02: The system shall not modify `getActiveCooldowns()`, `cleanExpiredCooldowns()`, or any other existing function in `db-cooldowns.ts` / `db.ts`.
C-03: The system shall not modify `NearMissWatchlist.tsx`, `NewsIntelligence.tsx`, or `RejectedSetups.tsx`.
C-04: The system shall not modify the Intelligence tab's existing two-column grid or its two existing children beyond appending one new element after `RejectedSetups`.
C-05: The system shall not add a new shared UI primitive to `ui.tsx`.
C-06: The system shall not add a named `SymbolCooldown` type to `types.ts`; the shape returned by `getActiveCooldowns()` shall be used inline/inferred.

## Out of Scope

- Any write, cancel, or edit capability for cooldowns.
- Changing `getActiveCooldowns()`'s error-swallowing behavior (console.error + return `[]`).
- Adding an explicit error-state UI branch (this card follows `NearMissWatchlist`'s silent-fail philosophy, not `BuyScannerPanel`/`HealthMonitorPanel`'s explicit-error pattern).
- Database schema changes to `symbol_cooldowns`.
- Any change to authentication/authorization beyond what `/api/near-miss` already does (none — no auth check exists in that route).
