# Requirements — Login Page UX Polish

## Context

Current implementation (`src/app/login/page.tsx`) uses raw inline `style={{...}}` objects with
hardcoded hex colors and `Arial` font, instead of the Tailwind + CSS-variable design system
already established in `src/app/globals.css` (`--color-ink`, `--color-surface`, `--color-green`,
`Inter` font) and used throughout `src/components/dashboard/*`. It also lacks a semantic
`<form>`, accessible labels, autocomplete hints, focus states, a password-visibility toggle,
and responsive sizing — the input/button widths are hardcoded pixel values (300px / 324px).

## Functional Requirements

FR-01: The system shall render the login page using the same design tokens (color-ink,
color-surface, color-green, Inter font) used elsewhere in the dashboard.
FR-02: The system shall wrap the email and password inputs in a semantic `<form>` element that
submits when Enter is pressed in either field.
FR-03: The system shall associate an accessible label with the email input.
FR-04: The system shall associate an accessible label with the password input.
FR-05: The system shall set `autocomplete="email"` on the email input.
FR-06: The system shall set `autocomplete="current-password"` on the password input.
FR-07: The system shall disable the submit button while a login request is in flight.
FR-08: The system shall display a visible focus indicator when an input or the submit button
receives keyboard focus.
FR-09: The system shall render the login card without horizontal overflow on viewports as
narrow as 320px.
FR-10: The system shall block form submission when the email field or the password field is
empty.
FR-11: Where the password field is present, the system shall provide a control to toggle the
password's visibility between masked and plain text.
FR-12: The system shall display the error message returned by the login action using the app's
error color token (`--color-red`).
FR-13: The system shall use consistent widths across the email input, password input, and
submit button.

## Non-Functional Requirements

NFR-01: The redesigned login page shall not add any new runtime dependency beyond what is
already declared in `package.json`.
NFR-02: The login page's text shall meet WCAG 2.1 AA color contrast against its background.
NFR-03: The login page shall remain a single client component (`'use client'`), consistent with
its current structure.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`,
`risk-manager.ts`, `indicators.ts`) — not applicable, this feature does not touch those files.
C-02: This feature must not change the authentication logic in `src/app/login/actions.ts`
(the `signInWithPassword` call, redirect behavior, or error message strings).
C-03: This feature must preserve the existing route (`/login`) and existing auth flow
(Supabase SSR client, redirect to `/dashboard` on success).

## Out of Scope

- "Forgot password" / password-reset flow (no such capability exists in `actions.ts` today)
- Social/OAuth login providers
- "Remember me" option
- Changes to Supabase auth configuration or session handling
- Rate limiting or brute-force protection on the login form (backend concern)
- i18n / multi-language support
- Light-mode theme (rest of the app is dark-only; login stays dark-only)
