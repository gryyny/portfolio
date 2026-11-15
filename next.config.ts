import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// The deployed commit, shown in the arena corner so a visitor can tell which build is live.
function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_COMMIT: buildCommit() },
  // Only the consent fixture build (pnpm verify:consent) exports elsewhere; the site uses out/.
  ...(process.env.EXPORT_DIR ? { distDir: process.env.EXPORT_DIR } : {}),
};

export default nextConfig;
