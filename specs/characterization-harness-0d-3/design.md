# Design — CHANGE 0d-3: characterization scenarios for the entry-gate, auto-entry and ranking regions of runAgentCycle (tests only)

## Architecture Decision

Third step of the characterization harness (0d-1 and 0d-2 are done). The goal is to pin, before `runAgentCycle` is moved, the current behaviour of the regions that no test or golden pins today: the entry gates of the normal-mode path, the auto-entry path, and the ranking phase. Every scenario runs `runAgentCycle` through the existing harness (`world.ts`, `mocks.ts`, `builders.ts`, `harness.ts`) and records through `buildRecord`, exactly as scenarios (a) to (an-2). All changes are under `src/lib/__tests__/`; production files are not touched, and their SHA-256 is recorded before and after. Goldens record what the code does now, including oddities; nothing is fixed.

## Inventory (STEP 0, read-only, done at spec time)

### Existing scenarios (63 tests in `claude-agent.characterization.test.ts`)

Entries: (a) MEAN_REVERSION buy, (a) auto-entry buy, (b) TREND_PULLBACK_3DAY buy, (m) non-default env buy, (l) ranking with one free slot, (k) IOC zero fill, (aa) TREND_PULLBACK buy, (ab) TREND_ZLE05 buy, (ac) EMA_RECLAIM buy. Holds: (c) MR ranging ADX gate, (d) spread gate (above the limit), (e) earnings block, (f) portfolio-risk rejection, (ad-1) TREND_PULLBACK MACD floor, (ad-2) TREND_ZLE05 quality fail, (ad-3) EMA_RECLAIM near. Exits and rotation: (g), (h), (u) to (z5), (ai) to (an-2). Boundaries: (i) no candidates, (i) market closed with no positions, (j) Claude and broker errors, (s) GTC_STOP re-entry skip, (t) persistent cooldown skip. Execution: (ae), (af-1), (af-2), (ag). Skips: (ah) blacklisted, in position, no indicators. Plus the Claude call-parameter tests. Golden files are the 61 under `__golden__/claude-agent/`.

### Coverage today (characterization file alone, V8, `claude-agent.ts:532-2015`)

463/574 statements and 391/533 branches. Uncovered statement lines, grouped:

| Region | Uncovered statement lines |
|--------|---------------------------|
| Entry gates | `1599` (market closed with a position), `1612-1613` (liquidity), `1616-1617` (no quote), `1620-1621` (stale quote), `1629-1630` (trading hours), `1634-1635` (in-loop overtrading), `1570`, `1580`, `1585` (early max-buys gate) |
| Buying power / position | `1777-1778` (insufficient buying power), `1783` (already in position) |
| Auto-entry | `1331` (bypass log), `1480-1481` (no setup, skipped), `1497-1502` (watchlist context), `1983` (auto-entry marked after a ranking buy) |
| Setup variants | `1353-1354`, `1364` (TREND_ZGT125), `1408-1411`, `1421` (3DAY above SMA5), `1188` (SMA5 unusable), `1533`, `1540-1541` (Claude response not text / JSON parse failure) |
| Ranking | `1859`, `1860` (sort tie-breakers), `1868-1869` (market closed), `1872` (no quote), `1877-1879` (zero fill), `1882` (partial-fill log), `1899` (stop failure), `1943-1961` (TREND_PULLBACK / TREND_ZLE05 context fields), `1990-1991` (error catch) |
| Others (out of scope) | `534-563` (argument guards), `588`, `592`, `614-637`, `651`, `669`, `676`, `678`, `699-730`, `745`, `757-758`, `787-799`, `866`, `908`, `961`, `978`, `1077`, `1080` (rotation failure paths), `1850` (cleanup catch) |

## Final list of scenarios (to be confirmed at implementation by re-running the inventory)

