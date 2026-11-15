// Every public fact on the site, in JSON-LD, the OG image and /llms.txt comes from here.
// Facts follow the approved career record; keep them in sync with the public CV.

export const siteUrl = "https://gryyny.si";

export const profile = {
  name: "Andrii Hrynchuk",
  givenName: "Andrii",
  familyName: "Hrynchuk",
  jobTitle: "Tech Lead",
  headline: "Tech Lead · Full-stack product, Web3 and DeFi, AI agent workflows",
  summary:
    "15+ years in software. I led a security product from idea to first enterprise sales in 10 months.",
  description:
    "Andrii Hrynchuk is a Tech Lead in Lisbon: full-stack product, Web3 and DeFi, and AI agent workflows. 15+ years in software.",
  location: { city: "Lisbon", country: "PT" },
  email: "gryyny@gmail.com",
  facts: [
    {
      value: "10 months",
      label: "from idea to first enterprise sales of a security product I led at Hacken",
    },
    { value: "20+", label: "engineers mentored while leading teams since 2017" },
    { value: "20", label: "people ship with the AI agent workflow I built at Limitless Labs" },
  ],
  experience: "Now Tech Lead at Limitless Labs. Before: Tacans Labs, Hacken, Tabia and Brights.",
  employer: "Limitless Labs",
  knowsAbout: [
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Web3",
    "DeFi",
    "Solidity",
    "AI agent workflows",
  ],
  links: {
    linkedin: "https://www.linkedin.com/in/andrii-hrynchuk-a06675122/",
    github: "https://github.com/gryyny",
    repo: "https://github.com/gryyny/portfolio",
    diary: "https://github.com/gryyny/llm-fit-dairy",
    cv: "/Andrii_Hrynchuk_CV.pdf",
  },
} as const;
