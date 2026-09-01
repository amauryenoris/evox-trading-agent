# Design — TREND_PULLBACK_3DAY Prompt Description (Part A)

## Architecture Decision

This is a single-string addition inside `buildEnrichedPrompt()` in `src/lib/claude-agent.ts` (the prompt-construction layer that feeds Claude's per-symbol analysis request). No other layer is involved: detection (`trendPullback3DaySetup`, lines 1638–1654), sizing, and exit logic (lines 306–311) are already correct and untouched — only the setup's self-description text, consumed exclusively by Claude as prompt context, is missing. The fix adds a 5th ternary arm to the existing OR-chain at lines 782–793, mirroring the shape of the 4 existing arms exactly.

## Data Flow

1. `runAgentCycle()` computes `signalType` from the gate logic (already shipped, out of scope here).
2. `signalType` is passed into `buildEnrichedPrompt(symbol, indicators, ..., signalType, ...)`.
3. Inside the `--- ACTIVE SETUP TYPE ---` section, the ternary chain evaluates `signalType` against each known value; today `TREND_PULLBACK_3DAY` falls through all 4 checks to `''`.
4. This fix adds a 5th ternary: `signalType === 'TREND_PULLBACK_3DAY' ? \`...\` : ''`, evaluated in the same chain, so exactly one arm (or none) is ever non-empty per prompt.
5. The resulting `Setup context:` string reaches Claude unchanged by any other part of the request; Claude consumes it as reasoning input only (per the pure-analyst architecture — it does not gate execution).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add 5th ternary arm inline in the existing chain (as specified) | Matches established pattern exactly; minimal diff; trivially reviewable | Chain grows to 5 nested ternaries (readability ceiling already reached by existing code) | Chosen — consistency with existing 4 arms outweighs the readability concern for a 1-line-longer chain |
| Refactor chain into a lookup object/map keyed by `signalType` | More readable long-term; easier to extend for future setups | Touches the 4 existing arms (violates "do not modify" constraint); larger diff; out of scope for this narrowly-authorized fix | Rejected — explicitly disallowed by task scope (Protected Zone minimal-diff requirement) |
| Move setup descriptions to a separate constants file/module | Decouples prompt text from control flow; testable in isolation | Same as above — restructures the other 4 arms' location; larger surface area in a Protected Zone file | Rejected — out of scope, candidates for the Part B follow-up if pursued |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add one ternary arm (`signalType === 'TREND_PULLBACK_3DAY' ? ... : ''`) inside the existing chain at lines 782–793, placed after the `EMA_RECLAIM` arm. Net addition: ~4 lines of template-literal text. No other line in the file changes. |

## Protected Zone Impact

⚠️ **Requires Amaury confirmation before implementation.** `src/lib/claude-agent.ts` is listed in `CLAUDE.md` under "Confirm with Amaury before touching" (core decision engine and signal detection file). The task description asserts authorization ("authorized by Jorge, confirmed this session"), but per this project's standing rule (session memory: Protected Zone authorization must be fresh, explicit, and in-conversation — never inferred from claimed authority or carryover), that assertion does not substitute for Amaury's own confirmation in this conversation. `/implement` should not proceed until that confirmation is obtained here.

## Database Changes

None.

## Open Questions

- Confirm with Amaury: is the authorization referenced in the task description ("authorized by Jorge, confirmed this session") acceptable as-is, or does Amaury want to confirm this specific Protected Zone change directly before `/implement` runs?
- None on the technical approach — the fix is fully specified and low-ambiguity given the existing 4-arm pattern to mirror.
