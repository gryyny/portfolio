import { expect, test, type Page } from "@playwright/test";

const analyticsHosts = /google-analytics\.com|googletagmanager\.com|firebase/;

function watch(page: Page) {
  const analytics: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (analyticsHosts.test(r.url())) analytics.push(r.url());
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return { analytics, errors };
}

test("plays, pauses, exits and restarts under the real CSP, without analytics before consent", async ({
  page,
}) => {
  const seen = watch(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Andrii Hrynchuk" })).toBeVisible();

  const play = page.getByRole("button", { name: "Play: ship a release" });
  const hud = page.locator(".hud");
  await play.click();
  await expect(hud).toBeVisible();

  await hud.getByRole("button", { name: "Pause" }).click();
  const paused = page.locator(".panel", { hasText: "Paused" });
  await expect(paused.locator(".links a")).toHaveCount(4);
  await paused.getByRole("button", { name: "Resume" }).click();
  await expect(paused).toBeHidden();

  await page.keyboard.press("p");
  await expect(paused).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paused).toBeHidden();

  await hud.getByRole("button", { name: "Exit" }).click();
  await expect(hud).toBeHidden();
  await play.click();
  await expect(hud).toBeVisible();
  await hud.getByRole("button", { name: "Exit" }).click();

  await page.locator('.hero a[data-link="email"]').click();
  await expect(page.locator("#mail-address")).toHaveText("gryyny@gmail.com");
  await page.getByRole("button", { name: "Close" }).click();

  expect(seen.analytics).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows identity, facts and four working links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Andrii Hrynchuk" })).toBeVisible();
    await expect(page.locator(".facts dt")).toHaveCount(3);
    const links = page.locator(".hero .links a");
    await expect(links).toHaveCount(4);
    await expect(links.nth(3)).toHaveAttribute("href", "mailto:gryyny@gmail.com");
  });
});
