# Design — Close 2 MEDIUM Findings from the VIXY Review

## Architecture Decision

This is a two-string text fix confined entirely to `src/lib/market-daily-briefing.ts`, closing the two MEDIUM findings from the `vixy-briefing-proxy` review. No computation, control flow, function signature, or call site changes — both edits are literal string content changes: one inside `formatVixyChangeContext()`'s `null` branch, one inside the `NARRATIVE_SYSTEM_PROMPT` template literal's descriptive sentence.

## Data Flow

1. `formatVixyChangeContext(null)` — its returned string gains the same directional-only caveat phrase already present in the non-null branch. No change to when this branch is taken, only what it returns.
2. `NARRATIVE_SYSTEM_PROMPT` — its descriptive sentence (the one Claude reads as part of the system prompt, unrelated to the JSON schema below it) gains a mention of the VIX-proxy reading, matching what `synthesizeDailyBriefingNarrative()`'s actual prompt text already includes (added in the prior `vixy-briefing-proxy` change, untouched here).
3. Both changes are purely textual — no new data flows anywhere, no existing data flow is altered.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Fix both strings as specified (this spec) | Directly closes both disclosed findings with minimal, auditable diffs | None identified | **Chosen** |
| Leave both as-is (no fix) | Zero risk | Leaves two disclosed, avoidable text gaps in place indefinitely | Rejected — this spec's whole purpose is closing them |
| Restructure `formatVixyChangeContext()` to share the caveat phrase as a constant, used by both branches | Prevents future drift between the two branches | Broader refactor than requested; the fix itself is two independent one-line string edits, and introducing a new shared constant is unrequested scope growth for a documentation/wording fix | Rejected — out of scope, YAGNI |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/market-daily-briefing.ts` | MODIFY | `formatVixyChangeContext()`'s `null`-branch return string gains the directional-only caveat; `NARRATIVE_SYSTEM_PROMPT`'s descriptive sentence gains a VIX-proxy mention |
| `src/lib/__tests__/market-daily-briefing.test.ts` | MODIFY (conditional) | The existing `formatVixyChangeContext` test asserting the exact `null`-case string (`'VIX proxy (VIXY): no data'`) must be updated to match the new caveat-inclusive text — this is the one test assertion this spec explicitly expects to change, and only this one |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`.

## Database Changes

None.

## Open Questions

None. Both target strings and their exact current/replacement text are already confirmed live (re-verified at spec-writing time, matching the prior review's findings with zero drift).
