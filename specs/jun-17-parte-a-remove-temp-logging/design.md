# Design — Jun 17 Parte A: Remove Temp Logging ZLE05 + TREND_PULLBACK + EXIT_COOLDOWN

## Architecture Decision

All changes are confined to `src/lib/claude-agent.ts` — the core agent loop. This file sits
in the Protected Zone. The removals are purely additive deletions: no logic paths change,
no data flows change, no types change. The only observable effect is fewer `console.log`
calls per cycle.

---

## Affected Code Locations

All line numbers reference the state of `claude-agent.ts` as of Jun 16 2026.

### Group A — TREND_ZLE05 temp logging (inside per-symbol loop)

| Block | Lines | Action |
|-------|-------|--------|
| Counter declarations (+ `// TEMP LOGGING` comment) | ~1107–1111 | Remove 4 `let` lines + comment |
| `[TREND_ZLE05] ADX null` if-block | ~1345–1347 | Remove entire if-block |
| `[TREND_ZLE05_ENTRY]` if-block (incl. local `zBucket`, `adxBucket`) | ~1372–1379 | Remove entire if-block |
| `[TREND_ZLE05_REJECTED_Z]` if-block | ~1381–1384 | Remove entire if-block |
| `[TREND_ZLE05_STATS]` log | ~1842 | Remove single line |

**Counter declarations detail:** Lines 1108–1111 are the four ZLE05 counters tagged `// TEMP LOGGING`.
Lines 1112–1113 (`trendPullbackBlockedMacd`, `mrBlockedRangingAdxSymbols`) are on the same block
but are permanent — remove only the 4 ZLE05 lines and the `// TEMP LOGGING` comment above them.

### Group B — TREND_PULLBACK temp logging (inside per-symbol loop)

| Block | Lines | Action |
|-------|-------|--------|
| Outer `zBucket` declaration (incl. `// TEMP LOGGING` comment) | ~1288–1296 | Remove entire block |
| `populationBucket` declaration | ~1298–1301 | Remove entire block |
| `[TREND_PULLBACK_ENTRY]` if-block | ~1326–1334 | Remove entire if-block |
| `[TREND_PULLBACK_HIGH_VOL]` if-block | ~1336–1343 | Remove entire if-block |

**Note:** The local `zBucket` inside `if (trendZLE05Setup)` (Group A) is removed as part of that
block. The outer `zBucket` (Group B) is a separate declaration — they shadow each other and must
be removed independently.

### Group C — EXIT_COOLDOWN logging (in `enforceExitRules` and end-of-cycle)

| Block | Lines | Action |
|-------|-------|--------|
| `[EXIT_COOLDOWN]` log | ~331 | Remove single `console.log` line only |
| `[EXIT_COOLDOWN_ADD]` site 1 (reason=UNKNOWN) | ~1064 | Remove single `console.log` line only |
| `[EXIT_COOLDOWN_ADD]` site 2 (reason=reason) | ~1070 | Remove single `console.log` line only |
| `activeBreakdown` variable declaration | ~1845–1847 | Remove — used only by [EXIT_COOLDOWN_STATS] |
| `excludedBreakdown` variable declaration | ~1849–1854 | Remove — used only by [EXIT_COOLDOWN_STATS] |
| `[EXIT_COOLDOWN_STATS]` console.log block | ~1856–1861 | Remove entire block |

---

## Data Flow

No data flow changes. The variables `cooldownSymbols`, `exitReasons`, `cooldownReasons` remain.
The logic that populates them is untouched. Only the `console.log` statements that read from them
(and the two helper variables `activeBreakdown`/`excludedBreakdown` that existed solely for the
log) are removed.

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep all logs but gate them behind a `DEBUG_LOGGING` env flag | No permanent loss; easy to re-enable | Adds complexity, env var, dead code path | Rejected — analysis is complete, no re-enable path needed |
| Remove logs but keep counter variables | Partial cleanup | Dead counters confuse future readers | Rejected — counters with no consumers are noise |
| Remove everything now (this spec) | Clean, minimal, tsc-verified | Requires Protected Zone confirmation | Chosen |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Remove 12 blocks of temp logging + dead variables |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.
**Requires Amaury confirmation before implementation.**

---

## Database Changes

None.

---

## Open Questions

None — all blocks are precisely identified, all "keep" vs "remove" decisions are explicit in the spec.
