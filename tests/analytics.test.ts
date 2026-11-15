import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Firebase is replaced with spies: the test asserts what the consent gate imports and calls,
// with a fully configured project, without any network.
const imported = vi.hoisted(() => ({ app: 0, analytics: 0 }));
const firebase = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({})),
  getAnalytics: vi.fn(() => ({ analytics: true })),
  isSupported: vi.fn(() => Promise.resolve(true)),
  logEvent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
}));
// The factories count module evaluations, so an eager SDK import fails the "nothing" cases.
vi.mock("firebase/app", () => {
  imported.app++;
  return { initializeApp: firebase.initializeApp };
});
vi.mock("firebase/analytics", () => {
  imported.analytics++;
  return {
    getAnalytics: firebase.getAnalytics,
    isSupported: firebase.isSupported,
    logEvent: firebase.logEvent,
    setAnalyticsCollectionEnabled: firebase.setAnalyticsCollectionEnabled,
  };
});

const reload = vi.fn();
let cookies: string[] = [];
let stored: Map<string, string>;

async function load() {
  vi.resetModules();
  return import("@/analytics");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  for (const name of ["API_KEY", "APP_ID", "PROJECT_ID", "MEASUREMENT_ID"]) {
    vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${name}`, "test");
  }
  stored = new Map();
  cookies = ["_ga=GA1.1.1", "_ga_X=GS1.1"];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => stored.set(k, v),
  });
  vi.stubGlobal("location", { hostname: "gryyny.si", reload });
  vi.stubGlobal("document", {
    get cookie() {
      return cookies.join("; ");
    },
    set cookie(value: string) {
      const name = value.split("=")[0] ?? "";
      if (value.includes("Max-Age=0")) cookies = cookies.filter((c) => !c.startsWith(`${name}=`));
    },
  });
  Object.values(firebase).forEach((spy) => spy.mockClear());
  imported.app = 0;
  imported.analytics = 0;
  reload.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("consent gate with a configured Firebase project", () => {
  it("loads nothing and sends nothing before a choice", async () => {
    const analytics = await load();
    expect(analytics.analyticsConfigured).toBe(true);
    analytics.initAnalytics();
    analytics.track("game_start");
    await settle();
    expect(imported).toEqual({ app: 0, analytics: 0 });
    expect(firebase.logEvent).not.toHaveBeenCalled();
  });

  it("treats unreadable storage as denied", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const analytics = await load();
    expect(analytics.readConsent()).toBe("denied");
    analytics.initAnalytics();
    await settle();
    expect(firebase.initializeApp).not.toHaveBeenCalled();
  });

  it("keeps a denial across page loads", async () => {
    (await load()).setConsent("denied");
    const nextPage = await load();
    nextPage.initAnalytics();
    nextPage.track("game_start");
    await settle();
    expect(nextPage.readConsent()).toBe("denied");
    expect(imported).toEqual({ app: 0, analytics: 0 });
  });

  it("initializes once after Allow and then logs events", async () => {
    const analytics = await load();
    analytics.setConsent("granted");
    analytics.track("game_start");
    await settle();
    expect(firebase.initializeApp).toHaveBeenCalledTimes(1);
    expect(firebase.logEvent).toHaveBeenCalledWith({ analytics: true }, "game_start", undefined);
  });

  it("never initializes when consent is withdrawn while the SDK is still loading", async () => {
    let supported: (value: boolean) => void = () => undefined;
    firebase.isSupported.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (supported = resolve)),
    );
    const analytics = await load();
    analytics.setConsent("granted");
    await settle();
    analytics.setConsent("denied");
    supported(true);
    await settle();
    expect(firebase.getAnalytics).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("disables collection, removes GA cookies and reloads on withdrawal", async () => {
    const analytics = await load();
    analytics.setConsent("granted");
    await settle();
    analytics.setConsent("denied");
    await settle();
    expect(firebase.setAnalyticsCollectionEnabled).toHaveBeenCalledWith({ analytics: true }, false);
    expect(cookies).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
