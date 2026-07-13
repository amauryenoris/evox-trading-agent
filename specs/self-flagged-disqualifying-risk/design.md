# Design — Self-Flagged Disqualifying Risk Observability Field

## Architecture Decision

This is a prompt-schema + persistence-mapping change confined to two files: `src/lib/types.ts` (one new optional field on `AgentDecision`) and `src/lib/claude-agent.ts` (system prompt schema text, a conditional field-description block, and the existing `indicators` jsonb conditional-spread block). No new module, no new API route, no new DB object. It rides entirely on infrastructure already proven safe by the 3 existing optional fields (`learning_note`, `near_miss_score`, `what_would_trigger`).

## STEP 0 — Verified live (no drift since diagnostic)

**`claude-agent.ts:87-94`** (system prompt response schema — sent on **every** Claude call, unconditionally):
```
RESPONSE SCHEMA (strict JSON):
{
  "reasoning": "2-4 sentences: what the indicators show and what the market context is",
  "confidence": 0.0,
  "learning_note": "what this case teaches about the setup",
  "near_miss_score": 0,
  "what_would_trigger": "what specific condition would strengthen the signal"
}`
```

**`claude-agent.ts:620-624`** (the "longer field-description block"):
```
Include these fields in your JSON response:
- "learning_note": string — what this case teaches about the setup
- "near_miss_score": number (1-10) — setup quality score
- "what_would_trigger": string — what specific condition needs to change for a BUY
=====================================` : ''}`
```

**`claude-agent.ts:1888-1896`** (conditional-spread persistence block):
```ts
// Merge learning fields + news threshold into indicators jsonb so dashboard can read them
const indicatorsWithLearning = {
  ...indicators,
  effectiveThreshold,
  newsAdjustment,
  ...(decision.learning_note !== undefined && { learning_note: decision.learning_note }),
  ...(decision.near_miss_score !== undefined && { near_miss_score: decision.near_miss_score }),
  ...(decision.what_would_trigger !== undefined && { what_would_trigger: decision.what_would_trigger }),
}
```

**⚠️ Important nuance found during STEP 0, not present in the original diagnostic**: the "longer field-description block" at lines 620-623 is **not** unconditional — reading the surrounding template literal (`claude-agent.ts:612-624`), it is wrapped in `${learnContext ? \`...\` : ''}`, meaning it is only appended to the user prompt in **LEARN MODE** (pre-filter-flagged near-miss evaluations, `learnContext` truthy). The system prompt's schema block (lines 87-94) *is* unconditional and sent on every call — but it only lists field names/defaults, not the detailed TRUE/FALSE scoping criteria the CHANGE section specifies for the 620-623 block. Cross-checked against the 7 documented self-critique cases from the diagnostic (INTC, COP, MSFT×2, CVX, META): all 7 are normal setup-detected BUY evaluations (regular `MEAN_REVERSION`/trend signals), **not** LEARN-mode near-miss cases. See Open Questions — this affects whether the detailed scoping instructions actually reach the prompts most likely to produce the cases this field is meant to capture.

## Data Flow

```
SYSTEM_PROMPT (claude-agent.ts:63-94, unconditional, every call)
  → includes "self_flagged_disqualifying_risk": false in the RESPONSE SCHEMA block   [NEW]

buildEnrichedPrompt() user prompt (claude-agent.ts:~570-625)
  → if learnContext (LEARN MODE only): appends detailed TRUE/FALSE scoping instructions [NEW, conditional]

Claude response → JSON.parse(...) as AgentDecision (claude-agent.ts:1646)
  → decision.self_flagged_disqualifying_risk: boolean | undefined | unknown-type

decision.action = 'HOLD'  (claude-agent.ts:1652, UNCHANGED — runs before any use of the new field)

... gates, sizing (decision.confidence only), order execution ...  (UNCHANGED — new field never read here)

indicatorsWithLearning construction (claude-agent.ts:1888-1896)
  → const selfFlaggedRisk = typeof decision.self_flagged_disqualifying_risk === 'boolean'
      ? decision.self_flagged_disqualifying_risk : undefined                              [NEW]
  → ...(selfFlaggedRisk !== undefined && { self_flagged_disqualifying_risk: selfFlaggedRisk })  [NEW]

entry.indicators = indicatorsWithLearning
  → insertAgentLogEntry(entry)  (db.ts:31-47, UNCHANGED — indicators column already jsonb, no whitelist edit needed)
  → agent_log.indicators jsonb now optionally contains self_flagged_disqualifying_risk
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New optional `AgentDecision` field + conditional-spread into `indicators` jsonb (proposed) | Zero schema/column change; reuses a pattern already proven safe for 3 fields; log-only by construction since nothing reads it | Field only reaches full-detail scoping instructions in LEARN-mode prompts (see Open Questions) | **Chosen** |
| New dedicated `agent_log` column (`self_flagged_disqualifying_risk boolean`) | Queryable/indexable without jsonb extraction; explicit schema | Requires a DB migration for a field still in n=7 exploratory/observability stage; inconsistent with how the 3 sibling fields are stored; premature per YAGNI | Rejected |
| Zod (or similar) schema validation for the entire `AgentDecision`, not just the new field | Would catch malformed responses across all fields, not just this one | Far larger blast radius than this spec's scope — touches all 9 existing fields' parsing behavior, explicitly out of scope per constraint C-04/NFR-02; a separate initiative | Rejected for this spec |
| Add the detailed TRUE/FALSE scoping instructions to the unconditional system prompt (lines 87-94) instead of / in addition to the LEARN-mode block | Would reach every call, including the normal-path evaluations that produced all 7 documented cases | Diverges from the request's literal CHANGE instructions (which specify the LEARN-mode block at 620-623 for the detailed criteria); would need Amaury's explicit redirection | **Not applied** — flagged as Open Question instead of silently substituted |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `self_flagged_disqualifying_risk?: boolean` to `AgentDecision` (after `what_would_trigger?: string`, line 155). |
| `src/lib/claude-agent.ts` | MODIFY | (1) Add `"self_flagged_disqualifying_risk": false` to the `SYSTEM_PROMPT` response schema (lines 87-94). (2) Add the detailed TRUE/FALSE scoping instruction bullets to the LEARN-mode field-description block (lines 620-623). (3) Compute `selfFlaggedRisk` via a `typeof` guard and conditionally spread it into `indicatorsWithLearning` (lines 1888-1896). No other line changes. |

No API route, dashboard component, `db.ts`, or test file is listed as touched by the CHANGE section — test authorship (if any) is left to `/implement`'s standard TDD step, scoped to the new `typeof` guard's branches.

## Protected Zone Impact

`src/lib/claude-agent.ts` is touched — 3 small, additive edits (prompt schema line, prompt instruction bullets, one computed local + one spread line). No existing line is removed or logically altered; `decision.action = 'HOLD'` (line 1652) and all gate/sizing logic are untouched and not read by the new field.

⚠️ **Requires the standard explicit Amaury confirmation via `tasks.md`'s Pre-Implementation checkbox before implementation**, per `specs/README.md`'s Protected Zone rule — consistent with every other Protected Zone spec in this project's history, regardless of the request's own "authorized by Amaury" framing in its title.

`src/lib/types.ts` is not Protected-Zone-listed (per `CLAUDE.md`, `src/lib/types.ts` is in the "Touch freely" category) — no additional confirmation needed for that file specifically.

## Database Changes

None. `agent_log.indicators` is already a jsonb column; no migration, no new column, no RLS change.

## Open Questions

- ~~**Placement of the detailed TRUE/FALSE scoping criteria.**~~ **RESOLVED by Amaury**: add the detailed TRUE/FALSE scoping bullets to the unconditional `SYSTEM_PROMPT` (reaches every call, including the normal setup-detected evaluations that produced all 7 documented cases) **in addition to** the existing LEARN-mode block at `claude-agent.ts:620-623` (kept as originally specified, reinforcing the guidance on near-miss calls). This ensures the guidance reaches both the majority-path normal evaluations and the LEARN-mode near-miss path.
