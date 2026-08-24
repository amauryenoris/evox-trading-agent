# Requirements — Fix Stale current_price in Position Health Monitor (getBars limit)

## Functional Requirements

FR-01: The system shall pass an explicit `limit` argument to `getBars('SPY', '1Day', 400, ...)` in `position-health-check.ts`, matching `daysBack`.
FR-02: The system shall pass an explicit `limit` argument to `getBars(ctx.symbol, '1Day', 400, ...)` in `position-health-check.ts`, matching `daysBack`.
FR-03: The system shall leave `daysBack` at `400` on both calls — only `limit` is added.

## Non-Functional Requirements

NFR-01: The fix shall not alter any other line, branch, or log statement in `position-health-check.ts`.
NFR-02: The fix shall not alter `getBars()` or any of its defaults in `alpaca.ts`.
NFR-03: The fix shall not alter `claude-agent.ts` or any of its own `getBars()` calls, even though a structurally similar (unmatched-limit) pattern exists there for SPY/GDX/XLE/XLK — that pattern was independently checked against real data this session and is out of scope for this fix.
NFR-04: `npx tsc --noEmit` shall pass with zero new errors, confirming `scripts/position-health-check.ts` is included in the project's TypeScript check scope (per `tsconfig.json`'s `**/*.ts` include pattern).

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — no changes are planned there, and none are needed. `scripts/**` is explicitly "Touch freely" per `CLAUDE.md`'s file permission matrix.
C-02: This feature must not modify `position_health_snapshots`'s schema or any migration.
C-03: This feature must not modify `calculateAllIndicators()`, `state-fingerprint.ts`'s bucket helpers, or any other shared production logic this script imports.
C-04: This feature must be confined to exactly two call sites in exactly one file.

## Out of Scope

- Any change to `claude-agent.ts`'s own `getBars('SPY'/'GDX'/'XLE'/'XLK', '1Day', 400)` calls — a structurally similar pattern, but already independently verified against real `trade_evaluations` data this session as NOT exhibiting the same staleness, and explicitly excluded from this fix's scope per the diagnostic.
- Backfilling or correcting the ~180+ already-written `position_health_snapshots` rows with stale `current_price` values — this fix only prevents new stale writes going forward.
- Adding automated test coverage for this script (none exists today; not requested by this spec).
- Any change to the `.github/workflows/position-health.yml` schedule or trigger.
