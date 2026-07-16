# Tasks — Don't Overwrite an Existing Active Cooldown From the Ghost-Close STOP_LOSS Path

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — `claude-agent.ts`, explicitly authorized
      in the originating request as the same fix family as the just-merged
      `fix-cooldown-stop-loss-ghost-close`
- [X] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Hoist the active-cooldowns lookup
- [x] T-01: Before the `for (const ctx of closedContexts)` loop (currently `claude-agent.ts:1066`,
      near where `cooldownDates` is already hoisted), add
      `const existingCooldowns = await getActiveCooldowns()`.
- [x] T-02: Build an in-memory `Map<string, string>` (symbol → exit_reason) from
      `existingCooldowns`, following the existing `cooldownReasons` Map pattern used later in this
      function.

### Phase 2 — Gate the ghost-close write
- [x] T-03: At the existing ghost-close `STOP_LOSS` write condition (currently
      `claude-agent.ts:1125`), add `!existingCooldowns.has(ctx.symbol)` to the condition:
      `if (pnlPct < 0 && cooldownDates !== null && !existingCooldowns.has(ctx.symbol))`.
- [x] T-04: When the write is skipped because the symbol already has an active cooldown, log
      `[COOLDOWN_SKIP] symbol=${ctx.symbol} reason=already_has_active_cooldown source=ghost_close`.

### Phase 3 — Testing
- [x] T-05: Test — a ghost-close with `pnlPct < 0` and no existing cooldown for that symbol still
      writes `STOP_LOSS` (no regression vs. the just-merged behavior).
      `src/lib/__tests__/cooldown-stop-loss-ghost-close.test.ts` (new case, additive).
- [x] T-06: Test — a ghost-close with `pnlPct < 0` and an existing active cooldown for that symbol
      (any reason, e.g. `Z_SCORE_EXIT`) skips the write and produces the `[COOLDOWN_SKIP]` log
      shape. Same file.
- [x] T-07: Test — call-count assertion confirming the new active-cooldowns lookup is invoked
      exactly once per cycle regardless of `closedContexts` size (not once per closed position).
      Same file.
- [x] T-08: Run the 3 fully-protected cooldown test files unmodified — confirm all still pass
      (28/28 passed).
- [x] T-09: `npx tsc --noEmit` — passed clean.
- [x] T-10: `npm run build` — passed clean.
- [x] T-11: Full test suite — 263/263 passed (24 test files, 258 → 263 tests, +5 new, zero
      regressions).

## Post-Implementation

- [x] Run `/review fix-cooldown-ghost-close-overwrite` to verify implementation matches spec —
      APPROVED, see `review.md`
- [x] Confirm Protected Zone files unchanged outside `claude-agent.ts` (or changes approved) —
      only `claude-agent.ts` (Protected Zone, authorized) and the test file were modified.

## Estimated Complexity

Low — a single hoisted query, one added boolean condition on an existing `if` block, and one new
log line, all within a region of `claude-agent.ts` already touched by the immediately-preceding
fix. No control-flow restructuring, no new files, no schema changes; risk is limited to correctly
scoping the new call outside the loop (NFR-01) and keeping it separate from the existing
`persistentCooldowns` call site (C-04).
