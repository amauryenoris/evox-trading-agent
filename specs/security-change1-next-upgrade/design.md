# Design — Security CHANGE 1: upgrade next to ^16.4.4 and fix remaining npm advisories

## Architecture Decision

This is a dependency-only change. It lives entirely in `package.json` and `package-lock.json`; no runtime layer, source file or workflow changes. `next` is the only direct dependency that moves on purpose (16.3.8 -> 16.4.4, inside the 16.x line). It pulls `sharp ^0.35.5` with it. The other advisories (zod, source-map-js, vite) are transitive and are meant to be fixed by a non-forced `npm audit fix`, which only edits the lockfile. The trading engine (`npm run cycle`, `exit-only`) runs on `tsx` and does not load Next, so the live agent is not in the blast radius; the dashboard, login Server Action and `middleware.ts` are.

## Data Flow

1. Read the Next.js 16.4 release notes. Gate: any change needing code edits stops the work (FR-03).
2. Record the baseline: `npm audit` and `npm audit --omit=dev` counts, and a copy of the current lockfile versions (in `.tmp/`) for the diff.
3. Edit `package.json` (`next` -> `^16.4.4`), run `npm install next@^16.4.4` to refresh the lockfile.
4. Run `npm audit fix` (no `--force`). Anything that would need `--force` or a major bump stays unapplied and is listed.
5. Diff old vs new lockfile versions; flag majors.
6. Verify: `npm ci`, `tsc --noEmit`, `vitest run`, `npm run build`, ESLint.
7. Re-run both audits and compare to baseline.
8. Write `.tmp/security-change1-report.md`. Leave the tree uncommitted.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Bump `next` to `^16.4.4` then `npm audit fix` (requested) | Smallest change; covers all 5 packages; lockfile-only for transitives | Minor Next upgrade; `audit fix` can touch unrelated packages | Chosen |
| Pin `next` to exactly 16.4.1 (smallest jump past the fix) | Fewer new code paths | Misses later patches; the request says 16.4.4 | Rejected |
| `overrides` for zod, source-map-js, vite | Precise control | Edits `package.json` beyond the request; hides drift | Rejected unless `audit fix` cannot fix one |
| Bump `@anthropic-ai/sdk` to fix zod | Removes the zod pin at the source | 0.80 -> 1.x is a major with API changes | Rejected (major, out of scope) |
| `npm audit fix --force` | One command | Explicitly forbidden | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `package.json` | MODIFY | `next` range `^16.3.4` -> `^16.4.4`; nothing else expected |
| `package-lock.json` | MODIFY | next, sharp, zod, source-map-js, vite and whatever else `audit fix` resolves |
| `.tmp/security-change1-report.md` | CREATE | Deliverable (gitignored) |

No other file is edited. Packages with a vulnerable range that `audit fix` leaves in place are reported, not forced.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. No Protected Zone file imports zod, sharp, vite or source-map-js (grep in step 0); `next` is imported only by `src/app/**` and `middleware.ts`.

## Database Changes

None.

## Open Questions

- **O-1** Release-notes source: use the official nextjs.org / GitHub release pages. If the sandbox cannot reach them, FR-04 says stop. Default: stop and report rather than proceed blind.
- **O-2** `npm audit fix` may also bump moderate-severity packages unrelated to the five named. Default: accept minor/patch changes that `audit fix` makes without `--force`, list them all, and stop only on an unrequested major (FR-13).
- **O-3** `eslint-config-next` stays at 16.2.1 while `next` becomes 16.4.4. Default: leave it (out of scope); report any lint error it causes instead of fixing.
- **O-4** `npm ci` deletes and reinstalls `node_modules` inside a OneDrive folder, which can be slow or hit file locks on Windows. Default: run it as the verification step; if it fails on a lock, report it and retry once before escalating.
- **O-5** `npm run build` needs env vars the project may expect at build time. Default: use whatever `.env.local` already provides without printing values; if the build fails for missing env, report it as an environment limitation, not a regression.
