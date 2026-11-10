# Review Report — CHANGE 0d-1: characterization harness, scenarios for exits, stops and ghost-close (tests only)

**Date**: 2026-11-10
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verified at implementation time: `git status` and `git diff --name-only`, SHA-256 of the 18 existing goldens before and after, three consecutive runs of the characterization file, `tsc`, the full suite, ESLint, and the coverage report for `claude-agent.ts` before and after. Every new golden was read against the code path (see the table). Run `/review` for an independent second pass.

---

## Result in numbers

| Item | Before | After |
|------|--------|-------|
| Characterization tests | 23 | 44 (+21) |
| Full suite | 1167 in 78 files | 1188 in 78 files |
| Goldens | 18 | 39 (+21 new, 18 existing byte-identical) |
| `claude-agent.ts` statements covered (characterization file only) | 549 / 918 (59.8%) | 699 / 918 (76.1%), +150 |
| `claude-agent.ts` branches covered | 382 / 814 (46.9%) | 515 / 814 (63.3%), +133 |

## Scenario table

| Scenario | Code path (`claude-agent.ts`) | What the golden pins | QUIRK |
|----------|-------------------------------|----------------------|-------|
| (n) ghost-close loss | `:1196-1250` loop; STOP_LOSS write `:1249-1257` | Call order: `tradeEvaluationExists`, `getLatestSellOrder`, `evaluateClosedTrade` (sell price 90), `recordOutcome`, context delete, agent_log `ghost_close` (quantity 10), `cooldown.upsert STOP_LOSS`; 1 evaluation. Test also asserts raw `until` = 2026-11-09 (third trading day) | — |
| (o) loss, existing cooldown | `existingCooldowns` `:1192`; `COOLDOWN_SKIP` `:1258-1262` | Identical to (n) minus the `upsert` line | — |
| (p) profit, trailing confirmed | `:1263-1278`, `isConfirmedTrailingStopFill` | Sell price 110; `upsert TRAILING_STOP`; raw `until` = 2026-11-05 (next trading day) | — |
| (q) profit, not confirmed | same block, other branch | `upsert GHOST_CLOSE_PROFIT`; raw `until` = 2026-11-04T21:00Z (end of day) | Yes: `GHOST_CLOSE_PROFIT` is not a member of `ExitReason` |
| (r) already evaluated | `:1207-1211` | No `evaluateClosedTrade`, no `recordOutcome`, 0 evaluations; context delete and agent_log still written | — |
| (s) GTC_STOP re-entry skip | `closedThisCycle` `:1321`, skip `:1404-1409` | Symbol is analysed (`getBars`, news layer) but no decision, no `claude.create`, no order | — |
| (t) persistent cooldown skip | restore `:1360-1372`, skip `:1404-1409` | Same shape as (s) for an active cooldown row | — |
| (u) profit-floor activation | `applyProfitFloor` `:576-621`, `replaceProtectiveOrder` `:487-531`, `persistProtectiveStopSnapshot` `:537-555` | `cancelOrder stop-HLD`, `submitStopOrder` at 103, patches `{stopOrderId:null, trailingStopOrderId:'stop-1'}` then `{highSinceEntry:106, trailingActivated:true, trailingStop:103}`, snapshot (`floorPct` 3, `highPct` 6.000000000000005, `stopOrderId` stop-1); no sell | — |
| (v) profit-floor sell-now | `handleFloorSellNow` `:562-574` | `closePosition`, reason "profit floor $103.00 (+3.00%) breached", evaluate at price 102, context delete, `upsert TRAILING_STOP` (the profit-floor text maps to TRAILING_STOP); no order moved | — |
| (w1) cancel fails | `cancel_failed` `:501-505`, `logNakedStopAlert` `:463-474` | `cancelOrder` only, no `submitStopOrder`; agent_log `trailing_stop_naked` ("CANCEL FAILED"); context patch `{highSinceEntry:106}` only | — |
| (w2) cancel ok, submit fails | `naked` `:519`; retry `submitStopWithRetry` `:733-752` | Two `submitStopOrder` attempts (retry timer drained by `pump`); agent_log `trailing_stop_naked` ("SUBMIT FAILED"); then context patched with `trailingActivated:true, trailingStop:103` and a snapshot with `stopOrderId:null` | Yes: the position is naked yet the context is marked trailing-activated and a snapshot is stored |
| (x1) ATR trailing, 3DAY | `:262-345`, `TRAILING_ACTIVATION_PCT` (`protective-stop.ts:17-24`) | At +7% (threshold 6%): `cancelOrder` Capa A, `submitStopLimitOrder` stop 104 / limit 103.48 (mult 1.5), patches `trailingStopOrderId:'stoplimit-1'` and `trailingStop:104` | — |
| (x2) ATR trailing, RECLAIM | same | At +5% (threshold 4%): stop 103 / limit 102.48 (mult 1.0), same patches | — |
| (y) exit rules by setup | `:212-244` | PB and RC sold on EMA50 break (cooldown `EMA_FAILURE`); ZE sold at z 1.25 ("move exhausted", `Z_SCORE_EXIT`); ZN (ZLE05 with an EMA50 break, z 0.5) not sold; TD sold on SMA5 reclaim (`SMA5_RECLAIM`) | — |
| (z1) profit-target boundaries | `:203-205`, `getProfitTargetPct` | N2 sold at exactly 10% and Z2 at exactly 5% (`PROFIT_TARGET`); N1 at 9.9% and Z1 at 4.9% not sold, and their ATR trailing activated (stop-limit placed) | — |
| (z2a) time stop | `:210-212` | `Exit rule: 20-day time stop (20 trading days open)`, sell, no `cooldown.upsert` | — |
| (z2b) invalid timestamp | `:207-209` | No sell, `exit_rules_check` HOLD; the warning text asserted with the `console.warn` spy | — |
| (z3) Capa B stop loss | `enforceStopLosses` `:664-699` | `closePosition`, `upsert STOP_LOSS` (raw `until` 2026-11-09) | Yes: the exit rules still evaluate the same position afterwards (`exit_rules_check` HOLD, context patch) and no SELL decision is logged for the Capa B closure |
| (z4a) orphan, new stop | `:124-190` | `submitStopOrder` at 95 (entry 100 x 0.95), `saveOpenPositionContext` (AUTO-RECONCILED), agent_log `orphaned_position_reconciled` | — |
| (z4b) orphan, existing order | `:127-132` | No `submitStopOrder`; context saved; log written | — |
| (z5) no Kalman | `:105-116` | agent_log `exit_rules_skip`; no sell; no context call | — |

