# Design — Fix report-generator.ts HOLD Classification for MR Gate-Blocked Entries

## Architecture Decision

This is a one-branch addition to the existing if/else classification chain in `generateWeeklyReport()`'s "HOLDs Breakdown" section (`src/lib/report-generator.ts`, inside the `for (const e of nonExecuted)` loop at lines 214-246). It is purely additive: one new `else if` clause, following the exact same shape as the existing `TREND_ZGT05`/`TREND_QUALITY_FAIL` branches (lines 239-242), which already establish the precedent that setup-level structural/quality rejections map to `noSetupDetected`.

## Data Flow

```
nonExecuted entries (weekly HOLD log rows)
  for each entry e:
    err = e.error ?? ''
    ...existing branches (Setup gate:, Liquidity, Hours, Overtrading)...
    NEW: else if (err.includes('MR_RANGING_ADX_GATE'))  → noSetupDetected++
    else if (err.includes('gate') || err.includes('Gate') || err.includes('Market closed'))  → gate4Portfolio++   (existing, now unreachable for this prefix — confirmed safe, no other entry type relies on falling through to here from this prefix)
    ...existing branches (Already in position, exit_rules_*, err==='', TREND_ZGT05, TREND_QUALITY_FAIL)...
    else → otherHold++
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New `else if (err.includes('MR_RANGING_ADX_GATE'))` branch, placed before line 224 (generic gate check), mirroring the TREND_ZGT05/TREND_QUALITY_FAIL pattern | Matches existing code style exactly; minimal diff; explicit about intent | One more branch in an already-long chain | **Chosen** |
| Extend line 216's condition with `\|\| err.includes('MR_RANGING_ADX_GATE')` | Even smaller diff (one line changed, not added) | Conflates two semantically different match patterns (`'Setup gate:'` literal phrase vs. a different prefix) into one condition — less readable, harder to trace in a future diagnostic | Rejected — clarity favors a separate branch, consistent with how `TREND_ZGT05`/`TREND_QUALITY_FAIL` already got their own branches rather than being merged into line 216 |
| Add a new `gateBlockedSetup` counter, surfaced separately in the PDF | More granular reporting | STEP 0 concluded this is unwarranted — not requested, no existing UI slot for it, would require report-template changes (out of scope) | Rejected — YAGNI, contradicts STEP 0 finding |
| Make the generic `err.includes('gate')` check case-insensitive | Would also "fix" this without a new branch | Risks reclassifying other future or existing entries that happen to contain "GATE" in any unrelated all-caps context as `gate4Portfolio` — the spec explicitly forbids loosening this matching | Rejected — explicitly disallowed by spec |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/report-generator.ts` | MODIFY | Add one `else if (err.includes('MR_RANGING_ADX_GATE')) { noSetupDetected++ }` branch inside the existing loop (~line 224, before the generic gate branch) |

## Protected Zone Impact

None — `report-generator.ts` is not in the Protected Zone (CLAUDE.md "Touch freely" list includes `src/lib/report-generator.ts` explicitly).

## Database Changes

None.

## Open Questions

None — STEP 0 fully resolved the only open design question (whether a dedicated counter is warranted: no).
