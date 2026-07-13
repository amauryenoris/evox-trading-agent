# Design — Sync Documentation with Actual AgentDecision Response Schema

## Architecture Decision

Documentation-only change. No architecture, layer, or runtime behavior is involved — this brings two static reference docs (`CLAUDE.md`, `.claude/skills/claude-api-patterns.md`) up to date with a field that already shipped in `src/lib/types.ts` and `src/lib/claude-agent.ts`'s `SYSTEM_PROMPT` in a previous, separately-reviewed spec.

## STEP 0 — Verified live (source of truth)

**`CLAUDE.md:44-53`** (current):
```
Claude's output schema (strict JSON — no markdown):
```json
{
  "reasoning": "2-4 sentences on what the indicators show",
  "confidence": 0.0,
  "learning_note": "what this case teaches about the setup",
  "near_miss_score": 0,
  "what_would_trigger": "what specific condition would strengthen the signal"
}
```
```

**`.claude/skills/claude-api-patterns.md:26-39`** (current):
```
## Expected response schema

```typescript
interface AgentDecision {
  reasoning: string           // 2-4 sentences: what indicators show
  confidence: number          // 0.0 – 1.0
  learning_note: string       // what this case teaches
  near_miss_score: number     // 1-10 setup quality
  what_would_trigger: string  // what condition would strengthen the signal
  action?: string             // overridden to 'HOLD' by system after parsing
  quantity?: number
  symbol?: string
}
```
```

**`src/lib/claude-agent.ts:87-95`** (current, source of truth for what the docs should say):
```
RESPONSE SCHEMA (strict JSON):
{
  "reasoning": "2-4 sentences: what the indicators show and what the market context is",
  "confidence": 0.0,
  "learning_note": "what this case teaches about the setup",
  "near_miss_score": 0,
  "what_would_trigger": "what specific condition would strengthen the signal",
  "self_flagged_disqualifying_risk": false
}
```
(followed by the 5-bullet `SELF_FLAGGED_DISQUALIFYING_RISK` scoping section, lines 97-102 — not to be restated in either doc per FR-04/C-02.)

## Data Flow

N/A — no runtime data flow. This is a static-text edit to two markdown files read by humans (and by Claude Code itself as project context), not executed at runtime.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add the field name + one-line purpose description only (proposed) | Matches `NFR-01`'s existing formatting style in both files; keeps docs scannable; avoids drift risk of duplicating prompt wording that might change independently | None significant | **Chosen** |
| Copy the full 5-bullet TRUE/FALSE scoping criteria into both docs | Maximally complete | Explicitly rejected by the request (`DO NOT CHANGE` / CHANGE item 1) — creates a second source of truth that could drift from the actual prompt wording; the prompt itself is the authoritative behavioral spec, docs should describe the contract shape, not restate implementation instructions | Rejected |
| Leave docs as-is, accept the drift | Zero effort | Directly the MEDIUM finding this spec exists to close; docs would keep misrepresenting Claude's actual response contract | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `CLAUDE.md` | MODIFY | Add `"self_flagged_disqualifying_risk": false` (or similar single-line JSON entry) to the output schema JSON block (lines 44-53), matching existing key ordering (appended after `what_would_trigger`). |
| `.claude/skills/claude-api-patterns.md` | MODIFY | Add `self_flagged_disqualifying_risk?: boolean` (with a short inline comment, matching the file's existing `// comment` style) to the `AgentDecision` interface block (lines 26-39), appended after `what_would_trigger`. |

No other file is touched.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. Neither `CLAUDE.md` nor `.claude/skills/claude-api-patterns.md` appears in `CLAUDE.md`'s File Permission Matrix Protected list (that list is `src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`, `.env`/`.env.local`, `vercel.json`, any DB migration) — both are themselves documentation, not among the files they describe as protected.

## Database Changes

None.

## Open Questions

- None. Both source-of-truth locations were verified live in this session (STEP 0 above), and the exact field name/type/purpose are unambiguous from the already-merged `claude-agent.ts` and `types.ts`.
