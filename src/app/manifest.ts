import type { MetadataRoute } from "next";
import { profile } from "@/content/profile";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${profile.name} · gryyny.si`,
    short_name: "gryyny.si",
    description: profile.description,
    start_url: "/",
    display: "browser",
    background_color: "#f2f5f9",
    theme_color: "#2d44d0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
