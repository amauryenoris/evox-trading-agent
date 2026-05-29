Implement the feature: $ARGUMENTS

Follow the spec in specs/$ARGUMENTS/ strictly. Do not implement anything not covered by the spec.

---

## Step 1 — Verify spec and approval

1. Read `specs/$ARGUMENTS/requirements.md`, `specs/$ARGUMENTS/design.md`, `specs/$ARGUMENTS/tasks.md`
2. Verify `tasks.md` contains the line: `- [x] Amaury has reviewed and approved this spec`
   - If this checkbox is NOT checked: stop immediately and output:
     ```
     ⛔ Spec not approved yet. Check the box in specs/$ARGUMENTS/tasks.md after Amaury reviews, then run /implement $ARGUMENTS again.
     ```
3. Check for open questions in `design.md` — if any are listed and unanswered, stop and ask Amaury

---

## Step 2 — Load context

Read the skills relevant to this feature:

- If the feature touches `src/lib/` trading logic → read `.claude/skills/claude-api-patterns.md`
- If the feature touches Supabase / `db.ts` → read `.claude/skills/supabase-patterns.md`
- If the feature touches Alpaca → read `.claude/skills/alpaca-patterns.md`
- If the feature touches dashboard components → read `.claude/skills/typescript-patterns.md`
- Always read `.claude/skills/search-first.md` before creating any new file

Read the design section of the spec to understand which files to touch.

---

## Step 3 — Protected Zone check

Before writing any code, re-read the **Protected Zone** from `CLAUDE.md`:

```
PROTECTED (confirm with Amaury before touching):
- src/lib/config.ts
- src/lib/claude-agent.ts
- src/lib/risk-manager.ts
- src/lib/indicators.ts
- src/lib/news-intelligence.ts
- src/lib/watchlist-monitor.ts
- src/lib/learning.ts
- .env / .env.local
- vercel.json
- Any DB migration
```

If the spec requires touching any of these AND the spec says "⚠️ Requires Amaury confirmation":
- Stop and ask for confirmation before proceeding
- Do not assume approval from the spec review alone

---

## Step 4 — Implement following the task checklist

Work through `specs/$ARGUMENTS/tasks.md` **in order**. After completing each task:

1. Mark it complete: change `- [ ] T-XX:` to `- [x] T-XX:`
2. Update `specs/$ARGUMENTS/tasks.md` immediately (do not batch updates)
3. Move to the next task

Implementation rules (from `.claude/skills/`):

**TypeScript patterns** (from `typescript-patterns.md`):
- No `any` casts — use types from `src/lib/types.ts`
- Immutability: return new objects, never mutate in-place
- Booleans: `is_`, `has_`, `should_`, `can_` prefixes
- Functions < 50 lines; files < 800 lines

**Supabase patterns** (from `supabase-patterns.md`):
- All DB operations go through `src/lib/db.ts` using the service role client
- Never import `db.ts` from browser-side (`'use client'`) code
- Always check `if (error) throw error` on Supabase responses
- Add `.limit()` to all queries that could return unbounded results

**Claude API patterns** (from `claude-api-patterns.md`):
- Use `callClaudeWithRetry` for all Claude calls (handles 429/529)
- Model: `claude-sonnet-4-6`
- Claude output schema must remain strict JSON — no markdown in responses
- Never let Claude make trading decisions (action field is always overridden by system)

**Alpaca patterns** (from `alpaca-patterns.md`):
- Always check quote freshness before submitting orders
- IOC orders only — no market orders
- Respect `INSTRUMENT_BLACKLIST` before any order

**General rules**:
- No comments unless the WHY is non-obvious
- No hardcoded values — use env vars or named constants from `config.ts`
- Validate all inputs at system boundaries
- Handle errors explicitly — no silent swallows

---

## Step 5 — Tests

For every new function or module:
- Write tests following TDD (write test first, then implementation)
- Use AAA pattern: Arrange → Act → Assert
- Target 80% coverage on new code
- Do not mock the database unless absolutely necessary

---

## Step 6 — Completion report

After all tasks are marked complete, output:

```
✅ Implementación completa — $ARGUMENTS

Tareas completadas: [N]/[N]
Archivos modificados:
- [file path] — [what changed]

Protected Zone: [Untouched / Modified with approval: FILE]

Ejecuta /review $ARGUMENTS para verificar que la implementación cumple la spec.
```
