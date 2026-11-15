import type { Analytics } from "firebase/analytics";

// Google Analytics for Firebase, loaded and initialized only after an explicit Allow.
// Nothing is imported, buffered or sent before that, and storage failures count as denied.

export type Consent = "granted" | "denied" | "unset";
type Params = Record<string, string | number | boolean>;

const KEY = "gsd-consent";
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const analyticsConfigured = Object.values(firebaseConfig).every(Boolean);

const listeners = new Set<() => void>();
let generation = 0;
let analytics: Promise<Analytics | null> | null = null;

export function readConsent(): Consent {
  try {
    const value = localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "denied";
  }
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setConsent(consent: "granted" | "denied"): void {
  try {
    localStorage.setItem(KEY, consent);
  } catch {
    // Without storage the choice lasts for this page only, and the default stays denied.
  }
  listeners.forEach((listener) => {
    listener();
  });
  if (consent === "granted") initAnalytics();
  else void stopAnalytics();
}

export function initAnalytics(): void {
  if (analyticsConfigured && readConsent() === "granted") analytics ??= load(++generation);
}

export function track(name: string, params?: Params): void {
  const loading = analytics;
  if (!loading) return;
  void loading.then(async (instance) => {
    if (!instance || readConsent() !== "granted") return;
    const { logEvent } = await import("firebase/analytics");
    logEvent(instance, name, params);
  });
}

async function load(run: number): Promise<Analytics | null> {
  const current = () => run === generation && readConsent() === "granted";
  const [{ initializeApp }, { getAnalytics, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);
  if (!current() || !(await isSupported()) || !current()) return null;
  return getAnalytics(initializeApp(firebaseConfig));
}

/** Withdrawal: stop any pending start, disable collection, remove GA cookies, reload without the SDK. */
async function stopAnalytics(): Promise<void> {
  generation++;
  const loading = analytics;
  analytics = null;
  const instance = loading ? await loading : null;
  if (!instance) return;
  const { setAnalyticsCollectionEnabled } = await import("firebase/analytics");
  setAnalyticsCollectionEnabled(instance, false);
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim() ?? "";
    if (!name.startsWith("_ga")) continue;
    for (const domain of ["", `; domain=${location.hostname}`, `; domain=.${location.hostname}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
    }
  }
  location.reload();
}
