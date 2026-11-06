# Design — docs-3: Align documentation and agent instructions with the code (DOCUMENTATION ONLY)

## Architecture Decision

Pure documentation edit. The source files are the single truth: each number is read from `claude-agent.ts`, `protective-stop.ts`, `config.ts`, `indicators.ts`, `sma5-exit.ts`, `prompt-builder.ts` and `package.json`, then written into the allowed doc files with the smallest possible diff. The edits use targeted `Edit` replacements (not whole-file rewrites) so the CRLF endings of every file stay intact. The only new file is `.tmp/docs-3-report.md`.

## Data Flow

1. Re-read the sources and record file:line per fact (facts table below).
2. Edit CLAUDE.md: Stack row, signals section, Universal exits list.
3. Edit SDD.md: flow diagram line 59, section 4 table and sentence, section 5.
4. Edit the three `.claude` files (spread figure).
5. Edit README.md (MAX_POSITION_SIZE, plus anything proven wrong).
6. Edit AGENTS.md:4.
7. Sweep the allowed doc files for remaining disagreements; record them without editing.
8. Verify and write `.tmp/docs-3-report.md`.

### Facts found during the spec research (to be re-read at implementation)

| Fact | Code truth | Source |
|------|-----------|--------|
| Setups | 5 live: MR, TREND_PULLBACK, TREND_PULLBACK_3DAY, TREND_ZLE05, EMA_RECLAIM (legacy `TREND` only in old rows) | `claude-agent.ts:1878-1897` |
| Priority | 3DAY > MR > PULLBACK > ZLE05 > EMA_RECLAIM | `claude-agent.ts:1887-1897` |
| MR entry | z <= effective threshold (base -1.3) + ADX gate (RANGING and ADX < 18 blocks); **no RSI/%B/regime-required check found** | `:1684-1703`, `:83` |
| MR exit | Kalman EXIT_LONG: z >= -0.8 | `config.ts:5`, `indicators.ts:195` |
| PULLBACK entry | trend structure, z <= 0, momentum, EMA50 slope, ADX >= 20 or null, MACD hist > -2.0 | `:1744-1757`, `:84` |
| 3DAY entry | prevClose > SMA200; 3 falling closes; price not above SMA5; no z/ADX/MACD | `:1713-1742` |
| ZLE05 entry | trend structure, 0 < z <= 1.25, slope, ADX >= 18 or (>= 15 and MACD > 0.25), MACD > 0 | `:1791-1801`, `:85` |
| EMA_RECLAIM entry | price > EMA50 by > 0.2%, prevClose <= ema50Prev, z < 0, momentum | `:1822-1829` |
| Exits | PULLBACK and RECLAIM: price < EMA50; ZLE05: z >= 1.25; 3DAY: price > SMA5; MR: z >= -0.8 | `:265-297` |
| Targets | ZLE05 5%; others 10% | `protective-stop.ts:27-30` |
| Time stop | 20 trading days, all setups | `:260-262` |
| MR floor | activation +5%, floor +3%, ratchet 3pp; replaces ATR trailing for MR | `protective-stop.ts:13`, `:93-98`, `claude-agent.ts:314-343` |
| ATR trailing | activation 6/6/3/4/5% (PULLBACK, 3DAY, ZLE05, RECLAIM, default); mult 1.5/1.5/1.0/1.0/1.2; floored at buy price | `protective-stop.ts:17-24`, `claude-agent.ts:303-310`, `:369` |
| Spread | `MAX_SPREAD_BPS = 100` | `config.ts:3` |
| Next.js | `^16.4.4` | `package.json:27` |
| MAX_POSITION_SIZE | fraction, default 0.10, prompt text only | `prompt-builder.ts:134,188` |

### Old claims in the docs that the code contradicts (candidate corrections)

