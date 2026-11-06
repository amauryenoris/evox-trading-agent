# Tasks — docs-3: Align documentation and agent instructions with the code (DOCUMENTATION ONLY)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec (answers to Q-1 to Q-5)
- [x] Protected Zone changes confirmed (not applicable — read only)
- [x] Database migrations drafted (not applicable)

## Implementation Checklist

### Phase 1 — Re-read the sources
- [x] T-01: Re-read `claude-agent.ts` (`:83-85`, `:247-380`, `:1640-1900`) and record file:line per fact in the design table
- [x] T-02: Re-read `protective-stop.ts:12-30,86-125`, `config.ts:1-6`, `indicators.ts:143-200`, `sma5-exit.ts`, `prompt-builder.ts:134,188`, `package.json:27`
- [x] T-03: Check whether MR entry enforces RSI < 45, %B < 0.2 or a required RANGING regime anywhere (Q-1)
- [x] T-04: Record the current line endings of every candidate file (all are 100% CRLF)

### Phase 2 — CLAUDE.md and SDD.md
- [x] T-05: CLAUDE.md Stack row: Next.js version from package.json
- [x] T-06: CLAUDE.md signals section: retitle and rewrite for the five setups (entry, exit, target, priority)
- [x] T-07: CLAUDE.md Universal exits: rewrite per setup, including MR profit floor and ATR trailing table
- [x] T-08: SDD.md `:59`, section 4 table and sentence, section 5 table and text
- [x] T-09: Sweep SDD.md for any other statement about the five setups; fix or list

### Phase 3 — Agent, skill, README and AGENTS files
- [x] T-10: `debug-agent.md:108,115`, `trading-reviewer.md:42,72`, `alpaca-patterns.md:59`: spread 50 -> 100 only
- [x] T-11: Sweep those three files for other numbers; fix only proven wrong, list each
- [x] T-12: README.md `MAX_POSITION_SIZE` example, comment and table row
- [x] T-13: README.md sweep (RISK_PCT, schedule times, setups table); fix only proven wrong
- [x] T-14: AGENTS.md:4 version; `dashboard-builder.md:9,11` per Q-2

### Phase 4 — Verification and report
- [x] T-15: `git diff --name-only` lists only allowed doc files
- [x] T-16: Per file, confirm the CR count equals the line count (CRLF preserved) and no mixed endings
- [x] T-17: `grep -rn "MAX_SPREAD_BPS = 50\|50bps"` over repo docs returns nothing (the news-intelligence example `Fed cuts rates 50bps` and `specs/**` history are not docs to fix; list them as excluded)
- [x] T-18: Write `.tmp/docs-3-report.md`: each change old -> new with source file:line, then the remaining disagreements list (including `setups.ts:17`, `specs/**` mentions, legacy `TREND`)
- [x] T-19: Do not commit or push

## Post-Implementation

- [x] Run /review of docs-3 to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (`git diff --name-only` shows none of them)

## Estimated Complexity

Low-Medium — about 10 small text edits across 8 files, but the signals rewrite needs careful reading of ~300 lines of `claude-agent.ts` and one open question (MR entry criteria) that decides what the docs say.
