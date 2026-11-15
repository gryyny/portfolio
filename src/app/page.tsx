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
