# Tasks — Login Page UX Polish

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [x] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — UI Rebuild (src/app/login/page.tsx)
- [x] T-01: Rebuild markup using Tailwind classes and the CSS var tokens already defined in
      `globals.css` (`--color-ink` background, `--color-surface` card, `Inter` font — no new
      font/inline styles)
- [x] T-02: Wrap the email/password inputs in a `<form onSubmit>`; remove the ad-hoc
      `onKeyDown` Enter handler on the password field
- [x] T-03: Add `<label>` elements for email and password, wired via `htmlFor`/`id`
- [x] T-04: Add `autoComplete="email"` and `autoComplete="current-password"` attributes
- [x] T-05: Add a show/hide toggle control for the password field
- [x] T-06: Add visible focus-ring styling to inputs and the submit button, consistent with
      existing design tokens
- [x] T-07: Make the card layout responsive (e.g. `max-w-*` + horizontal padding) so it doesn't
      overflow at 320px viewport width
- [x] T-08: Add a disabled-state style for the inputs while `loading` is true, in addition to
      the existing button disabled state
- [x] T-09: Add a client-side required-field check that blocks submit when email or password is
      empty, without changing `actions.ts`
- [x] T-10: Normalize input/button widths so they're visually consistent (currently
      300px vs 324px)

### Phase 2 — Manual Verification (no existing test coverage for this page)
- [x] T-11: Keyboard-only pass — Tab through email → password → submit, Enter submits from
      either field
- [x] T-12: Resize to 320px–375px width, confirm no horizontal overflow or clipped elements
- [x] T-13: Re-verify the existing auth flow end-to-end — successful login redirects to
      `/dashboard`, invalid credentials show the existing error message from `actions.ts`

## Post-Implementation

- [x] Run `/review chequea la pagina de loggin no esta muy friendly` to verify implementation
      matches spec
- [x] Confirm Protected Zone files unchanged

## Estimated Complexity

Low — single client-component file, no new dependencies, no backend/schema changes, no
Protected Zone impact.