| Scenario | Target (`claude-agent.ts`) | Status in the inventory |
|----------|---------------------------|-------------------------|
| (ao) liquidity 999,999 blocked | `:1611-1614` | uncovered: build |
| (ao-b) liquidity exactly 1,000,000 passes | `:1611`, `execution-gates.ts:2` | uncovered: build (assertions, no golden) |
| (ap-1) no quote | `:1615-1618` | uncovered: build |
| (ap-2) stale quote | `:1619-1622` | uncovered: build |
| (ap-3) spread exactly at `MAX_SPREAD_BPS` passes | `:1623` | boundary of (d): build (assertions, no golden) |
| (aq-1) 9:44 ET blocked | `:1628-1631`, `execution-gates.ts:6-18` | uncovered: build |
| (aq-2) 15:31 ET blocked | same | uncovered: build |
| (aq-3) 9:45 ET passes | same | boundary: build (assertions, no golden) |
| (aq-4) 15:30 ET passes | same | boundary: build (assertions, no golden) |
| (ar) 5 buys already today | `:1569-1586` | uncovered: build |
| (as) TREND_ZGT125 exclusion | `:1352-1365` | uncovered: build. The name exists as an exclusion HOLD, not as a setup |
| (at) 3DAY with price above SMA5 | `:1407-1422` | uncovered: build |
| (au) insufficient buying power | `:1776-1779` | uncovered: build |
| (av) market closed with an open position | `:1598-1599` | uncovered: build |
| (aw-1) auto-entry without a setup | `:1330-1332`, `:1479-1482` | uncovered: build |
| (aw-2) auto-entry blocked by an entry gate | `:1611-1631` | build |
| (aw-3) auto-entry with trend z > 1.25 | `:1352-1365` | build |
| (ax-1) ranking: no quote at ranking time | `:1871-1872`, `:1989-1992` | uncovered: build |
| (ax-2) ranking: zero fill | `:1876-1879` | uncovered: build |
| (ax-3) ranking: partial fill | `:1881-1883` | uncovered: build |
| (ax-4) ranking: stop submission fails | `:1898-1900` | uncovered: build |
| (ax-5) ranking: different z, no edge | `:1859` | uncovered: build |
| (ax-6) ranking: same z, different confidence | `:1860` | uncovered: build |
| (ax-7) ranking: stale or wide re-fetched quote still executes | `:1871-1873` | "current behavior": build |

Skipped as already covered: liquidity-below-1M is not covered, but portfolio-risk rejection is covered by (f) (`:1647-1649`); symbol in a position by (ah); symbol in cooldown by (s) and (t); spread above the limit by (d); the ranking happy path by (l).

Skipped as unreachable (to be confirmed by the inventory and reported in the review):
- In-loop overtrading gate `:1633-1636`: `buysToday` is checked at `:1569` in the same iteration and is not changed between the two checks.
- `Already in position` `:1782-1784`: the main loop skips symbols with an open position before the gate (scenario (ah)).
- Ranking market closed `:1867-1870`: `marketOpen` is a `const` (`:640`) and a candidate is queued only when it is true. Replaced by (av) in normal mode.

Counts: 20 new goldens ((ao), (ap-1), (ap-2), (aq-1), (aq-2), (ar), (as), (at), (au), (av), (aw-1) to (aw-3), (ax-1) to (ax-7)) and 4 boundary tests that assert without a golden, so 24 new characterization tests. Expected after the change: 63 + 24 = 87 characterization tests, 61 + 20 = 81 goldens, full suite 1216 + 24 = 1240. These numbers are confirmed at the end.

## Observe first, then pin

For each scenario: (1) arrange with `world.reset(...)`, (2) run `runAndRecord()`, (3) read the result and the console lines, (4) write the expectations from what was observed, (5) let the first run create the golden (no update flag), (6) run three times and compare. Expected observations to check (not to assume): the error texts above, the Claude call count (the gates run after the Claude call, so Claude is called for gate-blocked candidates), the `detectNearMisses` calls recorded in the world, and whether (aw-3) reaches the `TREND_ZGT125` exclusion.

## Harness needs (decided at implementation, only if strictly needed)

