Act as a spec-author for the feature: $ARGUMENTS

Your job is to write a complete specification — not to implement anything. Stop completely after writing the spec and wait for approval.

---

## Step 1 — Understand the feature

Before writing anything:
1. Search the codebase for existing code related to `$ARGUMENTS` (Grep for keywords, read relevant files in `src/lib/`, `src/app/`, `src/components/dashboard/`)
2. Read `CLAUDE.md` and `SDD.md` to understand architectural constraints
3. Read the skills in `.claude/skills/` relevant to this feature
4. Identify which files in the **Protected Zone** (config.ts, claude-agent.ts, risk-manager.ts, indicators.ts) this feature would touch, if any

---

## Step 2 — Create specs/$ARGUMENTS/requirements.md

Write requirements in **EARS format** (Easy Approach to Requirements Syntax):

```
# Requirements — [Feature Name]

## Functional Requirements

FR-01: The system shall [do X] when [condition Y].
FR-02: The system shall [do X] if [condition Y].
FR-03: Where [feature/component], the system shall [do X].
FR-04: The system shall [do X] until [condition Y].
FR-05: The system shall [do X] while [condition Y].

## Non-Functional Requirements

NFR-01: [Performance, security, maintainability constraint]

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.
C-02: [Other hard constraints — architectural, regulatory, operational]

## Out of Scope

- [Explicitly what this spec does NOT cover]
```

Rules for EARS statements:
- Start with "The system shall" — not "should", not "must", not "will"
- One requirement per statement — no "and" chaining
- Testable: a reviewer must be able to say definitively whether the system satisfies it
- No implementation detail — describe WHAT, not HOW

---

## Step 3 — Create specs/$ARGUMENTS/design.md

```
# Design — [Feature Name]

## Architecture Decision

[One paragraph: where does this feature live in the system? Which layer? Which files?]

## Data Flow

[Diagram or numbered sequence showing how data moves through the system for this feature]

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| [Option A] | ... | ... | Chosen / Rejected |
| [Option B] | ... | ... | Chosen / Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/example.ts | MODIFY | Add X function |
| src/app/api/example/ | CREATE | New API route |

## Protected Zone Impact

[List any Protected Zone files that would be touched. If none: "None — this feature does not require Protected Zone changes."]
[If any: "⚠️ Requires Amaury confirmation before implementation."]

## Database Changes

[New tables, new columns, new indexes, new RLS policies — or "None"]

## Open Questions

- [Unresolved design question that needs Amaury input before implementation]
```

---

## Step 4 — Create specs/$ARGUMENTS/tasks.md

```
# Tasks — [Feature Name]

## Pre-Implementation

- [ ] Amaury has reviewed and approved this spec
- [ ] Protected Zone changes confirmed (if applicable)
- [ ] Database migrations drafted (if applicable)

## Implementation Checklist

### Phase 1 — [e.g., Backend / Data Layer]
- [ ] T-01: [Specific task — file + function to create/modify]
- [ ] T-02: [Specific task]

### Phase 2 — [e.g., API Layer]
- [ ] T-03: [Specific task]

### Phase 3 — [e.g., UI / Dashboard]
- [ ] T-04: [Specific task]

### Phase 4 — Testing
- [ ] T-05: Write unit tests for [X]
- [ ] T-06: Verify 80% coverage on new code

## Post-Implementation

- [ ] Run /review $ARGUMENTS to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

[Low / Medium / High] — [1-2 sentence justification]
```

---

## Step 5 — Stop and report

After creating all three files, output exactly this and nothing else:

```
SPEC LISTA — esperando aprobación antes de implementar.

Archivos creados:
- specs/$ARGUMENTS/requirements.md
- specs/$ARGUMENTS/design.md
- specs/$ARGUMENTS/tasks.md

Resumen:
- [N] functional requirements
- [N] tasks in [N] phases
- Protected Zone: [None / ⚠️ FILE — confirm before implementing]
- Open questions: [None / list them]

Cuando estés listo: /implement $ARGUMENTS
```

**Do not write any code. Do not modify any source files. Stop completely.**
