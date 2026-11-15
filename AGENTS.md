# Repository instructions

A one-page portfolio for gryyny.si: Next.js 16 static export, React 19, strict TypeScript, and a small canvas game.

## Commands

- Node `^22.22.2 || ^24.15.0 || >=26`, pnpm 10.28 (`corepack enable`), then `pnpm install`.
- `pnpm dev`: local server.
- `pnpm check`: the one gate. Prettier, ESLint (zero warnings), `tsc --noEmit`, knip, Vitest, the production export with CSP, and the Playwright smoke test. CI runs the same command.
- `pnpm lighthouse`: Lighthouse CI on `out/`, 3 runs, median asserted. Required in CI, on demand locally.
- Smoke tests use the installed Chrome locally; CI installs Playwright's Chromium.

## Boundaries

- `src/game/core.ts` holds every game rule. It reads no DOM, storage, clock or `Math.random`; time and randomness are passed in. `config.ts` holds every gameplay number.
- `render.ts` only draws. `input.ts` turns keyboard, joystick and tilt into movement and commands. `Portfolio.tsx` wires them together and owns the one animation loop.
- The Zustand store holds presentation snapshots only; never write gameplay state there.
- Public facts live in `src/content/profile.ts` and feed the page, JSON-LD, OG image and `/llms.txt`. Do not add claims that are not in the approved CV.
- Analytics loads only after an explicit Allow. Never import Firebase outside `src/analytics.ts`.
- Questions in `src/content/questions.json`: one right and two wrong answers, checked against official docs before merge.

## Rules

- Strict TypeScript, no `any`, named exports except where Next.js requires a default.
- Test behavior: game rules, the question format, tilt mapping, one smoke scenario. No tests of React, Next.js or canvas pixels.
- Add a dependency only when the platform cannot do the job; packages younger than 14 days are refused by `pnpm-workspace.yaml`.
- Conventional commits on `main`.
