# Design — Add style-src and font-src to the CSP Header

## Architecture Decision

Single-file change to `next.config.js`'s `headers()` function, which emits a `Content-Security-Policy` response header for every route (`source: '/(.*)'`). The header is a plain string built inline per-environment (`process.env.NODE_ENV === 'development'` ternary) — no separate CSP-building module, no middleware involvement. This fix extends that same inline string in both branches, adding two directives to close a confirmed gap: `style-src` and `font-src` are currently absent, so both silently fall back to `default-src 'self'`, blocking Google Fonts (the app's only external font/style dependency) and every inline `style` attribute already used throughout the dashboard.

## Data Flow

1. Every HTTP response gets the `Content-Security-Policy` header from `next.config.js`'s `headers()` function.
2. Browser parses the header; for any resource load or inline style, it checks the matching directive (`style-src` for stylesheets/inline styles, `font-src` for font file fetches) — falling back to `default-src` if the specific directive is absent.
3. Currently: `globals.css`'s `@import url('https://fonts.googleapis.com/...')` is blocked by the `default-src 'self'` fallback (no `style-src`), and the font files that stylesheet would reference from `fonts.gstatic.com` are blocked by the same fallback (no `font-src`). React's `style={{}}` inline attributes are also technically covered by `default-src 'self'` without `'unsafe-inline'`, though `style-src`'s absence means these are also blocked by the same fallback path.
4. After the fix: `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` explicitly permits the Google Fonts CSS fetch and all inline `style` attributes/Tailwind's compiled output; `font-src 'self' https://fonts.gstatic.com` explicitly permits the actual font file fetches. `default-src`, `script-src`, `connect-src` are untouched.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Migrate to `next/font` (self-host Google Fonts, no external fetch at all) | Removes the external dependency entirely, arguably tighter CSP long-term | Explicitly out of scope — touches `globals.css`/`layout.tsx`, a larger change than "fix the CSP gap"; the diagnostic's own DO NOT CHANGE list forbids touching those files | Rejected for this fix — narrowest fix for the confirmed gap, not a font-loading redesign |
| Use a wildcard like `style-src 'self' 'unsafe-inline' https://*.googleapis.com` | Slightly more future-proof if another `*.googleapis.com` service is added later | Broader than what's confirmed in use today (NFR-01 explicitly requires scoping to exactly what's used) — speculative permissiveness | Rejected — name the exact host, `fonts.googleapis.com` |
| Add `'unsafe-eval'` to `style-src` "just in case" | None identified | Not needed by anything in this codebase (confirmed: no CSS-in-JS runtime, no dynamic style evaluation) | Rejected — explicitly excluded (NFR-02) |
| Extract the CSP string into a shared constant/builder to reduce dev/prod duplication | Marginally more DRY | Out of scope — the CHANGE spec gives the exact two literal strings to use, refactoring the string-construction approach is a separate, unrequested change | Rejected — edit both literal strings in place, matching existing formatting exactly |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `next.config.js` | MODIFY | Insert `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;` and `font-src 'self' https://fonts.gstatic.com;` into both the dev (line 18) and prod (line 19) CSP strings, positioned after `script-src` and before `connect-src`, matching the existing semicolon-separated formatting exactly |

No other file changes.

## Protected Zone Impact

None — `next.config.js` is not in `CLAUDE.md`'s File Permission Matrix's Protected Zone list. No Amaury confirmation gate is required for this change, unlike the `claude-agent.ts` fixes earlier in this session.

## Database Changes

None.

## Open Questions

None. This is a fully-diagnosed, narrowly-scoped, single-file header change — the exact two hosts in use, the exact reason `'unsafe-inline'` is needed, and the exact current CSP string were all independently confirmed via live source reads immediately before this spec was written.
