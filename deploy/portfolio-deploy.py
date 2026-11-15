#!/usr/bin/env python3
"""Forced SSH command for the portfolio deploy key.

authorized_keys on the VPS:
  command="/usr/local/bin/portfolio-deploy",restrict ssh-ed25519 AAAA... portfolio-deploy

The key can do exactly three things under PORTFOLIO_ROOT (/srv/portfolio):
  rsync uploads into shared/_next/static/ or releases/<commit>/
  promote <commit> <run>   verify a release, then atomically point `current` at it
  rollback                 point `current` at the release promoted before the live one
There is no shell, no other path and no other command.

Uploads run through rrsync (rsync >= 3.4.1) rooted at the one destination directory, so they
cannot reach history, the lock, `current` or other releases. Shared assets are append-only
(-no-overwrite); an unpromoted release can be re-uploaded so a retry replaces a partial or stale
attempt, and a promoted one is refused outright. -munge turns uploaded symlinks into dead links and
-no-del forbids deletes.
Options are allowlisted here as well: Ubuntu's rrsync 3.4.1 still accepts --log-file under
-no-overwrite, which could append to an existing file inside the destination.
"""

import fcntl
import filecmp
import os
import re
import shlex
import subprocess
import sys

ROOT = os.environ.get("PORTFOLIO_ROOT", "/srv/portfolio")
RRSYNC = os.environ.get("PORTFOLIO_RRSYNC", "/usr/bin/rrsync")
COMMIT = re.compile(r"[0-9a-f]{40}")
RUN = re.compile(r"[1-9][0-9]{0,9}")
UPLOAD = re.compile(r"(shared/_next/static|releases/[0-9a-f]{40})/")
# rsync's compact short-option block (e.g. -logDtpre.iLsfxCIvu) and the one long option CI sends.
OPTION = re.compile(r"-[A-Za-z.]+|--ignore-existing")
HISTORY = os.path.join(ROOT, "history")
CURRENT = os.path.join(ROOT, "current")


def refuse(reason: str) -> None:
    print(f"refused: {reason}", file=sys.stderr)
    sys.exit(1)


def history() -> list[tuple[int, str]]:
    """Every promotion ever made, in order. It is only appended to, never rewritten."""
    try:
        with open(HISTORY) as f:
            return [(int(run), commit) for run, commit in (line.split() for line in f if line.strip())]
    except FileNotFoundError:
        return []


def live_commit() -> str | None:
    try:
        return os.path.basename(os.readlink(CURRENT))
    except FileNotFoundError:
        return None


def point_current_at(commit: str) -> None:
    # A relative symlink renamed over the old one: readers see the old release or the new one, never neither.
    tmp = os.path.join(ROOT, ".current.tmp")
    if os.path.lexists(tmp):
        os.remove(tmp)
    os.symlink(f"releases/{commit}", tmp)
    os.replace(tmp, CURRENT)


def verify_release(commit: str) -> None:
    release = os.path.join(ROOT, "releases", commit)
    if os.path.islink(release) or not os.path.isdir(release):
        refuse(f"release {commit} was not uploaded")
    for page in ("index.html", "404.html"):
        if not os.path.isfile(os.path.join(release, page)):
            refuse(f"release {commit} has no {page}")
    assets = 0
    static = os.path.join(release, "_next", "static")
    for folder, dirs, files in os.walk(release):
        for name in dirs + files:
            if os.path.islink(os.path.join(folder, name)):
                refuse(f"release {commit} contains a symlink: {name}")
        if not os.path.commonpath([folder, static]) == static:
            continue
        # Hashed assets are served from shared/, so each one must already be there, byte for byte.
        for name in files:
            relative = os.path.relpath(os.path.join(folder, name), static)
            shared = os.path.join(ROOT, "shared", "_next", "static", relative)
            if os.path.islink(shared) or not os.path.isfile(shared):
                refuse(f"shared asset missing: {relative}")
            if not filecmp.cmp(os.path.join(folder, name), shared, shallow=False):
                refuse(f"shared asset differs: {relative}")
            assets += 1
    if assets == 0:
        refuse(f"release {commit} has no static assets")


def upload(args: list[str]) -> None:
    if len(args) < 4:
        refuse("incomplete rsync command")
    *options, dot, target = args[2:]
    if dot != "." or not all(OPTION.fullmatch(o) for o in options):
        refuse("unsupported rsync options")
    if not UPLOAD.fullmatch(target):
        refuse(f"upload target not allowed: {target}")
    if any(f"releases/{commit}/" == target for _, commit in history()):
        refuse("a promoted release is immutable")
    destination = os.path.join(ROOT, target.rstrip("/"))
    os.makedirs(destination, exist_ok=True)
    # rrsync sees only the destination directory, so the client's path becomes ".".
    env = {**os.environ, "SSH_ORIGINAL_COMMAND": shlex.join([*args[:-1], "."])}
    flags = ["-wo", "-no-del", "-munge"]
    if target.startswith("shared/"):
        flags.append("-no-overwrite")
    # A child process, not exec: the caller keeps holding the lock until the transfer ends.
    sys.exit(subprocess.run([RRSYNC, *flags, destination], env=env).returncode)


def promote(commit: str, run: str) -> None:
    if not COMMIT.fullmatch(commit) or not RUN.fullmatch(run):
        refuse("promote needs a 40-character commit and a run number")
    entries = history()
    highest = max((r for r, _ in entries), default=0)
    if int(run) <= highest:
        refuse(f"run {run} is not newer than run {highest}, already promoted")
    verify_release(commit)
    point_current_at(commit)
    with open(HISTORY, "a") as f:
        f.write(f"{run} {commit}\n")
    print(f"promoted {commit} (run {run})")


def rollback() -> None:
    commits = [commit for _, commit in history()]
    live = live_commit()
    if live not in commits:
        refuse("no live release to roll back from")
    index = len(commits) - 1 - commits[::-1].index(live)
    if index == 0:
        refuse("no earlier release to roll back to")
    previous = commits[index - 1]
    verify_release(previous)
    point_current_at(previous)
    print(f"rolled back to {previous}")


def main() -> None:
    command = os.environ.get("SSH_ORIGINAL_COMMAND", "")
    try:
        args = shlex.split(command)
    except ValueError:
        refuse("unreadable command")
    with open(os.path.join(ROOT, ".lock"), "w") as lock:
        # One operation at a time, transfers included, so promotion never overlaps an upload.
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args[:2] == ["rsync", "--server"]:
            upload(args)
        elif len(args) == 3 and args[0] == "promote":
            promote(args[1], args[2])
        elif args == ["rollback"]:
            rollback()
        else:
            refuse("unknown command")


if __name__ == "__main__":
    main()
