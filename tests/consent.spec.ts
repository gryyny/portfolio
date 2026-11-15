import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Fixture Firebase settings, with every Google endpoint answered locally: nothing leaves the
// machine, so this proves the consent gate and the CSP, not the real Firebase project.
const google =
  /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|firebase(installations)?\.googleapis\.com/;
const gtag = /googletagmanager\.com\/gtag\/js/;

async function watch(page: Page, context: BrowserContext) {
  const requests: string[] = [];
  const errors: string[] = [];
  await context.route(google, (route) => {
    const url = route.request().url();
    if (gtag.test(url)) return route.fulfill({ contentType: "text/javascript", body: "" });
    if (url.includes("firebaseinstallations")) {
      return route.fulfill({
        json: {
          fid: "fixture",
          refreshToken: "fixture",
          authToken: { token: "fixture", expiresIn: "604800s" },
        },
      });
    }
    if (url.includes("webConfig"))
      return route.fulfill({ json: { measurementId: "G-FIXTURE000" } });
    return route.fulfill({ status: 204 });
  });
  page.on("request", (r) => {
    if (google.test(r.url())) requests.push(r.url());
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return { requests, errors };
}

async function gaCookies(context: BrowserContext) {
  return (await context.cookies()).filter((c) => c.name.startsWith("_ga"));
}

const consentBar = (page: Page) => page.getByRole("region", { name: "Usage statistics" });

test("a fresh visit and a stored denial load no Firebase and send nothing", async ({
  page,
  context,
}) => {
  const seen = await watch(page, context);
  await page.goto("/");
  await expect(consentBar(page)).toBeVisible();
  await page.waitForTimeout(1000);
  expect(seen.requests).toEqual([]);

  await consentBar(page).getByRole("button", { name: "No thanks" }).click();
  await expect(consentBar(page)).toBeHidden();
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(consentBar(page)).toBeHidden();
  expect(seen.requests).toEqual([]);
  expect(await gaCookies(context)).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("Allow loads the analytics script once, within the CSP", async ({ page, context }) => {
  const seen = await watch(page, context);
  await page.goto("/");
  await consentBar(page).getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => seen.requests.filter((u) => gtag.test(u)).length).toBe(1);
  await page.waitForTimeout(1000);
  expect(seen.requests.filter((u) => gtag.test(u))).toHaveLength(1);
  expect(seen.errors).toEqual([]);
});

test("withdrawing while the SDK is still loading prevents initialization", async ({
  page,
  context,
}) => {
  const seen = await watch(page, context);
  const html = await (await page.request.get("/privacy")).text();
  const initial = new Set(html.match(/\/_next\/static\/chunks\/[^"]+\.js/g));
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    if (!initial.has(new URL(route.request().url()).pathname)) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Allow statistics" }).click();
  await page.getByRole("button", { name: "Withdraw consent" }).click();
  await page.waitForTimeout(3000);
  expect(seen.requests).toEqual([]);
  await expect(page.getByText("not allowed")).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test("a later withdrawal stops collection, removes GA cookies and reloads denied", async ({
  page,
  context,
  baseURL,
}) => {
  const seen = await watch(page, context);
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Allow statistics" }).click();
  await expect.poll(() => seen.requests.filter((u) => gtag.test(u)).length).toBe(1);
  await context.addCookies([
    { name: "_ga", value: "GA1.1.1", url: baseURL ?? "" },
    { name: "_ga_FIXTURE000", value: "GS1.1", url: baseURL ?? "" },
  ]);
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Withdraw consent" }).click(),
  ]);
  await expect(page.getByText("not allowed")).toBeVisible();
  expect(await gaCookies(context)).toEqual([]);
  const before = seen.requests.length;
  await page.waitForTimeout(1000);
  expect(seen.requests).toHaveLength(before);
  expect(seen.errors).toEqual([]);
});
