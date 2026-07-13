# Requirements — Sync Documentation with Actual AgentDecision Response Schema

## Functional Requirements

FR-01: The system's `CLAUDE.md` documentation shall list `self_flagged_disqualifying_risk` in the documented Claude output schema.
FR-02: The system's `.claude/skills/claude-api-patterns.md` documentation shall list `self_flagged_disqualifying_risk` in the documented `AgentDecision` response schema.
FR-03: Where either doc describes `self_flagged_disqualifying_risk`, the system shall describe it as an optional boolean that is observability/logging-only and does not block or approve trades.
FR-04: The system shall not restate the full TRUE/FALSE scoping criteria (the 5-bullet instruction list) from the `SYSTEM_PROMPT` in either documentation file — only the field's existence, type, and purpose.

## Non-Functional Requirements

NFR-01: The documentation update shall match each file's existing formatting style (JSON code block in `CLAUDE.md`, TypeScript interface code block in `claude-api-patterns.md`).
NFR-02: The change shall be verifiable by direct diff — no line outside the intended additive edit shall change in either file.

## Constraints

C-01: This feature must not modify any `.ts` source file — documentation only.
C-02: This feature must not modify any other section of `CLAUDE.md` or `claude-api-patterns.md` beyond the response-schema listing.
C-03: This feature is not a Protected Zone change — `CLAUDE.md` and `.claude/skills/*.md` are not listed in `CLAUDE.md`'s File Permission Matrix Protected list, so no additional confirmation gate beyond standard spec approval applies.

## Out of Scope

- Any change to `src/lib/claude-agent.ts`, `src/lib/types.ts`, or any other source file — the field itself is already merged and out of scope here.
- Restating or altering the TRUE/FALSE scoping instructions themselves — those remain solely in the `SYSTEM_PROMPT`.
- Documenting any other pending or future `AgentDecision` field.
- Updating `SDD.md` or any other project doc not named in the CHANGE section.
