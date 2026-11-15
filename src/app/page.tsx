import { Portfolio } from "@/components/Portfolio";
import { profile, siteUrl } from "@/content/profile";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  url: siteUrl,
  mainEntity: {
    "@type": "Person",
    "@id": `${siteUrl}/#person`,
    name: profile.name,
    givenName: profile.givenName,
    familyName: profile.familyName,
    jobTitle: profile.jobTitle,
    // The full facts live here and in /llms.txt; the page itself shows only what people need.
    description: `${profile.description} ${profile.summary} ${profile.experience}`,
    url: siteUrl,
    email: `mailto:${profile.email}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: profile.location.city,
      addressCountry: profile.location.country,
    },
    worksFor: { "@type": "Organization", name: profile.employer },
    knowsAbout: profile.knowsAbout,
    sameAs: [profile.links.linkedin, profile.links.github],
  },
};

function ProfileLinks() {
  return (
    <>
      <a
        href={profile.links.linkedin}
        target="_blank"
        rel="noopener"
        data-link="linkedin"
        className="icon"
        aria-label="LinkedIn"
        title="LinkedIn"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 4.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>
      <a
        href={profile.links.github}
        target="_blank"
        rel="noopener"
        data-link="github"
        className="icon"
        aria-label="GitHub"
        title="GitHub"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
      <a href={profile.links.cv} download data-link="cv">
        CV (PDF)
      </a>
      <a href={`mailto:${profile.email}`} data-link="email">
        Email
      </a>
    </>
  );
}

export default function Home() {
  return (
    <main className="home">
      <script
        type="application/ld+json"
        // JSON-LD must be raw JSON; "<" is escaped so the content cannot close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Portfolio
        links={<ProfileLinks />}
        hero={
          <>
            <p className="eyebrow full">gryyny.si</p>
            <h1 className="name">{profile.name}</h1>
            <p className="role full">{profile.headline}</p>
          </>
        }
      />
    </main>
  );
}
