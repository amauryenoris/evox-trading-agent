# Tasks — CHANGE 0: characterization harness for runAgentCycle (tests only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: no Protected Zone file is edited; `claude-agent.ts` is only executed)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-6 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline and feasibility probe
- [x] T-01: Record the baseline (`npx vitest run`: 973 passing) and `git status`; read `.tmp/claude-agent-split-step0.md` sections 2, 4 and 8.
- [x] T-02: Feasibility probe: write the smallest scenario (i, no candidates / no positions) with the doubles it needs; confirm `runAgentCycle` runs with no network and no production edit. STOP and report if a boundary cannot be doubled (FR-24).

### Phase 2 — Support code (small helpers, no `*.test.ts` names)
- [x] T-03: Setup helper: fake timers at a fixed instant, fixed `TZ`, counter `randomUUID`, fixed env vars, restore after each test.
- [x] T-04: Mock factories: Alpaca, Anthropic, DB/cooldowns/agent-log/learning recorders, selector/news/watchlist/risk doubles, with one ordered call log.
- [x] T-05: Pinned config: `vi.mock('../config')` with explicit constants; `computeBuyQuantity` wrapper with the pinned `zOverrideEnabled`.
- [x] T-06: Builders for account, positions, bars/indicators per setup, quotes, scripted Claude replies.
- [x] T-07: Normalizer producing the record (decisions, orders, agentLog with snapshot, contexts, callLog, prompt) with timestamps and ids masked.

### Phase 3 — Scenarios (write each, run, inspect the recorded output before accepting the golden)
- [x] T-08: Scenario (i) no candidates / no positions.
- [x] T-09: Scenario (a) MEAN_REVERSION BUY, z <= -2.0, with the prompt golden.
- [x] T-10: Scenario (b) TREND_PULLBACK_3DAY BUY, with the prompt golden.
- [x] T-11: Scenarios (c) MR_RANGING_ADX_GATE, (d) spread gate, (e) EARNINGS_BLOCK.
- [x] T-12: Scenario (f) risk-manager rejection.
- [x] T-13: Scenario (g) exit SELL by exit rules.
- [x] T-14: Scenario (h) rotation close, with the quirk comment (context not cleared, no cooldown).
- [x] T-15: Scenario (j) Claude API error path (and broker error if cheap).
- [x] T-16: Add the `entryLogId` mismatch quirk comment and assertion in the BUY scenarios.
- [x] T-17: If the size budget allows (O-2): ranking scenario and IOC zero-fill scenario.

### Phase 4 — Goldens, determinism, coverage
- [x] T-18: Generate the golden files once from current behaviour; review each file by eye for anything that looks accidental (secrets, absolute paths, volatile values).
- [x] T-19: Run the new tests three times; confirm identical output and unchanged golden files.
- [x] T-20: Sensitivity check without touching production code (O-5): perturb a mocked input and confirm the right scenario fails; restore.
- [x] T-21: Add `src/lib/claude-agent.ts` to `coverage.include` in `vitest.config.ts` (one line); run `npx vitest run --coverage` and note the percentage.

### Phase 5 — Verification
- [x] T-22: `npx tsc --noEmit`.
- [x] T-23: Full `npx vitest run` (existing tests unchanged and passing).
- [x] T-24: ESLint on the new files.
- [x] T-25: `git status` / `git diff --name-only`: only new test files, goldens and the one `vitest.config.ts` line; no production or Protected Zone file.
- [x] T-26: Count lines of the new test code (excluding goldens).

### Phase 6 — Report
- [x] T-27: Write `.tmp/claude-agent-characterization-report.md`: scenarios and what each locks in, quirks, pinned config and reason, coverage %, scenarios not built and why, line count, and the `prompt-builder` first move as a recommendation only.

## Post-Implementation

- [ ] Run /review claude-agent-characterization-harness to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; commit is a separate request from Amaury

## Estimated Complexity

High for a test-only change. The code to write is moderate (650-900 lines), but `runAgentCycle` has about 20 external boundaries and shared mutable state, and some scenarios (rotation, ranking) need carefully crafted inputs. The feasibility probe (T-02) is the gate: if a boundary cannot be doubled without a production edit, the work stops and reports.
