import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { profile, siteUrl } from "@/content/profile";
import "./globals.css";

// Local subsets (Latin plus the UI symbols) of OFL fonts; licenses sit next to the files.
// Display is one static 800 cut; body and mono keep their 400-700 weight axis.
const display = localFont({
  src: "../fonts/bricolage-grotesque-800.woff2",
  weight: "800",
  variable: "--font-display",
});
const body = localFont({
  src: "../fonts/instrument-sans.woff2",
  weight: "400 700",
  variable: "--font-body",
});
const mono = localFont({
  src: "../fonts/jetbrains-mono.woff2",
  weight: "400 700",
  variable: "--font-mono",
  // Labels and the canvas only; not worth competing with first paint.
  preload: false,
  adjustFontFallback: false,
});

const title = `${profile.name} · ${profile.jobTitle}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description: profile.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "profile",
    url: "/",
    siteName: "gryyny.si",
    title,
    description: profile.description,
    firstName: profile.givenName,
    lastName: profile.familyName,
  },
  twitter: { card: "summary_large_image", title, description: profile.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1424" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <link rel="describedby" href="/llms.txt" type="text/markdown" />
      </head>
      <body>{children}</body>
    </html>
  );
}
