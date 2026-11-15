import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The deploy key's forced command is a security boundary, so it is tested on a throwaway directory.
// A fake rrsync reports how it was called; real rrsync behaviour is checked separately on Linux.
const script = join(import.meta.dirname, "..", "deploy", "portfolio-deploy.py");
const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);
const upload = (target: string) => `rsync --server -logDtpre.iLsfxCIvu . ${target}`;
let root: string;
let fake: string;

function env(command: string, extra: Record<string, string> = {}) {
  return {
    ...process.env,
    PORTFOLIO_ROOT: root,
    PORTFOLIO_RRSYNC: fake,
    SSH_ORIGINAL_COMMAND: command,
    ...extra,
  };
}

function run(command: string) {
  const result = spawnSync("python3", [script], { env: env(command), encoding: "utf8" });
  return { ok: result.status === 0, out: result.stdout, err: result.stderr };
}

function runAsync(command: string, extra: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    spawn("python3", [script], { env: env(command, extra), stdio: "ignore" }).on("exit", () => {
      resolve(Date.now());
    });
  });
}

function release(commit: string, asset = "chunks/app.js", content = commit) {
  const dir = join(root, "releases", commit);
  mkdirSync(join(dir, "_next", "static", "chunks"), { recursive: true });
  writeFileSync(join(dir, "index.html"), commit);
  writeFileSync(join(dir, "404.html"), "404");
  writeFileSync(join(dir, "_next", "static", asset), content);
}

function share(asset: string, content: string) {
  mkdirSync(join(root, "shared", "_next", "static", "chunks"), { recursive: true });
  writeFileSync(join(root, "shared", "_next", "static", asset), content);
}

function ship(commit: string, run: number, asset = `chunks/${commit[0] ?? ""}.js`) {
  release(commit, asset);
  share(asset, commit);
  return runCommand(`promote ${commit} ${run}`);
}

const runCommand = run;
const current = () => readlinkSync(join(root, "current"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "portfolio-deploy-"));
  fake = join(root, "..", `${root.split("/").pop() ?? ""}-rrsync`);
  writeFileSync(
    fake,
    '#!/bin/sh\necho "$*|$SSH_ORIGINAL_COMMAND"\n' +
      'if [ -n "$HOLD" ]; then touch "$HOLD"; sleep 1; fi\n',
  );
  chmodSync(fake, 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(fake, { force: true });
  rmSync(`${fake}-started`, { force: true });
});

describe("portfolio deploy command", () => {
  it.each([
    "bash",
    "promote ../../etc/passwd 1",
    `promote ${a} 0`,
    `promote ${a} 1; rm -rf /`,
    upload("../"),
    upload(`releases/${a}/../../`),
    upload("history"),
    upload("current/"),
    "rsync --server --sender -logDtpre.iLsfxCIvu . current/",
    "rsync --server -logDtpre.iLsfxCIvu --log-file=chunks/app.js . shared/_next/static/",
    `rsync --server -logDtpre.iLsfxCIvu --partial-dir=x . releases/${a}/`,
    `rsync --server -logDtpre.iLsfxCIvu -T /tmp . releases/${a}/`,
    "rsync --server",
  ])("refuses %s", (command) => {
    expect(run(command).ok).toBe(false);
  });

  it("roots rrsync at the one destination, append-only, without deletes, with links munged", () => {
    const result = run(upload(`releases/${a}/`));
    expect(result.ok).toBe(true);
    expect(result.out.trim()).toBe(
      `-wo -no-del -no-overwrite -munge ${join(root, "releases", a)}|rsync --server -logDtpre.iLsfxCIvu . .`,
    );
  });

  it("keeps the lock until the transfer process has exited", async () => {
    release(a);
    share("chunks/app.js", a);
    const started = `${fake}-started`;
    const uploadDone = runAsync(upload("shared/_next/static/"), { HOLD: started });
    while (!existsSync(started)) await new Promise((resolve) => setTimeout(resolve, 20));
    // The fake transfer holds for 1 s after it starts; a promote that does not wait takes milliseconds.
    const promoteStart = Date.now();
    const promoteEnd = await runAsync(`promote ${a} 1`);
    expect(promoteEnd - promoteStart).toBeGreaterThan(500);
    await uploadDone;
    expect(current()).toBe(`releases/${a}`);
  });

  it.each([
    [
      "no static assets",
      () => {
        rmSync(join(root, "releases", a, "_next"), { recursive: true });
      },
    ],
    [
      "a shared asset is missing",
      () => {
        rmSync(join(root, "shared"), { recursive: true });
      },
    ],
    [
      "a shared asset differs, same length",
      () => {
        share("chunks/app.js", "z".repeat(40));
      },
    ],
    [
      "it contains a symlink",
      () => {
        symlinkSync("/etc/hosts", join(root, "releases", a, "leak"));
      },
    ],
  ])("refuses a release when %s, keeping the live one", (_, breakIt) => {
    ship(b, 1);
    release(a);
    share("chunks/app.js", a);
    breakIt();
    expect(run(`promote ${a} 2`).ok).toBe(false);
    expect(current()).toBe(`releases/${b}`);
  });

  it("promotes atomically with a relative link and refuses stale or repeated runs", () => {
    expect(ship(a, 5).ok).toBe(true);
    expect(current()).toBe(`releases/${a}`);
    release(b, "chunks/b.js");
    share("chunks/b.js", b);
    expect(run(`promote ${b} 4`).err).toMatch(/not newer/);
    expect(run(`promote ${b} 5`).ok).toBe(false);
    expect(current()).toBe(`releases/${a}`);
  });

  it("rolls back without forgetting history: stale runs stay stale, releases stay immutable", () => {
    ship(a, 10);
    ship(b, 20);
    expect(run("rollback").ok).toBe(true);
    expect(current()).toBe(`releases/${a}`);
    expect(readFileSync(join(root, "history"), "utf8")).toBe(`10 ${a}\n20 ${b}\n`);
    release(c, "chunks/c.js");
    share("chunks/c.js", c);
    expect(run(`promote ${c} 15`).err).toMatch(/not newer/);
    expect(run(upload(`releases/${b}/`)).err).toMatch(/immutable/);
    expect(run("rollback").ok).toBe(false);
    expect(run(`promote ${c} 21`).ok).toBe(true);
  });
});
