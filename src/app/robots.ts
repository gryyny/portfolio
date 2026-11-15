import type { MetadataRoute } from "next";
import { siteUrl } from "@/content/profile";

export const dynamic = "force-static";

// Search, AI search and training crawlers are all welcome.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: `${siteUrl}/sitemap.xml` };
}
