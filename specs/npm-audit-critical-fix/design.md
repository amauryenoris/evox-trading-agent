# Design — Clear the Critical npm audit Finding Blocking CI

## Architecture Decision

This is a pure dependency-maintenance change with no application-code layer at all — it lives entirely in `package.json` and `package-lock.json`, applied via npm's own `audit fix` mechanism rather than hand-editing version numbers. No new file, no code change, no workflow change. The verification step re-runs the exact command the blocked workflows already run (`npm audit --audit-level=critical`) locally, plus the project's standard `tsc`/test/build checks, so the fix is validated the same way CI will validate it.

## Data Flow

```
1. Record current versions (npm ls) — FR-01
       │
       ▼
2. npm audit fix --dry-run — FR-02
   Live result (captured in requirements.md Background):
     brace-expansion 5.0.9  => 5.0.12   (patch)
     brace-expansion 1.1.18 => 1.1.21   (patch)
     next                   => 16.3.8   (patch, from 16.3.4)
     @next/swc-win32-x64-msvc, @next/env → follow next's version (internal, not independently managed)
       │
       ▼
3. Gate check (FR-03/FR-04):
   - Any major bump?           NO  (all patch-level)
   - @anthropic-ai/sdk in list? NO  (its only fix is the forbidden --force → 0.130.0)
       │                              → gate passes, proceed
       ▼
4. npm audit fix   (NO --force)   — FR-03
       │
       ▼
5. Verification (FR-07 through FR-13):
   - npm audit --audit-level=critical  → expect exit 0
   - npm audit (no filter)             → report remaining findings (4 moderate + 1 low expected to remain)
   - npx tsc --noEmit                  → expect clean
   - npm test                          → expect no regressions
   - npm run build                     → expect success
   - before/after versions of all 5 named packages
   - unauthenticated /api/* → 401, /dashboard → redirect (if locally verifiable)
```

## Why `npm audit fix` (dry-run first) instead of manually pinning `next`'s version

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `npm audit fix` after dry-run confirms safety | Standard, minimal-diff tool for exactly this situation; dry-run gives full visibility before any write; matches SCOPE exactly | None identified | **Chosen** |
| Manually bump `next` to `16.3.8` in `package.json` and run `npm install` | Same end state | Bypasses npm's own audit-fix bookkeeping for no benefit; more manual, more room for a typo in the version string | Rejected |
| `npm audit fix --force` | Would also silently attempt the `@anthropic-ai/sdk` breaking bump | Explicitly forbidden — this is the exact trap the prior incident hit | Rejected |
| Fix `next` and leave `brace-expansion` alone (only touch the literal critical finding) | Narrower diff | `brace-expansion`'s fix is bundled into the same `npm audit fix` invocation by npm itself — there's no separate "fix only next" command; artificially excluding it would require manual `package-lock.json` surgery, which is riskier than accepting npm's own bundled, already-verified-safe (non-major, non-SDK) resolution | Rejected — npm audit fix's atomic behavior is accepted as-is |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `package.json` | MODIFY | `next`'s resolved version moves within its existing `^16.3.4` range (to `16.3.8`) — the version *specifier* itself may or may not change depending on how it was pinned; no other declared dependency range changes, since `brace-expansion` is transitive (not listed in `package.json` at all) |
| `package-lock.json` | MODIFY | Resolved versions updated for `next`, `@next/swc-win32-x64-msvc`, `@next/env`, and both `brace-expansion` instances |

No other file. `src/`, `scripts/`, every `.github/workflows/*.yml`, and all Protected Zone files are expected to show zero diff.

## Protected Zone Impact

None. This change touches only `package.json`/`package-lock.json`, both on the unrestricted `src/lib/`-external surface — neither is `config.ts`, `claude-agent.ts`, `risk-manager.ts`, or `indicators.ts`, and neither is on the broader "confirm before touching" list either.

## Database Changes

None.

## Open Questions

None. The one thing that genuinely needed live verification before this spec could be written safely — whether the dry-run's actual change set stays within the ALLOWED boundary (non-major, no SDK) — was checked this session and confirmed within bounds (see requirements.md Background). C-06 covers the case where that live snapshot goes stale before `/implement` runs: re-check the dry-run fresh at that time rather than trusting this document's captured output.
