import Link from "next/link";
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
    description: profile.description,
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
      <a href={profile.links.linkedin} target="_blank" rel="noopener" data-link="linkedin">
        LinkedIn ↗
      </a>
      <a href={profile.links.github} target="_blank" rel="noopener" data-link="github">
        GitHub ↗
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
    <main className="page">
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
            <p className="line full">{profile.summary}</p>
          </>
        }
      />
      <section className="facts" aria-label="Highlights">
        <dl>
          {profile.facts.map((fact) => (
            <div key={fact.value}>
              <dt>{fact.value}</dt>
              <dd>{fact.label}</dd>
            </div>
          ))}
        </dl>
        <p className="exp">{profile.experience}</p>
      </section>
      <footer className="foot">
        <span>© {profile.name}</span>
        <Link href="/privacy">Privacy</Link>
        <a href={profile.links.repo} target="_blank" rel="noopener">
          Source
        </a>
      </footer>
    </main>
  );
}
