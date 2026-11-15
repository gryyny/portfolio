import { defineConfig, devices } from "@playwright/test";

// Runs against the fixture export built by `pnpm verify:consent`, never against the real site build.
const port = 4175;

export default defineConfig({
  testDir: "tests",
  testMatch: "consent.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: {
    command: `serve out-consent --listen ${port} --no-clipboard`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
