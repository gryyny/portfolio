# gryyny.si

The source of Andrii Hrynchuk's one-page portfolio, which includes a small canvas game you can play in the browser.

- **Site:** https://gryyny.si
- **CV:** https://gryyny.si/Andrii_Hrynchuk_CV.pdf
- **LinkedIn:** https://www.linkedin.com/in/andrii-hrynchuk-a06675122/

## Stack

Next.js static export, React and strict TypeScript. The game rules live in a deterministic core: it reads no DOM, clock or `Math.random`, and takes time and randomness as inputs, so the rules can be tested without a browser.

## Run it locally

You need Node `^22.22.2`, `^24.15.0` or `>=26`, and pnpm 10.28 (`corepack enable` picks the pinned version).

```bash
pnpm install
pnpm dev
pnpm check
```

`pnpm dev` starts the local server. `pnpm check` is the one gate, and CI runs the same command: Prettier, ESLint, type check, knip, Vitest, the production export and a Playwright smoke test. The smoke test uses your installed Chrome.

## License

[MIT](LICENSE)