- Clock: the harness sets `PINS.nowIso` (`2026-11-04T15:30:00Z`, 10:30 ET). Scenarios (aq-1) to (aq-4) call `vi.setSystemTime` inside the test: 9:44 ET = 14:44Z, 9:45 ET = 14:45Z, 15:30 ET = 20:30Z, 15:31 ET = 20:31Z (EST on that date). The gate works at minute granularity (`totalMinutes >= 585 && <= 930`).
- Account buying power (`world.ts:55` default `400000`), previous-day volume and SMA5 (builders), and the near-miss entry used for the watchlist context may need optional overrides. Each one is added only if the existing scripting cannot express the scenario, with a default that reproduces today's output; the 61 goldens prove it.
- Quote sequence (`quoteSequence`), fill plan (`fillPlan`), stop errors (`stopErrors`), `buysToday`, `autoEntry`, `risk` and `marketOpen` already exist in the world config.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One golden per scenario, assertions without golden for boundary passes | Keeps the golden count small | The boundary-pass case has no full record | Chosen |
| A golden for every boundary case | Full record | 4 near-duplicate goldens of (a) | Rejected |
| Characterize through unit tests of the gates | Faster | Does not pin the call order inside `runAgentCycle` | Rejected |
| Fix or simplify the unreachable branches | Cleaner code | Production change; out of scope | Rejected |
| Include the optional extra regions (Q-3) now | Higher coverage | Beyond the listed candidates | Deferred |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/__tests__/claude-agent.characterization.test.ts` | MODIFY | New scenarios (ao) to (ax-7); existing tests untouched |
| `src/lib/__tests__/__golden__/claude-agent/*.json` | CREATE | 20 new goldens; the 61 existing untouched |
| `src/lib/__tests__/support/claude-agent/*.ts` | MODIFY (only if needed) | Optional scripting with unchanged defaults |
| `specs/characterization-harness-0d-3/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: every file under `src/` outside `src/lib/__tests__/`, workflows, configs, `docs-5` `tasks.md`.

## Pending observations (to be pinned as current behaviour and listed in `review.md`)

- Ranking mode re-fetches a quote (`:1871`) and does not re-apply the stale, spread, liquidity or hours gates of the normal mode (pinned by (ax-7)).
- Three branches look unreachable (see above).
- Normal mode sets `decision.action = 'BUY'` before the order and reverts it on a zero fill; ranking sets it only after the fill.
- The sizing, order, stop and context blocks are duplicated between normal and ranking mode.
- Auto-entry without a setup logs that it bypasses the setup gate and is then skipped (pinned by (aw-1)).

## Risks

- Time-dependent scenarios: `vi.setSystemTime` inside a test must not leak; the harness `afterEach` restores timers.
- A scenario can reveal that the code does something unexpected: it is pinned and named "current behavior"; the code is not changed.
- A harness extension that changes a default would change a golden: the 61 SHA-256 comparison and the stop condition detect it.
- Goldens created on the first run depend on the run not being in CI mode (where missing snapshots fail); the implementation runs locally.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `claude-agent.ts` and every other production file are read, not edited, and their SHA-256 is compared before and after.

## Database Changes

None.

## Open Questions

- **Q-1 (request cut):** the request text ends inside its section 3 ("…not from what"), and sections 4 onward were not received. The spec assumes the conventions of 0d-1 and 0d-2 for the rest (observe, pin, verify, review, no commit). Confirm or send the missing part.
- **Q-2 (ranking market closed):** the ranking market-closed branch looks unreachable. Default: report it and cover the normal-mode market-closed case with a position, (av), instead. Confirm.
- **Q-3 (optional regions):** uncovered lines outside the candidate list: the TREND_PULLBACK / TREND_ZLE05 context fields of a ranking winner (`:1943-1961`), the auto-entry mark after a ranking buy (`:1982-1984`), the watchlist context in the prompt (`:1496-1506`), the SMA5-unusable warning (`:1187-1189`), Claude returning non-text or invalid JSON (`:1533`, `:1537-1541`). Default: out of scope. Include any?
- **Q-4 (boundary goldens):** boundary-pass scenarios (ao-b), (ap-3), (aq-3), (aq-4) assert without a golden. Default as stated. Confirm.
- **Q-5 (counts):** the expected counts (87 characterization tests, 81 goldens, 1240 in the suite) depend on the inventory confirming each target as uncovered and reachable; they are final only after implementation.
