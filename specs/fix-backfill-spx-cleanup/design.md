# Design — Fix Backfill SPX Cleanup (MEDIUM findings)

## Architecture Decision

Both changes are cosmetic/doc fixes to the existing one-off script and its spec. No architectural change required — this stays entirely within `scripts/` and `specs/`.

## Data Flow

No data flow change. The early-exit path (empty trade list) now branches on `isLive` before returning; all other paths are unchanged.

## Change Details

### CHANGE 1 — Move `isLive` declaration before early-exit

**Current state** (`scripts/backfill-spx-regime.ts`):
- Line 59–62: early-exit block (always logs `[BACKFILL_DRY_DONE]`, regardless of mode)
- Line 98: `const isLive = process.env.RUN_BACKFILL === 'true'`

**Problem**: `isLive` is declared after the early-exit, so the early-exit can't branch on it.

**Fix**:
1. Move `const isLive = process.env.RUN_BACKFILL === 'true'` to just before the early-exit block (after the fetch-error check, before the `trades.length === 0` guard).
2. Replace the single `console.log` in the early-exit with an `if (isLive) / else` branch:
   ```ts
   if (trades.length === 0) {
     if (isLive) {
       console.log('[BACKFILL_DONE] updated=0 skipped=0 failed=0')
     } else {
       console.log('[BACKFILL_DRY_DONE] wouldUpdate=0 wouldSkip=0')
     }
     return
   }
   ```
3. Remove the now-duplicate `const isLive` declaration at the original line 98.

### CHANGE 2 — Update FR-02 in requirements.md

**Current state** (`specs/backfill-spx-regime/requirements.md` line 7):
```
FR-02: The system shall compute the SPY bar date range as: `earliestBuyDate − 250 calendar days` ...
```

**Fix**: Replace `250` with `400` to match the actual implementation (line 68 of the script uses `− 400`).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Inline `process.env.RUN_BACKFILL === 'true'` in early-exit | No declaration move | Duplicates the expression; two sources of truth | Rejected |
| Move `isLive` before early-exit | Single declaration, consistent with rest of function | Requires removing the duplicate at L98 | Chosen |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `scripts/backfill-spx-regime.ts` | MODIFY | Move `isLive` declaration before early-exit; branch early-exit log on `isLive` |
| `specs/backfill-spx-regime/requirements.md` | MODIFY | Update FR-02: `250` → `400` calendar days |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None.

## Open Questions

None.