| Location | Old claim | Code truth |
|----------|-----------|-----------|
| CLAUDE.md "4 Trading Signals" | 4 signals; MR needs RSI < 45, %B < 0.2 | 5 setups; MR has no RSI/%B check |
| CLAUDE.md MR exit | z >= -0.8 | correct |
| CLAUDE.md TREND_PULLBACK / ZLE05 / RECLAIM exit | "Price falls below EMA50" for ZLE05 | ZLE05 exits at z >= 1.25 |
| CLAUDE.md Universal exits | +10% target for all; trailing for all | ZLE05 target 5%; MR uses profit floor, not ATR trailing; 3DAY exit missing |
| CLAUDE.md "Trailing stop — activates at signal-specific profit threshold" | general | MR uses profit floor |
| SDD.md:109 | ZLE05 exit "price < EMA50" | z >= 1.25 |
| SDD.md:112 | universal exits for all | same as CLAUDE.md |
| SDD.md:59 | "any of 4 signal types" | 5 |
| SDD.md:122 | MR trailing 5% / 1.2x | MR uses profit floor (5% / +3% floor / 3pp ratchet) |
| SDD.md section 5 | no 3DAY row | 3DAY: 6% / 1.5x |
| README.md:72-73, 224 | `MAX_POSITION_SIZE=1000`, "$1,000" | fraction, prompt only |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Targeted `Edit` replacements per statement | Minimal diff, CRLF safe, easy to review | Several edits | Chosen |
| Rewrite whole sections with `Write` | Simple to author | CRLF risk, bigger diff, wording drift | Rejected |
| Also fix `setups.ts:17` so code matches the docs | One truth | Code change, out of authorization | Rejected (report only) |
| Describe MR as "RSI < 45, %B < 0.2" as before | No behavior question | Contradicts code | Rejected unless implementer finds the check |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| CLAUDE.md | MODIFY | Stack row version; signals section (5 setups, entries, exits, MR floor); Universal exits list |
| SDD.md | MODIFY | Line 59 count; section 4 table and sentence; section 5 table and text |
| AGENTS.md | MODIFY | Line 4 version |
| README.md | MODIFY | MAX_POSITION_SIZE lines 72-73, 224; other proven-wrong numbers |
| .claude/agents/debug-agent.md | MODIFY | Lines 108, 115 spread |
| .claude/agents/trading-reviewer.md | MODIFY | Lines 42, 72 spread |
| .claude/skills/alpaca-patterns.md | MODIFY | Line 59 spread |
| .tmp/docs-3-report.md | CREATE | Change log and remaining disagreements |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `config.ts`, `claude-agent.ts` and `indicators.ts` are only read. The edited `CLAUDE.md` is the file that defines the Protected Zone, but the Protected Zone block itself (`config.ts` values) is not changed.

## Database Changes

None.

## Open Questions

- **Q-1 (MR entry):** `setups.ts:17` and the old docs say MR needs a ranging regime, RSI < 45 and %B < 0.2, but `claude-agent.ts:1684-1703` only checks z-score plus the ADX gate (regime only matters inside the ADX gate; `:687` uses %B elsewhere). Default: document what the code does and list `setups.ts:17` as a remaining disagreement. Confirm.
- **Q-2 (dashboard-builder.md):** `.claude/agents/dashboard-builder.md:9,11` also say Next.js 16.2.1. The brief names only AGENTS.md and the CLAUDE.md Stack row. Default: update it too, since `.claude/agents/*.md` is authorized and it is the same wrong number; list it in the report. Confirm, or I only list it.
- **Q-3 (legacy `TREND`):** Legacy `TREND` rows still exist in the type unions and trailing tables. Default: mention it as one legacy line (same exits as TREND_PULLBACK, `claude-agent.ts:272`) inside the CLAUDE.md signals section, not as a sixth setup. Confirm.
- **Q-4 (README times and RISK_PCT):** README says `RISK_PCT=0.02` (default in code is 0.01, `claude-agent.ts:2205`) and exit-check times 9:30 AM and 3:30 PM ET (workflows run 9:30 and 3:55 PM ET). Default: verify against the workflows and `.env` handling; correct only what is proven wrong. Note that an example value in `.env.local` is not a default; the table "Default" column is the proof target. Confirm.
- **Q-5 (CLAUDE.md length):** Five setups with exits and floor will lengthen the section. Default: one table (entry, exit, target, stop type) plus a short Universal exits list.
