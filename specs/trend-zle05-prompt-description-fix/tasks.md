# Tasks — TREND_ZLE05 Prompt Description Fix

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed (`src/lib/claude-agent.ts` — prompt string only, no gate logic)

## Implementation Checklist

### Phase 1 — Prompt fix (Protected Zone)

- [x] T-01: In `src/lib/claude-agent.ts` `buildEnrichedPrompt()` (~line 539–541), replace the TREND_ZLE05 description block:
  - "slightly above fair value" → "moderately above fair value"
  - `0 < z-score <= 0.5` → `0 < z-score <= 1.25`
  - `MACD histogram positive` → `MACD histogram > 0`
  - `ADX >= 20` → `ADX >= 18 (or >= 15 with strong MACD > 0.25)`
  - Add note: `z 0.5–1.25 is the expanded bucket — valid continuation signal when ADX and MACD confirm trend quality`
- [x] T-02: Verify line 1160 (`zScore <= 0.5 ? 'legacy' : 'expanded'`) is untouched

### Phase 2 — Optional documentation sync (inert files)

- [x] T-03: `CLAUDE.md` line 157 — `z-score 0–0.5` → `z-score 0–1.25`
- [x] T-04: `README.md` line 238 — `z-score 0–0.5` → `z-score 0–1.25`
- [x] T-05: `SDD.md` line 108 — `z-score 0–0.5` → `z-score 0–1.25`, ADX updated
- [x] T-06: `.claude/agents/trading-reviewer.md` line 54 — `z-score 0–0.5` → `z-score 0–1.25`, ADX updated
- [x] T-07: `.claude/agents/test-agent.md` line 259 — `z-score 0–0.5` → `z-score 0–1.25`

### Phase 3 — Verification

- [x] T-08: Run `npm run build` — zero TypeScript errors
- [x] T-09: Confirm no gate logic changed (`trendZLE05Setup`, `adxOkZLE05`, `trendQualityOkZLE05`)
- [x] T-10: Confirm other setup descriptions (`MEAN_REVERSION`, `TREND_PULLBACK`, `EMA_RECLAIM`) untouched

## Post-Implementation

- [x] Run `/review trend-zle05-prompt-description-fix` to verify implementation matches spec
- [x] Confirm `src/lib/claude-agent.ts` changes are prompt-string only (Protected Zone audit)

## Estimated Complexity

**Low** — single string replacement in one file. No logic changes, no schema changes, no new tests required (the change is to a text prompt, not testable behavior).
