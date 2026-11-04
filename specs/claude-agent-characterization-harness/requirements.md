# Requirements — CHANGE 0: characterization harness for runAgentCycle (tests only)

## Functional Requirements

### A. Harness and isolation
FR-01: The system shall run the real `runAgentCycle` from `src/lib/claude-agent.ts` inside Vitest with every external dependency replaced by a test double.
FR-02: The system shall replace the Alpaca module, the Supabase access modules (`db`, `db-cooldowns`, `agent-log`, `learning`), the Anthropic SDK, the news and market-context modules and the stock selector with test doubles.
FR-03: The system shall make no network call and use no real key or secret.
FR-04: The system shall freeze the clock with fake timers at a fixed instant.
FR-05: The system shall fix the process time zone so locale-formatted times in the prompt are stable.
FR-06: The system shall replace `crypto.randomUUID` with a counter-based generator.
FR-07: The system shall set the environment variables the cycle reads (`ANTHROPIC_API_KEY`, `ALPACA_API_KEY`, `RISK_PCT`, `STOP_LOSS_PCT`, `MAX_POSITIONS`, `MAX_POSITION_SIZE` and any other the cycle reads) to fixed fake values, and restore them after each test.
FR-08: The system shall not modify any production source file.

### B. Pinned configuration
FR-09: The system shall pin the trading constants imported from `config.ts` (`ZSCORE_ENTRY_THRESHOLD`, `INSTRUMENT_BLACKLIST`, `MAX_SPREAD_BPS` and any other imported) to explicit values inside the test setup.
FR-10: The system shall pin the z-score sizing override by wrapping `computeBuyQuantity` in a test double that passes an explicit `zOverrideEnabled` value, so the golden does not depend on the repository default of `Z_SIZING_OVERRIDE_ENABLED`.
FR-11: The system shall include at least one entry with a z-score at or below -2.0 in a BUY scenario so the pinned value is exercised.
FR-12: The system shall state the pinned value and the reason in the report.

### C. Scenarios
FR-13: The system shall provide scenario (a): a MEAN_REVERSION BUY that is filled.
FR-14: The system shall provide scenario (b): a TREND_PULLBACK_3DAY BUY.
FR-15: The system shall provide scenario (c): a HOLD caused by the MR_RANGING_ADX_GATE.
FR-16: The system shall provide scenario (d): a HOLD caused by the spread gate.
FR-17: The system shall provide scenario (e): a HOLD caused by the EARNINGS_BLOCK gate.
FR-18: The system shall provide scenario (f): a rejection returned by the risk manager.
FR-19: The system shall provide scenario (g): a SELL caused by the exit rules (z-score rule or profit target).
FR-20: The system shall provide scenario (h): a rotation close.
FR-21: The system shall provide scenario (i): a cycle with no candidates and no open positions.
FR-22: The system shall provide scenario (j): a Claude API or broker error path.
FR-23: If the STEP 0 report names a scenario that locks in more behaviour than one of the above, the system shall add it and list it in the report.
FR-24: If a scenario cannot be built without changing production code, the system shall stop, leave that scenario out and report why.

### D. What each scenario captures
FR-25: For each scenario the system shall capture the decision per symbol (action, signal type, error text).
FR-26: For each scenario the system shall capture the orders sent to the broker (symbol, side, quantity, order type).
FR-27: For each scenario the system shall capture the agent_log rows written (action, reasoning prefix, error codes).
FR-28: For each scenario the system shall capture the writes to `open_position_contexts` (save, update, remove).
FR-29: For each scenario the system shall capture the snapshot fields written with the log rows, including the `earnings` field.
FR-30: The system shall mask timestamps and generated identifiers before comparing.
FR-31: The system shall capture the exact prompt string sent to Claude in scenarios (a) and (b), so the prompt can be protected during a later move.

### E. Goldens and quirks
FR-32: The system shall generate each golden once from the current behaviour and store it as a file under a new test-support folder.
FR-33: The system shall fail a scenario whose golden file is missing instead of silently creating it when run in CI.
FR-34: The system shall capture the `entryLogId` mismatch (the watchlist link id never equals the agent_log entry id) as-is, with a comment in the test.
FR-35: The system shall capture that a rotation close does not clear the position context, as-is, with a comment in the test.
FR-36: The system shall list every further quirk it finds in the report and shall not fix any of them.

### F. Determinism and coverage
FR-37: The system shall produce identical results in three consecutive full runs of the new tests.
FR-38: The system shall add `src/lib/claude-agent.ts` to the `coverage.include` list in `vitest.config.ts`.
FR-39: The system shall change nothing else in `vitest.config.ts`.
FR-40: The system shall report the coverage percentage of `claude-agent.ts` produced by the new tests.

### G. Verification and report
FR-41: The system shall pass `npx tsc --noEmit`.
FR-42: The system shall pass the full `npx vitest run` with all existing tests unchanged.
FR-43: The system shall pass ESLint on the new files with no error.
FR-44: The system shall show with `git diff --name-only` and `git status` that the only changes are new test files, the new golden files and the one `vitest.config.ts` line.
FR-45: The system shall write the report to `.tmp/claude-agent-characterization-report.md`.
FR-46: The report shall contain the scenario list with what each locks in, the quirks, the pinned config, the coverage percentage, any scenario that could not be built, the line count of the new test code, and the recommended first production move (`prompt-builder`) marked as a recommendation only.
FR-47: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The new test code (harness, helpers, scenarios; excluding golden data files) shall be roughly 650 to 900 lines.
NFR-02: Each helper shall be small and readable (under 50 lines).
NFR-03: The new tests shall run in a time comparable to the existing suite (no real waiting; fake timers only).
NFR-04: The tests shall not print secrets.
NFR-05: Claims in the report that could not be verified shall be labelled as such.

## Constraints

C-01: The change shall not modify `claude-agent.ts` or any Protected Zone file (`config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`).
C-02: The change shall not modify any production source file.
C-03: The change shall not change any threshold, flag or logic, and shall not fix any quirk.
C-04: The change shall not tune production code to make a test pass.
C-05: The change shall create new test files, a new test-support folder and golden files, and edit only the `coverage.include` line of `vitest.config.ts`.
C-06: The change shall not commit, push, branch or open a PR.

## Out of Scope

- Splitting `claude-agent.ts` or moving any code (step 1, `prompt-builder`, comes only after this harness is green and reviewed).
- Repointing the 17 tests that replicate logic inline.
- Testing the internals of the mocked modules (risk manager, indicators, learning, watchlist monitor).
- A mutation check that edits `claude-agent.ts` (forbidden by C-01; see design O-5).
- Adding the future modules to the coverage list.
- Running the live cycle or any script that calls Alpaca, Anthropic or Supabase.
