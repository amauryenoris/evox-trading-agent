Review the implementation of: $ARGUMENTS

Verify that what was built matches the spec, respects architectural constraints, and follows project patterns. Generate a review report.

---

## Step 1 — Load spec and implementation

Read in this order:
1. `specs/$ARGUMENTS/requirements.md` — the EARS requirements to verify
2. `specs/$ARGUMENTS/design.md` — architecture decisions and file impact list
3. `specs/$ARGUMENTS/tasks.md` — task checklist (should be fully checked)
4. All files listed in `design.md` → **Impact on Existing Files** section

---

## Step 2 — Requirements verification

For each requirement in `requirements.md`, verify the implementation satisfies it.

Mark each as:
- ✅ SATISFIED — the code clearly meets this requirement
- ⚠️ PARTIAL — the code partially meets it, with noted gap
- ❌ VIOLATED — the code does not meet this requirement
- ➖ NOT TESTABLE — cannot verify from static code review alone

---

## Step 3 — Protected Zone audit

Read `CLAUDE.md` for the Protected Zone file list. For each Protected Zone file:

```
- src/lib/config.ts         → [UNTOUCHED / MODIFIED]
- src/lib/claude-agent.ts   → [UNTOUCHED / MODIFIED]
- src/lib/risk-manager.ts   → [UNTOUCHED / MODIFIED]
- src/lib/indicators.ts     → [UNTOUCHED / MODIFIED]
- src/lib/news-intelligence.ts → [UNTOUCHED / MODIFIED]
- src/lib/watchlist-monitor.ts → [UNTOUCHED / MODIFIED]
- src/lib/learning.ts       → [UNTOUCHED / MODIFIED]
```

If any file is MODIFIED:
- Was this modification listed in `design.md`? → expected
- Was it NOT listed in the spec? → flag as CRITICAL (unauthorized change)

---

## Step 4 — Skills pattern compliance

Check implementation against each relevant skill:

**Analyst purity** (if `claude-agent.ts` was touched):
- [ ] Claude's action field is still forced to `'HOLD'` after parsing
- [ ] Claude's output schema unchanged (reasoning, confidence, learning_note, near_miss_score, what_would_trigger)
- [ ] No new language allowing Claude to approve or reject trades

**Supabase patterns** (if `db.ts` or new queries added):
- [ ] No `any` casts on query results
- [ ] All queries have `.limit()` or explicit bounds
- [ ] `db.ts` not imported from `'use client'` files
- [ ] Errors checked: `if (error) throw error`
- [ ] New tables have RLS enabled

**TypeScript quality**:
- [ ] No `any` types in new code
- [ ] No mutation of existing objects (immutable patterns)
- [ ] Functions < 50 lines
- [ ] Files < 800 lines
- [ ] No magic numbers — named constants used

**Security**:
- [ ] No hardcoded secrets or API keys
- [ ] No SQL injection vectors (parameterized queries via Supabase client)
- [ ] No `console.log` with sensitive data

---

## Step 5 — Task checklist audit

Read `specs/$ARGUMENTS/tasks.md`. Count:
- Total tasks: N
- Completed (`[x]`): N
- Incomplete (`[ ]`): N

If any task is incomplete → flag as HIGH issue.

---

## Step 6 — Write report to specs/$ARGUMENTS/review.md

```markdown
# Review Report — [Feature Name]

**Date**: [ISO date]
**Reviewer**: Claude (automated)
**Status**: APPROVED / APPROVED WITH WARNINGS / BLOCKED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | ... | ✅ / ⚠️ / ❌ / ➖ | ... |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| ... | ... | ... |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ / ❌ | ... |
| Supabase patterns | ✅ / ❌ | ... |
| TypeScript quality | ✅ / ❌ | ... |
| Security | ✅ / ❌ | ... |

## Task Checklist

- Completed: N/N tasks

## Findings

### CRITICAL (blocks merge)
- [Finding or "None"]

### HIGH (should fix)
- [Finding or "None"]

### MEDIUM (consider fixing)
- [Finding or "None"]

### LOW (optional)
- [Finding or "None"]

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.

or

**APPROVED WITH WARNINGS** — HIGH findings present. Merge with caution.

or

**BLOCKED** — CRITICAL findings. Must fix before merge:
- [List the critical issues]
```

---

## Step 7 — Output summary

After writing the report, output:

```
Review completo — specs/$ARGUMENTS/review.md generado.

Estado: [APPROVED / APPROVED WITH WARNINGS / BLOCKED]

Críticos: [N] | Altos: [N] | Medios: [N] | Bajos: [N]

[If BLOCKED]: Issues que bloquean el merge:
- [list]

[If APPROVED]: Listo para commit.
```
