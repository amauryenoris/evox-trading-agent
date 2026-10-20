# Review Report — STEP 0: BUY Sizing and Portfolio Limits Investigation (read-only)

**Date**: 2026-10-20
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS (no CRITICAL or HIGH findings; 2 MEDIUM, 4 LOW)

The deliverable is the report `.tmp/step0-report.md` plus the re-runnable scripts and their saved outputs in `.tmp/step0-*.ts` and `.tmp/step0-output/` (all gitignored). During this review the outputs of every script were regenerated and saved (`tables`, `sim`, `gaps`, `recon`, `recon-all`, `atr`, `limits`, `stops`, `openwin` as `.txt`, plus `per-trade.csv` with all 128 trades) so that the per-trade and per-symbol detail the report summarizes is on disk.

Verification of the read-only constraints: `git status` shows only `specs/step0-buy-sizing-investigation/` as new; no tracked file changed; all Supabase calls were `select`, all Alpaca calls were `GET`; a scan of the saved outputs for `secret`, `api key` and JWT prefixes found nothing.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Every factor in order with file:line | ✅ | 12-row factor table, lines `:1039-2478` |
| FR-02 | Base risk % and stop distance | ✅ | row 1 |
| FR-03 | Regime, Kalman halving, confidence floor | ✅ | rows 2, 3, 6 |
| FR-04 | z override, EMA_RECLAIM, 10% cap, buying power, rounding | ✅ | rows 4, 5, 7, 8, 12 |
| FR-05 | 3DAY/EMA_RECLAIM sized like MR? | ✅ | 3DAY = MR path; only EMA_RECLAIM ×0.75 |
| FR-06 | Effective env values with source | ⚠️ | Workflow values are masked secrets and `gh` is not installed; inferred from 24/24 exact reconstructions and stated as such |
| FR-07 | Exact code path for 250, 159, 1265, 173, 272 | ✅ | table with every step |
| FR-08 | Ranking path differs? | ✅ | no: queued `qty` reused (`:2483, :2681`) |
| FR-09 | ATR percentile definition, window, population | ✅ | `indicators.ts:291-295, 319-327` |
| FR-10 | Where sizing uses it | ✅ | only via regime > 0.80 → ×0.25 |
| FR-11 | Why CRWV 0.12 vs 9.8% | ✅ | reproduced 0.11; dollar ATR vs a year when price was twice as high; 0.89 by ATR% |
| FR-12 | Percentile or ATR% for sizing | ✅ | ATR% in sizing only; regime detection untouched |
| FR-13 | Limits with value, file:line, compared quantity | ✅ | portfolio-limit table |
| FR-14 | `SECTOR_MAP` and `OTHER` | ✅ | |
| FR-15 | Can the total-risk gate bind? | ✅ | no (≈2.5% maximum vs 10%) |
| FR-16 | Explain SOFI/FCX/UUUU/CRWV and MP twice | ✅ | short-lived positions, concurrency 2–4, independent sizing at the cap |
| FR-17 | Limit that should have constrained them | ✅ | none exists for size versus volatility |
| FR-18 | Reconstruct the 13 trades | ✅ | MP ×2, SOFI, FCX, UUUU, CRWV ×2, INTC ×2, NVDA, TSLA, EWZ, NKE |
| FR-19 | Stored indicators, agent log row, equity | ✅ | |
| FR-20 | Formula vs requested vs filled | ✅ | |
| FR-21 | Flag differences with cause | ✅ | UUUU, CRWV ×2, NVDA; CRWV 10-20 retry stop is flagged unknown |
| FR-22 | Partial fills / retry effect | ✅ | never upward; two cases −21% and −50% |
| FR-23 | Initial stop details | ✅ | `:2509-2511`, `alpaca.ts:255-269` |
| FR-24 | Trailing and Capa B | ⚠️ | Capa B has file:line; the non-MR stop-limit trailing (0.5% buffer) is stated without a line number |
| FR-25 | INTC order history | ✅ | |
| FR-26 | UUUU order history | ✅ | |
| FR-27 | Previous close → open for each | ✅ | INTC −4.60%; UUUU 8.16 → 8.00 (−1.96%) from Alpaca daily bars (the first attempt through `daily_bars` lacked 10-20 and was corrected) |
| FR-28 | Classify each loss | ✅ | both stops filled at a gapped open |
| FR-29 | Stops on open positions | ✅ | MP, TSLA, IREN |
| FR-30 | Position % for every closed trade | ✅ | `per-trade.csv` (128 rows) |
| FR-31 | Equity source per trade | ✅ | `equitySource` column; one trade uses the median |
| FR-32 | Six groupings with the requested buckets | ✅ | |
| FR-33 | n, avg pos, WR, avg/worst pnl, $ pnl | ✅ | |
| FR-34 | Size-vs-pnl correlation per setup | ✅ | |
| FR-35 | Share of $ pnl from > 7% positions | ✅ | 40%, with the FCX concentration called out |
| FR-36 | Small-n statement | ✅ | stated in the header and per finding |
| FR-37 | Daily swing for each closed trade and the book | ⚠️ | per-trade swing is in `per-trade.csv`; the report shows setup averages and the top 6 |
| FR-38 | Share of the book's swing | ✅ | MP 49%, IREN 41%, TSLA 10% |
| FR-39 | Gap distribution for every symbol traded | ⚠️ | report shows pooled statistics and the worst names; the full per-symbol list is in `gaps.txt` |
| FR-40 | Worst loss vs −5% stop | ✅ | |
| FR-41 | How many lost more than the stop and by how much | ✅ | 23 of 128, avg extra −1.46 pp |
| FR-42 | Exits between 09:30 and 10:00 ET | ✅ | 36 exits, 15 losses |
| FR-43 | Five schemes replayed | ✅ | plus a stressed baseline (f) and a no-z-override scheme (g) |
| FR-44 | Per setup: total, max DD, worst loss, cap share | ⚠️ | report table shows ALL, MR and 3DAY; the other setups are in `sim.txt` |
| FR-45 | Replay assumptions stated | ✅ | including the interpretation of (d) and (e) |
| FR-46 | Caveats on n and overlap | ✅ | |
| FR-47 | Nothing written during simulation | ✅ | in-memory only |
| FR-48 | List opening-window losses | ✅ | 15 trades in `openwin.txt` |
| FR-49 | Price at 09:35, 09:45, 10:00, close | ✅ | |
| FR-50 | Average and worst difference | ✅ | |
| FR-51 | Cases where waiting was worse | ✅ | 5/15, 3/15, 7/15, 4/15 |
| FR-52 | Designs needing a Protected Zone file | ✅ | |
| FR-53 | 2–3 CHANGE options with trade-offs | ✅ | three options |
| FR-54 | Protected Zone files per option | ✅ | |
| FR-55 | Percentile → ATR% in sizing? | ✅ | yes, in sizing only |
| FR-56 | Tests, rollback, effect on open positions | ✅ | generic for the three options |
| FR-57 | One recommendation with reasoning | ✅ | Option 1 plus a named cap constant; Option 3 later |
| FR-58 | Hypotheses confirmed/refuted/inconclusive | ✅ | #1 confirmed on size, supported-but-inconclusive on results; #2 confirmed |
| FR-59 | Label findings confirmed/plausible/unknown | ⚠️ | most claims carry [C]/[P]/[U]; a few narrative sentences are unlabelled (LOW-1) |
| FR-60 | Brief figures that do not reproduce | ✅ | MR z ≤ −2, z > −1.5, ADX 30+ listed with the matching ones |
| FR-61 | "Not checked" with reasons | ✅ | secrets, IOC retry lines, 2026-04-21 concurrency, Actions logs |

