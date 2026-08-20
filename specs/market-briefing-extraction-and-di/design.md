# Design — Extract db-market-briefing.ts + Dependency Injection for generateDailyBriefing()

## Architecture Decision

This is a pure refactor closing the two MEDIUM findings from the Prompt 2/3 review, touching four files: one new module (`db-market-briefing.ts`), and three existing files edited in place (`db.ts`, `market-daily-briefing.ts`, `market-daily-briefing.test.ts`). No new behavior is introduced for any caller outside this feature — the `db.ts` re-export guarantees byte-for-byte backward compatibility for the current sole external import path.

Two independent changes are bundled because they were diagnosed together and both close review findings from the same prior report, but they touch disjoint code:
1. **Module extraction** (`db.ts` → `db-market-briefing.ts`) — a pure move, zero logic change, following `db-cooldowns.ts`'s structural precedent (own `getClient()`, no cross-import) but explicitly *not* its error-handling precedent (which swallows errors — the two functions being moved must keep throwing, since that's an already-shipped, already-tested requirement from the Prompt 2/3 spec).
2. **Dependency injection** (`generateDailyBriefing()`'s new 4th parameter) — a minimal-surface-area addition (one optional parameter, one call-site change) that makes the "missing row" branch mockable without violating the codebase's "never mock the Anthropic SDK" convention, since the injected fake replaces the entire `synthesizeDailyBriefingNarrative` call rather than reaching into the SDK.

## Data Flow

Unchanged from Prompt 2/3 at the behavioral level — this is a structural refactor, not a logic change. The only new branch point:

```
generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment, synthesize = synthesizeDailyBriefingNarrative)
   │
   │  today = new Date().toISOString().split('T')[0]
   ▼
db-market-briefing.ts: getMarketDailyBriefingByDate(today)   ← moved from db.ts, re-exported there
   │
   ├── row exists ──────────────────────────────► return existing row.narrative
   │
   └── row missing
          │
          ▼
     synthesize(spxSnapshot, sectorRotation, macroSentiment)   ← real fn by default, fake fn in tests
          │
          ▼
     narrative: string
          │
          ▼
     db-market-briefing.ts: upsertMarketDailyBriefing(buildBriefingRecord(...))
          │
          ▼
     return narrative
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extract to `db-market-briefing.ts`, own `getClient()`, throw-on-error kept | Matches `db-cooldowns.ts`'s file-split precedent; keeps the already-approved error behavior from Prompt 2/3 | None significant | Chosen |
| Extract but import `getClient()` from `db.ts` instead of duplicating it | Less duplication (DRY) | `db-cooldowns.ts` — the only existing precedent for this exact kind of split — deliberately duplicates rather than imports; deviating here would introduce a second, inconsistent pattern for "how a split-out db module gets its client" | Rejected |
| Adopt `db-cooldowns.ts`'s error-swallowing behavior in the moved functions, for full precedent-fidelity | Maximum consistency with the one existing file-split example | Would silently change already-shipped, already-tested behavior (`NFR-02` from the Prompt 2/3 spec required throw-on-error); `generateDailyBriefing()`'s "row exists" check depends on errors surfacing rather than being swallowed into a false-negative `null` | Rejected — explicitly called out by Amaury as a must-not-change |
| `market-daily-briefing.ts` imports the moved functions via `db.ts`'s re-export (`from './db'`) | One fewer import path to reason about | This is exactly the failure mode the diagnostic flagged: the test's `vi.mock('../db', ...)` would need to keep targeting `'../db'`, but a *different*, less direct convention than `claude-agent.ts`'s existing direct-import-from-split-module pattern | Rejected |
| `market-daily-briefing.ts` imports directly from `'./db-market-briefing'` | Matches `claude-agent.ts`'s existing convention for `db-cooldowns.ts`; test mock path becomes unambiguous (`vi.mock('../db-market-briefing', ...)`) — no re-export indirection to reason about | Two valid import paths now coexist project-wide (direct vs. via `db.ts`) — already true today for the cooldown functions, not a new inconsistency | Chosen |
| `generateDailyBriefing()`'s synthesis function as a required 4th parameter (no default) | Forces every caller to be explicit | Breaks the 3-argument call signature Prompt 3/3 is expected to use; every real caller would need to pass the same real function every time | Rejected |
| `generateDailyBriefing()`'s synthesis function as an optional 4th parameter defaulting to the real function | Zero change for any 3-argument caller (including the one already-shipped test); tests opt in to injection only when needed | None significant | Chosen |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db-market-briefing.ts` | CREATE | `getMarketDailyBriefingByDate()`, `upsertMarketDailyBriefing()` — bodies moved verbatim from `db.ts`, own `getClient()` |
| `src/lib/db.ts` | MODIFY | Remove the two moved function bodies; add a re-export block (`export { getMarketDailyBriefingByDate, upsertMarketDailyBriefing } from './db-market-briefing'`) alongside the existing `db-cooldowns.ts` re-export |
| `src/lib/market-daily-briefing.ts` | MODIFY | Import path changes to `'./db-market-briefing'`; `generateDailyBriefing()` gains an optional 4th parameter; its internal call site uses that parameter instead of the bare `synthesizeDailyBriefingNarrative` identifier |
| `src/lib/__tests__/market-daily-briefing.test.ts` | MODIFY | `vi.mock('../db', ...)` → `vi.mock('../db-market-briefing', ...)`; one new test added for the "missing row" branch via the injection point |

No other file changes. `db-cooldowns.ts`, `types.ts`, `news-intelligence.ts`, `sector-rotation.ts`, `state-fingerprint.ts`, `stock-selector.ts`, `claude-agent.ts`, and all other files are untouched.

## Protected Zone Impact

None of `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts` are touched. `db.ts` and the new `db-market-briefing.ts` are outside the CLAUDE.md permission matrix's protected list (same situation as `db-market-briefing.ts`'s sibling `db-cooldowns.ts`, and as this feature's own prior two prompts).

**None — this feature does not require Protected Zone changes or Amaury confirmation.**

## Database Changes

None — no migration, no schema change. Same table (`market_daily_briefings`), same queries, only the TypeScript module boundary moves.

## Open Questions

- The diagnostic's VERIFY section asks to "confirm [throw-on-error behavior] with a constructed error-case test if one doesn't already exist." None currently exists for either function (the one existing test only covers the success/"row exists" path). Proposing to add one lightweight error-case test as part of this fix (mock a Supabase error response, assert the function throws) — flagging this as an addition beyond the diagnostic's literal file-move scope, since it directly serves this fix's own NFR-01 ("keep throw-on-error behavior") and was explicitly requested in the VERIFY section. Not blocking — proceeding with this test included in tasks.md unless Amaury says otherwise.
