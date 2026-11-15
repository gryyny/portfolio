// Adds a per-page Content-Security-Policy <meta> to every exported HTML file.
// Static export has no server to issue nonces, so each executable inline script is allowed by
// the SHA-256 of its exact bytes. frame-ancestors cannot live in a meta tag; Caddy sends it.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "parse5";

const OUT = "out";

// Google Analytics for Firebase, used only after consent.
const analytics = {
  script: ["https://www.googletagmanager.com"],
  connect: [
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://www.googletagmanager.com",
    "https://firebase.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
  ],
  img: ["https://*.google-analytics.com", "https://www.googletagmanager.com"],
};

const executable = new Set(["", "text/javascript", "application/javascript", "module"]);

function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
}

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;

function policy(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.map((h) => `'sha256-${h}'`).join(" ")} ${analytics.script.join(" ")}`,
    // React sets inline style attributes and next/font injects a style block; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${analytics.img.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self' ${analytics.connect.join(" ")}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

function finalize(html) {
  const nodes = [...walk(parse(html, { sourceCodeLocationInfo: true }))];
  const head = nodes.find((n) => n.nodeName === "head");
  if (!head?.sourceCodeLocation?.startTag) throw new Error("No <head> in exported HTML");
  if (
    nodes.some((n) => n.nodeName === "meta" && attr(n, "http-equiv") === "Content-Security-Policy")
  ) {
    throw new Error("Exported HTML already has a CSP meta tag");
  }

  const hashes = [];
  for (const n of nodes) {
    if (n.nodeName !== "script" || attr(n, "src") !== undefined) continue;
    if (!executable.has((attr(n, "type") ?? "").toLowerCase())) continue;
    const loc = n.sourceCodeLocation;
    const body = html.slice(loc.startTag.endOffset, loc.endTag.startOffset);
    hashes.push(createHash("sha256").update(body, "utf8").digest("base64"));
  }

  // Right after <meta charset>, so the charset stays early and the policy precedes every script.
  const charset = nodes.find((n) => n.nodeName === "meta" && attr(n, "charset") !== undefined);
  const at = (charset ?? head).sourceCodeLocation.startTag.endOffset;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy([...new Set(hashes)])}"/>`;
  return { html: html.slice(0, at) + meta + html.slice(at), count: hashes.length };
}

const files = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith(".html"));
for (const file of files) {
  const path = join(OUT, file);
  const { html, count } = finalize(await readFile(path, "utf8"));
  await writeFile(path, html);
  console.log(`CSP: ${file} (${count} inline scripts hashed)`);
}