## Files changed

- `src/lib/__tests__/claude-agent.characterization.test.ts` — 383 lines added: new `describe` blocks, constants for the raw cooldown dates, one extra import (`PINS`) and one type import (`AlpacaOrder`).
- `src/lib/__tests__/support/claude-agent/world.ts` — 27 added, 4 changed: optional scripting for sell orders, evaluated trades, open/filled orders, cancel and stop-submit failures. Every default reproduces the old behaviour; the 18 existing goldens are byte-identical.
- 21 new goldens under `__golden__/claude-agent/`.
- `specs/characterization-harness-0d-1/`.

No file outside `src/lib/__tests__/**` and the spec folder was touched. `mocks.ts`, `record.ts`, `harness.ts` and `builders.ts` are unchanged.

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Scenarios (n) to (z5) added | ✅ | 21 cases |
| FR-02 / FR-03 | Only `src/lib/__tests__/**` and the spec folder; nothing else in `src/` | ✅ | `git diff --name-only` |
| FR-04 | No workflow, config, settings, hook or doc touched | ✅ | |
| FR-05 / FR-06 | Existing goldens untouched | ✅ | SHA-256 of all 18 equal before and after |
| FR-07 / FR-08 | Naming and recording through `buildRecord` and the frozen clock | ✅ | |
| FR-09 / FR-10 | Reuse of helpers; defaults unchanged | ✅ | Only `world.ts` extended |
| FR-11 | LF | ✅ | 0 CR in both edited files |
| FR-12 / FR-13 | Pin behaviour; mark QUIRKs | ✅ | (q), (w2), (z3) |
| FR-14 | Stop on infeasible scenarios | ✅ | None were infeasible |
| FR-15 to FR-21 | Ghost-close and cooldown scenarios (n) to (t) | ✅ | See table |
| FR-22 | Raw `until` asserted | ✅ | In (n), (o) (no upsert), (p), (q), (z3) |
| FR-23 to FR-30 | Profit floor and trailing scenarios (u) to (x) | ✅ | |
| FR-31 to FR-34 | Setup exits (y) | ✅ | |
| FR-35 / FR-36 | Profit-target boundaries | ✅ | |
| FR-37 / FR-38 | Time stop and invalid timestamp | ✅ | |
| FR-39 | Capa B | ✅ | |
| FR-40 / FR-41 | Orphan variants | ✅ | |
| FR-42 | No Kalman | ✅ | |
| FR-43 to FR-47 | Harness scripting; call shapes unchanged | ✅ | |
| FR-48 / FR-49 | Goldens read against the code; described | ✅ | Table above |
| FR-50 | Three runs identical | ✅ | 44/44 each; no snapshot written on runs 2 and 3 |
| FR-51 | `tsc` | ✅ | |
| FR-52 | Full suite | ✅ | 1188 (1167 + 21) |
| FR-53 | ESLint | ✅ | No output (clean) on the harness folder and the test file |
| FR-54 | Only allowed files | ✅ | |
| FR-55 / FR-56 | Coverage before and after; still uncovered | ✅ | See below |
| FR-57 / FR-58 | This table and the final report | ✅ | |
| FR-59 | No commit or push | ✅ | |
| NFR-01 | Goldens independent of clock, order and random ids | ✅ | Stable over three runs |
| NFR-02 | No network or keys | ✅ | |
| C-01 | Protected Zone untouched | ✅ | `claude-agent.ts` not in the diff |
| C-02 | docs-5 `tasks.md` untouched | ✅ | SHA `a94014bf...` unchanged |

