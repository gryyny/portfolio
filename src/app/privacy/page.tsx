import type { Metadata } from "next";
import Link from "next/link";
import { analyticsConfigured } from "@/analytics";
import { ConsentSettings } from "@/components/Consent";
import { profile } from "@/content/profile";

export const metadata: Metadata = {
  title: "Privacy · gryyny.si",
  description: "What gryyny.si stores in your browser and what usage statistics it collects.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <main className="page">
      <article className="doc">
        <p>
          <Link href="/">← gryyny.si</Link>
        </p>
        <h1>Privacy</h1>
        <p>Last updated: 16 November 2026.</p>
        <p>
          This site has no accounts and no forms. It keeps a few values in your browser
          {analyticsConfigured
            ? " and, only if you allow it, sends usage statistics to Google"
            : ""}
          .
        </p>

        <h2>Who is responsible</h2>
        <p>
          {profile.name}, <a href={`mailto:${profile.email}`}>{profile.email}</a>.
        </p>

        <h2>Usage statistics</h2>
        {analyticsConfigured ? (
          <>
            <ul>
              <li>
                Provider: Google Analytics for Firebase. It loads only after you choose Allow.
                Before that, the site makes no request to Google.
              </li>
              <li>
                Legal basis: your consent. You can withdraw it at any time below; this does not
                affect use before the withdrawal.
              </li>
              <li>
                Google processes the data on my behalf as a processor and may transfer it to the US
                under the EU-US Data Privacy Framework.
              </li>
              <li>
                What it collects: page views, the game events listed below, device and browser
                details, approximate location derived from your IP address, and a pseudonymous
                identifier.
              </li>
              <li>
                Game events: game start, level complete, AI perk outcome, quiz answer, game over,
                clicks on the CV, Email, LinkedIn and GitHub links.
              </li>
              <li>
                Retention: event data is kept for 2 months. User-level data linked to the
                pseudonymous identifier is kept for up to 14 months, and that period restarts each
                time you return.
              </li>
            </ul>
            <ConsentSettings />
            <p>
              Withdrawing stops collection, removes the analytics cookies and databases listed below
              and reloads the page without the analytics code.
            </p>
          </>
        ) : (
          <p>
            Usage statistics are currently disabled. This site does not send analytics data to
            Google.
          </p>
        )}

        <h2>Stored in your browser</h2>
        <ul>
          {analyticsConfigured && (
            <li>
              <code>gsd-consent</code>: your statistics choice.
            </li>
          )}
          <li>
            <code>gsd-best</code>: your best game result.
          </li>
          <li>
            <code>gsd-asked</code>: that the one-time &quot;Enjoying it?&quot; card was shown.
          </li>
          {analyticsConfigured && (
            <li>
              Only after Allow: <code>_ga</code> cookies and the IndexedDB databases{" "}
              <code>firebase-installations-database</code> and{" "}
              <code>firebase-heartbeat-database</code>.
            </li>
          )}
        </ul>
        <p>Clearing this site&apos;s data in your browser removes all of them.</p>

        <h2>Your rights</h2>
        <p>
          You can ask to see the data about you or to have it deleted: write to{" "}
          <a href={`mailto:${profile.email}`}>{profile.email}</a>. You can also complain to your
          local data protection authority. In Portugal, contact the{" "}
          <a href="https://www.cnpd.pt/" target="_blank" rel="noopener">
            Comissão Nacional de Proteção de Dados (CNPD)
          </a>
          .
        </p>
      </article>
    </main>
  );
}
