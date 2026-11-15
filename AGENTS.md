# Repository instructions

A one-page portfolio for gryyny.si: Next.js 16 static export, React 19, strict TypeScript, and a small canvas game.

## Commands

- Node `^22.22.2 || ^24.15.0 || >=26`, pnpm 10.28 (`corepack enable`), then `pnpm install`.
- `pnpm dev`: local server.
- `pnpm check`: the one gate. Prettier, ESLint (zero warnings), `tsc --noEmit`, knip, Vitest, the production export with CSP, and the Playwright smoke test. CI runs the same command.
- `pnpm lighthouse`: Lighthouse CI on `out/`, default simulated mobile, 3 runs, median asserted: Performance 95+, the other categories 100, LCP 2.5 s at most (1.5 s remains the aim). Required in CI, on demand locally.
- Smoke tests use the installed Chrome locally; CI installs Playwright's Chromium.

## Deploy

- CI deploys only when the repository variable `DEPLOY_ENABLED` is `true`, and only the `out/` artifact that passed `pnpm check` and `pnpm lighthouse`.
- On the VPS the deploy key's forced command is `deploy/portfolio-deploy.py` (installed as `/usr/local/bin/portfolio-deploy`, `restrict` in `authorized_keys`, needs python3 and rsync 3.4.1+ for `rrsync`). It allows uploads to `shared/_next/static/` and `releases/<commit>/`, `promote <commit> <run>` and `rollback`, nothing else.
- Uploads are rooted at their destination, without deletes, with symlinks munged, and only rsync's short-option block plus `--ignore-existing` are accepted. Shared assets are append-only; an unpromoted release may be re-uploaded so a retry replaces a partial attempt; a promoted release is refused. One lock covers whole transfers, promotions and rollbacks. `history` is append-only: rollback only moves `current`, so stale runs stay refused and promoted releases stay immutable.
- `tests/deploy.test.ts` covers the handler with a fake rrsync; real rrsync behaviour was checked once on Ubuntu 26.04 (rsync 3.4.1).
- Caddy serves `/srv/portfolio/current`; the site blocks and the one-time mount are in `deploy/Caddyfile`.
- `pnpm verify:consent` builds a fixture export with placeholder Firebase settings and checks the consent gate in Chrome with all Google endpoints answered locally. It is not part of `pnpm check`. The gtag script is stubbed, so it does not prove real GA collection or retention.

## Boundaries

- `src/game/core.ts` holds every game rule. It reads no DOM, storage, clock or `Math.random`; time and randomness are passed in. `config.ts` holds every gameplay number.
- `render.ts` only draws. `input.ts` turns keyboard, joystick and tilt into movement and commands.
- `src/components/gameSession.ts` owns the one animation loop and the browser wiring of core, renderer, input and store. `Portfolio.tsx` owns the React UI and the lazy session lifecycle: it imports the session after hydration and replays a Play click made while it loads.
- The Zustand store holds presentation snapshots only; never write gameplay state there.
- Public facts live in `src/content/profile.ts` and feed the page, JSON-LD, OG image and `/llms.txt`. Do not add claims that are not in the approved CV.
- Analytics loads only after an explicit Allow. Never import Firebase outside `src/analytics.ts`.
- Questions in `src/content/questions.json`: one right and two wrong answers, checked against official docs before merge.

## Rules

- Strict TypeScript, no `any`, named exports except where Next.js requires a default.
- Test behavior: game rules, the question format, tilt mapping, one smoke scenario. No tests of React, Next.js or canvas pixels.
- Add a dependency only when the platform cannot do the job; packages younger than 14 days are refused by `pnpm-workspace.yaml`.
- Conventional commits on `main`.
