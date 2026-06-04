# Design — TREND_ZLE05 Prompt Description Fix

## Architecture Decision

This fix lives entirely in the prompt construction layer of `src/lib/claude-agent.ts`. `buildEnrichedPrompt()` assembles the text context sent to Claude before each analysis call. The TREND_ZLE05 block in that function still describes the pre-widening constraints (`z <= 0.5`, `ADX >= 20`). The change is a pure string replacement — no data flow, no logic, no schema changes.

## Data Flow

```
Signal detected → trendZLE05Setup = true
       ↓
runAgentCycle() calls buildEnrichedPrompt(signalType = 'TREND_ZLE05', ...)
       ↓
Prompt includes TREND_ZLE05 description block (the stale text — BUG HERE)
       ↓
Claude receives prompt → reasons about z-score range → CURRENTLY WRONG
       ↓
After fix: Claude reasons with correct range (0 < z <= 1.25, ADX >= 18)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Update prompt string in-place (one-line edit) | Minimal scope, zero risk to gate logic | None | **Chosen** |
| Extract signal descriptions to a config object | Easier to keep in sync with gate logic | Scope creep, not requested, YAGNI | Rejected |
| Add a runtime assertion to catch drift | Catches future staleness | Significant overhead for a text string | Rejected |

## Impact on Existing Files

### Primary (required)

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Update TREND_ZLE05 description block in `buildEnrichedPrompt()` (~line 539–541): replace stale z-score and ADX values, add expanded-bucket note |

### Optional (documentation only — no runtime effect)

| File | Change Type | Description |
|------|------------|-------------|
| `CLAUDE.md` | MODIFY | Line 157: update `z-score 0–0.5` → `z-score 0–1.25` |
| `README.md` | MODIFY | Line 238: update `z-score 0–0.5` → `z-score 0–1.25` |
| `SDD.md` | MODIFY | Line 108: update `z-score 0–0.5` → `z-score 0–1.25` |
| `.claude/agents/trading-reviewer.md` | MODIFY | Line 54: update `z-score 0–0.5` → `z-score 0–1.25` |
| `.claude/agents/test-agent.md` | MODIFY | Line 259: update `z-score 0–0.5` → `z-score 0–1.25` |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is a Protected Zone file. However, this change modifies only the **prompt text string** inside `buildEnrichedPrompt()` — it does not touch any gate logic, signal detection, position sizing, or exit rules. Amaury confirmation required before implementation.

## Database Changes

None.

## Open Questions

None — the fix is fully specified. The exact replacement text is provided in the feature request.
