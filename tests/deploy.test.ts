import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The deploy key's forced command is a security boundary, so it is tested on a throwaway directory.
const script = join(import.meta.dirname, "..", "deploy", "portfolio-deploy.py");
const a = "a".repeat(40);
const b = "b".repeat(40);
let root: string;

function run(command: string) {
  const result = spawnSync("python3", [script], {
    env: {
      ...process.env,
      PORTFOLIO_ROOT: root,
      PORTFOLIO_RRSYNC: "/bin/echo",
      SSH_ORIGINAL_COMMAND: command,
    },
    encoding: "utf8",
  });
  return { ok: result.status === 0, out: result.stdout, err: result.stderr };
}

function release(commit: string, asset = "chunks/app.js") {
  const dir = join(root, "releases", commit);
  mkdirSync(join(dir, "_next", "static", "chunks"), { recursive: true });
  writeFileSync(join(dir, "index.html"), commit);
  writeFileSync(join(dir, "404.html"), "404");
  writeFileSync(join(dir, "_next", "static", asset), commit);
}

function share(commit: string, asset = "chunks/app.js") {
  mkdirSync(join(root, "shared", "_next", "static", "chunks"), { recursive: true });
  writeFileSync(join(root, "shared", "_next", "static", asset), commit);
}

const current = () => readlinkSync(join(root, "current"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "portfolio-deploy-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("portfolio deploy command", () => {
  it.each([
    "bash",
    "promote ../../etc/passwd 1",
    `promote ${a} 0`,
    `promote ${a} 1; rm -rf /`,
    "rsync --server -logDtpre.iLsfxCIvu . ../",
    `rsync --server -logDtpre.iLsfxCIvu . releases/${a}/../../`,
    "rsync --server --delete -logDtpre.iLsfxCIvu . shared/_next/static/",
    "rsync --server --sender -logDtpre.iLsfxCIvu . current/",
  ])("refuses %s", (command) => {
    expect(run(command).ok).toBe(false);
  });

  it("hands allowed uploads to rrsync, write-only and without deletes", () => {
    const result = run(`rsync --server -logDtpre.iLsfxCIvu . releases/${a}/`);
    expect(result.ok).toBe(true);
    expect(result.out.trim()).toBe(`-wo -no-del ${root}`);
  });

  it("refuses a release whose hashed assets are not in shared yet", () => {
    release(a);
    expect(run(`promote ${a} 1`).err).toMatch(/shared asset missing/);
  });

  it("promotes atomically with a relative link and refuses stale or repeated runs", () => {
    release(a);
    share(a);
    expect(run(`promote ${a} 5`).ok).toBe(true);
    expect(current()).toBe(`releases/${a}`);
    release(b, "chunks/next.js");
    share(b, "chunks/next.js");
    expect(run(`promote ${b} 4`).err).toMatch(/not newer/);
    expect(run(`promote ${b} 5`).ok).toBe(false);
    expect(current()).toBe(`releases/${a}`);
  });

  it("makes promoted releases immutable", () => {
    release(a);
    share(a);
    run(`promote ${a} 1`);
    expect(run(`rsync --server -logDtpre.iLsfxCIvu . releases/${a}/`).ok).toBe(false);
  });

  it("rolls back to the previous release, whose assets are still shared", () => {
    release(a);
    share(a);
    run(`promote ${a} 1`);
    release(b, "chunks/next.js");
    share(b, "chunks/next.js");
    run(`promote ${b} 2`);
    expect(run("rollback").ok).toBe(true);
    expect(current()).toBe(`releases/${a}`);
    expect(readFileSync(join(root, "history"), "utf8")).toBe(`1 ${a}\n`);
    expect(run("rollback").ok).toBe(false);
  });
});
