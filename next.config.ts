import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  // Only the consent fixture build (pnpm verify:consent) exports elsewhere; the site uses out/.
  ...(process.env.EXPORT_DIR ? { distDir: process.env.EXPORT_DIR } : {}),
};

export default nextConfig;
