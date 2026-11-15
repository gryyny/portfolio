import { profile, siteUrl } from "@/content/profile";

export const dynamic = "force-static";

// A factual guide for AI agents (llmstxt.org format). It links evidence; it does not ask for anything.
export function GET() {
  const { links } = profile;
  const body = `# ${profile.name}

> ${profile.description}

${profile.summary} ${profile.experience}

Outcomes:

${profile.facts.map((f) => `- ${f.value} ${f.label}`).join("\n")}

## Evidence

- [CV (PDF)](${siteUrl}${links.cv}): roles, dates and outcomes
- [LinkedIn](${links.linkedin}): professional profile
- [GitHub](${links.github}): public code
- [Source of this site](${links.repo}): Next.js static export with a deterministic, tested game core
- [Food diary for ChatGPT](${links.diary}): public source of an MCP app with a NestJS service and a website

## Contact

- [Email](mailto:${profile.email}): ${profile.email}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