## Still uncovered in the exit, stop and ghost-close regions

| Region | Statements still uncovered | What they are |
|--------|----------------------------|---------------|
| `enforceExitRules` `:93-440` | 18 (from 67) | Error-handling `.catch` callbacks (`:116`, `:188`, `:190`, `:297-298`, `:356`, `:387`, `:429`, `:435`); orphan stop-submission failure (`:140`); orphan filled-buy lookup (`:150-153`, `:158`); peak-high update (`:274`, harness stub returns `null`); stop-corruption guard (`:325`); ATR trailing-stop exit (`:368`); exit-reason conflict log (`:409`) |
| Profit-floor helpers `:461-621` | 11 (from 52) | `.catch` callbacks (`:473`, `:514`, `:534`, `:553`); `!orderId` and `!ctx.quantity` guards (`:477`, `:491`); `!snapshot` (`:551`); "needs no order" and "exit already set" branches (`:601`, `:606`) |
| `enforceStopLosses` `:664-699` | 3 (from 10) | Context-fetch failure (`:670-671`); close failure (`:695`) |
| Ghost-close `:1196-1290` | 4 (from 29) | agent_log insert failure (`:1247`); profit with an existing cooldown (`:1280-1281`); loop-level failure (`:1289`) |
| Skip and restore `:1320-1410` | 10 (from 18) | UNKNOWN exit-reason branch (`:1340-1344`); restore-skip log (`:1359`); blacklisted and open-position skips (`:1394-1399`) |

Real decision branches still not pinned: the ATR trailing-stop exit (`:368`), ghost-close with a profit and an existing cooldown (`:1280`), the peak-high update and the orphan buy-timestamp lookup. They can be added in a follow-up if wanted.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** Three quirks pinned, not fixed: `GHOST_CLOSE_PROFIT` outside `ExitReason` (q); a naked position marked trailing-activated with a snapshot (w2); the exit rules re-evaluating a position that Capa B just closed, with no SELL decision logged (z3).
- **L-2** The goldens mask timestamps, so cooldown dates are pinned by explicit assertions in the test bodies, not by the golden files.
- **L-3** Coverage numbers are for the characterization file alone (`claude-agent.ts` included only); the full suite's own coverage is higher.
- **L-4** `specs/docs-5-selector-criteria/tasks.md` is still modified and uncommitted.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
