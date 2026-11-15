"use client";

import { useSyncExternalStore } from "react";
import {
  analyticsConfigured,
  readConsent,
  setConsent,
  subscribeConsent,
  type Consent,
} from "@/analytics";

// The server and the first client render know nothing about the choice, so nothing is shown until hydration.
function useConsent(): Consent | null {
  return useSyncExternalStore(subscribeConsent, readConsent, () => null);
}

export function ConsentBar() {
  const consent = useConsent();
  if (!analyticsConfigured || consent !== "unset") return null;
  return (
    <div className="consent" role="region" aria-label="Usage statistics">
      <span>Allow usage statistics with Google Analytics?</span>
      <button
        type="button"
        className="primary"
        onClick={() => {
          setConsent("granted");
        }}
      >
        Allow
      </button>
      <button
        type="button"
        onClick={() => {
          setConsent("denied");
        }}
      >
        No thanks
      </button>
    </div>
  );
}

export function ConsentSettings() {
  const consent = useConsent();
  if (consent === null) return null;
  if (!analyticsConfigured) return <p>Usage statistics are switched off on this site.</p>;
  return (
    <div className="settings">
      <p>
        Your choice:{" "}
        <b>
          {consent === "granted"
            ? "allowed"
            : consent === "denied"
              ? "not allowed"
              : "not made yet"}
        </b>
      </p>
      <div className="row">
        {consent !== "granted" && (
          <button
            type="button"
            className="play"
            onClick={() => {
              setConsent("granted");
            }}
          >
            Allow statistics
          </button>
        )}
        {consent !== "denied" && (
          <button
            type="button"
            className="play ghost"
            onClick={() => {
              setConsent("denied");
            }}
          >
            {consent === "granted" ? "Withdraw consent" : "Do not allow"}
          </button>
        )}
      </div>
    </div>
  );
}
