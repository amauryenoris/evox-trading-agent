# Review Report — Add style-src and font-src to the CSP Header

**Date**: 2026-09-21
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `style-src` in dev CSP allows `'self'`, `'unsafe-inline'`, `fonts.googleapis.com` | ✅ SATISFIED | `next.config.js:18` — `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;` present verbatim |
| FR-02 | `style-src` in prod CSP allows the same three | ✅ SATISFIED | `next.config.js:19` — identical directive present |
| FR-03 | `font-src` in dev CSP allows `'self'`, `fonts.gstatic.com` | ✅ SATISFIED | `next.config.js:18` — `font-src 'self' https://fonts.gstatic.com;` present verbatim |
| FR-04 | `font-src` in prod CSP allows the same two | ✅ SATISFIED | `next.config.js:19` — identical directive present |
| FR-05 | `default-src`, `script-src`, `connect-src` byte-for-byte unchanged | ✅ SATISFIED | `git diff` shows only the two new directives inserted; a directive-order parse confirms all 5 directives (`default-src, script-src, style-src, font-src, connect-src`) present with no duplicates in both branches |
| FR-06 | Google Fonts stylesheet loads without a `style-src` violation | ✅ SATISFIED | `fonts.googleapis.com` is now explicitly allowlisted; live-confirmed during implementation that this is the exact host `globals.css:1`'s `@import` fetches from |
| FR-07 | Google Fonts `.woff2` files load without a `font-src` violation | ✅ SATISFIED | `fonts.gstatic.com` is now explicitly allowlisted; independently re-confirmed via a direct fetch of the live Google Fonts stylesheet during implementation — every font URL it references resolves to `fonts.gstatic.com`, exactly the allowlisted host |
| FR-08 | Inline `style="..."` attributes (5 named components) render without violation | ✅ SATISFIED | `'unsafe-inline'` is present in the new `style-src` directive, covering React `style={{}}` output the same way it already covers `script-src`'s inline scripts |
| NFR-01 | Only the two confirmed hosts named, no wildcard | ✅ SATISFIED | Exactly `https://fonts.googleapis.com` and `https://fonts.gstatic.com`, no `*` anywhere in either new directive |
| NFR-02 | No `'unsafe-eval'` added to `style-src` | ✅ SATISFIED | Confirmed absent from both `style-src` directives (only present in `script-src`'s dev-only branch, pre-existing and untouched) |
| C-01 | Not Protected Zone, no authorization gate needed | ✅ SATISFIED | Correctly proceeded without an `AskUserQuestion` gate — `next.config.js` is not in `CLAUDE.md`'s Protected Zone list |
| C-02 | Other 4 security headers unmodified | ✅ SATISFIED | `git diff` shows zero changes to `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy` |
| C-03 | No changes to `globals.css`, `layout.tsx`, or any component | ✅ SATISFIED | `git status` shows only `next.config.js` and the new `specs/` directory modified/added |
| C-04 | No CSP host beyond the two named | ✅ SATISFIED | Same as NFR-01 |

**13/13 requirements and constraints satisfied. 0 violations, 0 partials.**

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |
| .env / .env.local | UNTOUCHED | — |
| vercel.json | UNTOUCHED | — |
| DB migrations | NONE | No migration — pure header-string change |

`next.config.js` itself is not on this list (confirmed against `CLAUDE.md`'s File Permission Matrix) — correctly treated as not requiring a confirmation gate, consistent with the spec's own C-01.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | No Claude API interaction anywhere near this change |
| Supabase patterns | ➖ N/A | No Supabase query involved |
| TypeScript quality | ✅ SATISFIED | Plain JS config object (file has no TS types to violate); no `any`; no mutation (string literals replaced, not mutated in place); file is 27 lines (well under 800); no new function introduced to check against the 50-line guideline |
| Security | ✅ SATISFIED (with one informational note) | No hardcoded secrets introduced; this change is itself a security-header fix, net-tightening the policy from "silently falls back to default-src" to "explicitly scoped to two named, verified hosts." **Note**: `'unsafe-inline'` in the new `style-src` mirrors a risk tradeoff already accepted in this same file's pre-existing `script-src` (which has carried `'unsafe-inline'` since before this change) — not a new precedent, just extended to cover styles the same way scripts were already covered |

---

## Task Checklist

- Completed: 9/9 implementation tasks (T-01 through T-09)
- Pre-Implementation: 3/3 (spec approval, Protected Zone N/A, migrations N/A)
- Post-Implementation: 1/2 (`Run /review` is the pending item this report resolves; Protected Zone confirmation checked)

Independently re-verified, not just trusted from `tasks.md`:
- `npx tsc --noEmit` → clean, no output
- `npx vitest run` → 47 test files, **437/437 passed**, unchanged from pre-implementation (expected — no new testable logic in a static config string)
- `git diff -- next.config.js` → confirms the only change is the two directive insertions in both branches, nothing else in the file touched
- A directive-order parse of both CSP strings confirms exactly 5 directives each (`default-src, script-src, style-src, font-src, connect-src`), no duplicates, correct insertion position (after `script-src`, before `connect-src`) matching the spec exactly

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **No headless-browser confirmation of an actual zero-CSP-violation page load was possible in this environment** (correctly disclosed in `tasks.md`'s T-05, not silently skipped). Verification instead relied on: (a) confirming the served header now names exactly the two hosts the app's own font-loading code fetches from, independently re-derived by fetching the real Google Fonts stylesheet and checking every font URL it contains, and (b) reasoning from CSP's documented directive-fallback behavior. This is strong evidence but not the same as watching a live browser console. If Amaury wants to close this out fully, a 10-second manual check (open the dashboard in a real browser, check devtools console for CSP violation warnings) would remove the last bit of uncertainty — optional, not blocking, since the header content and target hosts are independently confirmed correct.

---

## Decision

**APPROVED** — No CRITICAL, HIGH, or MEDIUM findings. The fix is minimal, exactly scoped to the two hosts confirmed in use, preserves every other directive and header byte-for-byte, and is independently re-verified via `tsc`, tests, diff scope, and a structural parse of the resulting CSP string. Ready to commit.
