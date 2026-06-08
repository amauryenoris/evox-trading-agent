# Tasks — Fase 2b-C: Merge Persistent Cooldowns + Cleanup

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed (claude-agent.ts)

## Implementation Checklist

### Phase 1 — Import extension
- [x] T-01: Extend import at line 40 of `claude-agent.ts` to add `getActiveCooldowns` and
            `cleanExpiredCooldowns` alongside the existing `upsertSymbolCooldown`:
            `import { upsertSymbolCooldown, getActiveCooldowns, cleanExpiredCooldowns } from './db-cooldowns'`

### Phase 2 — Merge block (CHANGE 1 + CHANGE 2)
- [x] T-02: After the for loop ends at line 1070 (before the `[EXIT_COOLDOWN_READY]` log at
            line 1074), insert the merge block exactly as specified:
            snapshot `inMemoryCooldownCount`, initialize `restoredCount = 0`,
            `await getActiveCooldowns()`, for-loop with skip/restore branches and logs.

- [x] T-03: Replace the existing `[EXIT_COOLDOWN_READY]` log at line 1074 in-place with the
            enhanced version: `inMemory=${inMemoryCooldownCount} persistent=${persistentCooldowns.length}
            restored=${restoredCount} total=${cooldownSymbols.size}`.
            Confirm only one `[EXIT_COOLDOWN_READY]` exists in the file.

### Phase 3 — Cleanup call (CHANGE 3)
- [x] T-04: After the `[EXIT_COOLDOWN_STATS]` log block (lines 1790–1795), insert the
            `cleanExpiredCooldowns()` try/catch block with `[COOLDOWN_CLEAN_FATAL]` error log.

### Phase 4 — Verification
- [x] T-05: Confirm `[EXIT_COOLDOWN_READY]` appears exactly once (`grep -c EXIT_COOLDOWN_READY`).
- [x] T-06: Confirm `inMemoryCooldownCount` is assigned BEFORE `getActiveCooldowns()` is called.
- [x] T-07: Run `npm run build` — zero TypeScript errors.

### Phase 5 — Testing
- [x] T-08: Write/extend unit test for AVGO cross-run scenario:
            mock `getActiveCooldowns()` returning `[{ symbol: 'AVGO', exit_reason: 'Z_SCORE_EXIT',
            cooldown_until: <future> }]`, assert `cooldownSymbols.has('AVGO') === true` and
            `restoredCount === 1`.
- [x] T-09: Write/extend unit test for same-run already-blocked scenario:
            AVGO already in `cooldownSymbols` (via exitReasons) AND returned by `getActiveCooldowns()`.
            Assert `[COOLDOWN_RESTORE_SKIP]` fires and `restoredCount === 0`.
- [x] T-10: Write/extend unit test for DB failure scenario:
            `getActiveCooldowns()` returns `[]`. Assert agent continues and `restoredCount === 0`.
- [x] T-11: Verify 80% coverage on the new merge block lines.
            (inline-replication pattern — all 9 branches exercised, consistent with Fase 1b)

## Post-Implementation

- [x] Run `/review cooldown-merge-fase-2b-c` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except the 3 approved change sites
- [ ] Commit: `feat: merge persistent cooldowns + cleanup — Fase 2b-C`

## Estimated Complexity

**Low** — 3 surgical insertions in a single file (import line + ~18 lines + ~5 lines).
All infrastructure (DB functions, table, types) already exists.