NFR-01 ⚠️ (one missing line number, FR-24) · NFR-02 ✅ (re-runnable; scripts depend on `step0-trades.json` created by the first script — LOW-3) · NFR-03 ✅ · NFR-04 ✅ · NFR-05 ✅.

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | read only |
| src/lib/risk-manager.ts | UNTOUCHED | read only |
| src/lib/indicators.ts | UNTOUCHED | read only; one script *imports* `calculateAllIndicators`/`calculateATR` to recompute percentiles (no write) |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No tracked file changed; `.env.local` was read (never printed or modified).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A — no source change |
| Supabase patterns | ✅ | SELECT only, paginated with `range`; one-off `.tmp` scripts, not application code; no table or policy changes |
| TypeScript quality | ✅ | Throwaway scripts; several use `any` for query rows, which the project rule forbids for application code only |
| Security | ✅ | No key in any output or in the report; Alpaca calls are GET |

## Task Checklist

- Implementation tasks T-01…T-19: 19/19 completed
- Post-Implementation: this review and the Protected Zone confirmation, ticked by this report

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **The effective production env is inferred, not read.** `RISK_PCT`, `STOP_LOSS_PCT` and `MAX_POSITIONS` come from GitHub secrets that could not be read. The 24/24 exact reconstructions make 1% / 5% / 10% near-certain for the sizing, but `MAX_POSITIONS` is only confirmed indirectly (no moment above 5 concurrent positions except one unexplained episode). If the CHANGE depends on these values, read them from the repository settings first.
2. **The `MAX_POSITIONS` gate counts positions fetched at cycle start.** Reported as a code fact (`risk-manager.ts:93-99` vs `claude-agent.ts:1753`), but the one data point that might show its effect (2026-04-21 19:27, three buys taking concurrency from 5 to 8) was not investigated, so whether the stale count caused it is unknown.

### LOW (optional)
1. Narrative statements such as "positions are short-lived (SOFI, BAC, MP, INTC closed within 1–3 days)" are slightly loose: MP and INTC closed in 1–2 days, SOFI within 2, BAC after about 4–5.
2. The explanation under the simulation table for why flat 5% sizing loses more than the current sizing in the stressed case is imprecise: the likelier cause is that flat sizing enlarges many small positions that lose 8% in the stress.
3. The scripts depend on `.tmp/step0-trades.json`, which `step0-trades.ts` creates; run that one first. Scheme (g) also changes a few legacy rows that carry confidence and z, which is irrelevant to current code.
4. `holding_period_hours` is rounded to 24-hour steps in the data, so "held overnight" uses calendar dates.

---

## Decision

**APPROVED WITH WARNINGS** — no CRITICAL or HIGH findings. The investigation answers all eleven tasks with file:line references and reproducible data, keeps every finding labelled by confidence, and leaves the repository untouched. The two MEDIUM items are verification gaps to close before relying on the draft CHANGE, not defects in the work.
