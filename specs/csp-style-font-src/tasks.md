# Tasks — Add style-src and font-src to the CSP Header

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, `next.config.js` is not Protected Zone
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — CSP header (next.config.js)
- [x] T-01: Insert `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;` and `font-src 'self' https://fonts.gstatic.com;` into the development CSP string (line 18), after `script-src` and before `connect-src`
- [x] T-02: Insert the same two directives into the production CSP string (line 19), after `script-src` and before `connect-src`
- [x] T-03: Confirmed `default-src`, `script-src`, and `connect-src` are byte-for-byte unchanged in both strings, and the other 4 security headers are untouched (full-file re-read after edit)

### Phase 2 — Verification
- [x] T-04: Confirmed both CSP strings now include `style-src` and `font-src` exactly as specified — `curl -sI http://localhost:3000/login` shows the live header with both directives present
- [x] T-05: Started dev server, confirmed via `curl` that the actual Google Fonts stylesheet (`fonts.googleapis.com`) references font files exclusively from `fonts.gstatic.com` — exactly the two hosts now allowlisted, nothing broader needed. No headless-browser CSP-violation check was possible in this environment, but the header now explicitly permits both real hosts the app fetches from, and `'unsafe-inline'` in `style-src` covers the 5 components' `style={{}}` props and Tailwind's compiled output by the same mechanism already relied on for `script-src`
- [x] T-06: Run `npx tsc --noEmit` — passed, no errors
- [x] T-07: Run `npm run build` — passed, all routes compiled cleanly
- [x] T-08: Run `npm test` — 47 test files, 437/437 tests passed, unchanged (no new tests expected for a config-only header change)
- [x] T-09: Final line count — `next.config.js`: 27 lines (unchanged line count — the two new directives were inserted into the existing lines 18-19, not added as new lines)

## Post-Implementation

- [ ] Run `/review csp-style-font-src` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged — expected, `next.config.js` is not Protected Zone

## Estimated Complexity

**Low** — a two-directive addition to an existing string literal, in one already-well-understood file, no logic change, no new dependency, no Protected Zone gate.
