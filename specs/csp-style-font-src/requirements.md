# Requirements — Add style-src and font-src to the CSP Header

## Functional Requirements

FR-01: The system shall include a `style-src` directive in the development CSP header allowing `'self'`, `'unsafe-inline'`, and `https://fonts.googleapis.com`.
FR-02: The system shall include a `style-src` directive in the production CSP header allowing `'self'`, `'unsafe-inline'`, and `https://fonts.googleapis.com`.
FR-03: The system shall include a `font-src` directive in the development CSP header allowing `'self'` and `https://fonts.gstatic.com`.
FR-04: The system shall include a `font-src` directive in the production CSP header allowing `'self'` and `https://fonts.gstatic.com`.
FR-05: Where the CSP header is emitted, the system shall preserve `default-src`, `script-src`, and `connect-src` byte-for-byte unchanged in both the development and production variants.
FR-06: The system shall load the Google Fonts stylesheet (`globals.css:1`'s `@import`) without a CSP `style-src` violation.
FR-07: The system shall load the Google Fonts `.woff2` files referenced by that stylesheet without a CSP `font-src` violation.
FR-08: The system shall render inline `style="..."` attributes (React `style={{}}` props already present in `DashboardTabs.tsx`, `ui.tsx`, `WeeklyReportsCard.tsx`, `AgentReasoningLog.tsx`, `NewsIntelligence.tsx`) without a CSP `style-src` violation.

## Non-Functional Requirements

NFR-01: The new `style-src` and `font-src` directives shall name only the two hosts confirmed actually in use (`fonts.googleapis.com`, `fonts.gstatic.com`) — no broader host or wildcard.
NFR-02: The new directives shall not include `'unsafe-eval'` in `style-src` in either environment.

## Constraints

C-01: `next.config.js` is not in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `.env`/`.env.local`, `vercel.json`, DB migrations) — no special authorization is required for this change.
C-02: The system shall not modify the four other security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`).
C-03: The system shall not modify `src/app/globals.css`, `src/app/layout.tsx`, or any component file.
C-04: The system shall not add any CSP host beyond `fonts.googleapis.com` and `fonts.gstatic.com`.

## Out of Scope

- Any change to how fonts are loaded (e.g. migrating to `next/font` for self-hosting) — this spec only widens the CSP to permit the existing, unchanged loading mechanism.
- Any change to `script-src` or `connect-src` — confirmed not in scope, both already correctly cover the app's actual usage.
- Any audit of other CSP directives not mentioned (e.g. `img-src`, `frame-ancestors`) — not part of the confirmed gap this spec addresses.
