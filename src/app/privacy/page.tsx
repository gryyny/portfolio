import type { Metadata } from "next";
import Link from "next/link";
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
        <p>
          This site has no accounts and no forms. It keeps a few values in your browser and, only if
          you allow it, sends usage statistics to Google.
        </p>

        <h2>Usage statistics</h2>
        <ul>
          <li>
            Provider: Google Analytics for Firebase (Google). It loads only after you choose Allow.
            Before that, the site makes no request to Google.
          </li>
          <li>
            What it collects: page views, the game events listed below, device and browser details,
            approximate location derived from your IP address, and a pseudonymous identifier stored
            in <code>_ga</code> cookies.
          </li>
          <li>
            Game events: game start, level complete, AI perk outcome, quiz answer, game over, clicks
            on the CV, Email, LinkedIn and GitHub links.
          </li>
          <li>Retention: event data is kept for 2 months.</li>
        </ul>
        <ConsentSettings />
        <p>
          Withdrawing stops collection, removes the <code>_ga</code> cookies for this site and
          reloads the page without the analytics code.
        </p>

        <h2>Stored in your browser</h2>
        <ul>
          <li>
            <code>gsd-consent</code>: your statistics choice.
          </li>
          <li>
            <code>gsd-best</code>: your best game result.
          </li>
          <li>
            <code>gsd-asked</code>: that the one-time &quot;Enjoying it?&quot; card was shown.
          </li>
        </ul>
        <p>Clearing this site&apos;s data in your browser removes all of them.</p>

        <h2>Questions</h2>
        <p>
          Write to <a href={`mailto:${profile.email}`}>{profile.email}</a>.
        </p>
      </article>
    </main>
  );
}
