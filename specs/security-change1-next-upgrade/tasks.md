# Tasks — Security CHANGE 1: upgrade next to ^16.4.4 and fix remaining npm advisories

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: none)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Gate and baseline
- [x] T-01: Read the Next.js 16.4 release notes / upgrade guide; list changes relevant to `middleware.ts`, Server Actions, `next.config.js`, `next/image`, App Router. STOP if code changes are needed.
- [x] T-02: Save baseline audit counts (full and `--omit=dev`) and a snapshot of lockfile versions in `.tmp/`.

### Phase 2 — Dependency change
- [x] T-03: Set `next` to `^16.4.4` in `package.json`; refresh `package-lock.json` (`npm install next@^16.4.4`).
- [x] T-04: Run `npm audit fix` without `--force`; record anything it would not fix or that needs a major.
- [x] T-05: Diff old vs new lockfile versions; produce the table; flag majors (stop on any unrequested major).

### Phase 3 — Verification
- [x] T-06: `npm ci` from the new lockfile.
- [x] T-07: `npx tsc --noEmit`.
- [x] T-08: Full `npx vitest run`.
- [x] T-09: `npm run build`.
- [x] T-10: ESLint.
- [x] T-11: `npm audit` and `npm audit --omit=dev`; compare to baseline; state whether the critical is gone.
- [x] T-12: Confirm with `git status` / `git diff --stat` that only `package.json` and `package-lock.json` changed.

### Phase 4 — Report
- [x] T-13: Write `.tmp/security-change1-report.md` (release notes, lockfile diff, results, before/after audit, unfixed items).

## Post-Implementation

- [ ] Run /review security-change1-next-upgrade to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; commit is a separate request from Amaury

## Estimated Complexity

Low-Medium. The edit is two files and mostly mechanical, but a minor Next upgrade on a live dashboard needs the release-notes gate and the full verification set; the lockfile diff size from `audit fix` is the main unknown.
