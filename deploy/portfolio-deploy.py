#!/usr/bin/env python3
"""Forced SSH command for the portfolio deploy key.

authorized_keys on the VPS:
  command="/usr/local/bin/portfolio-deploy",restrict ssh-ed25519 AAAA... portfolio-deploy

The key can do exactly three things under PORTFOLIO_ROOT (/srv/portfolio):
  rsync uploads into shared/_next/static/ or releases/<commit>/ (through rrsync, no deletes)
  promote <commit> <run>   verify a release, then atomically point `current` at it
  rollback                 point `current` back at the previous promoted release
There is no shell, no other path and no other command.
"""

import fcntl
import os
import re
import shlex
import sys

ROOT = os.environ.get("PORTFOLIO_ROOT", "/srv/portfolio")
RRSYNC = os.environ.get("PORTFOLIO_RRSYNC", "/usr/bin/rrsync")
COMMIT = re.compile(r"[0-9a-f]{40}")
RUN = re.compile(r"[1-9][0-9]{0,9}")
UPLOAD = re.compile(r"(shared/_next/static|releases/[0-9a-f]{40})/")
HISTORY = os.path.join(ROOT, "history")


def refuse(reason: str) -> None:
    print(f"refused: {reason}", file=sys.stderr)
    sys.exit(1)


def history() -> list[tuple[int, str]]:
    try:
        with open(HISTORY) as f:
            return [(int(run), commit) for run, commit in (line.split() for line in f if line.strip())]
    except FileNotFoundError:
        return []


def write_history(entries: list[tuple[int, str]]) -> None:
    tmp = HISTORY + ".tmp"
    with open(tmp, "w") as f:
        f.writelines(f"{run} {commit}\n" for run, commit in entries)
    os.replace(tmp, HISTORY)


def point_current_at(commit: str) -> None:
    # A relative symlink renamed over the old one: readers see the old release or the new one, never neither.
    tmp = os.path.join(ROOT, ".current.tmp")
    if os.path.lexists(tmp):
        os.remove(tmp)
    os.symlink(f"releases/{commit}", tmp)
    os.replace(tmp, os.path.join(ROOT, "current"))


def verify_release(commit: str) -> None:
    release = os.path.join(ROOT, "releases", commit)
    if os.path.islink(release) or not os.path.isdir(release):
        refuse(f"release {commit} was not uploaded")
    for page in ("index.html", "404.html"):
        if not os.path.isfile(os.path.join(release, page)):
            refuse(f"release {commit} has no {page}")
    # Hashed assets are served from shared/, so every asset of the release must already be there.
    static = os.path.join(release, "_next", "static")
    for folder, _, files in os.walk(static):
        for name in files:
            relative = os.path.relpath(os.path.join(folder, name), static)
            shared = os.path.join(ROOT, "shared", "_next", "static", relative)
            if not os.path.isfile(shared) or os.path.getsize(shared) != os.path.getsize(os.path.join(static, relative)):
                refuse(f"shared asset missing or different: {relative}")


def upload(command: str, args: list[str]) -> None:
    if any(a.startswith(("--delete", "--remove")) for a in args):
        refuse("deleting is not allowed")
    target = args[-1]
    if not UPLOAD.fullmatch(target):
        refuse(f"upload target not allowed: {target}")
    if any(f"releases/{commit}/" == target for _, commit in history()):
        refuse("a promoted release is immutable")
    os.environ["SSH_ORIGINAL_COMMAND"] = command
    os.execv(RRSYNC, [RRSYNC, "-wo", "-no-del", ROOT])


def promote(commit: str, run: str) -> None:
    if not COMMIT.fullmatch(commit) or not RUN.fullmatch(run):
        refuse("promote needs a 40-character commit and a run number")
    entries = history()
    if entries and int(run) <= entries[-1][0]:
        refuse(f"run {run} is not newer than the live run {entries[-1][0]}")
    verify_release(commit)
    point_current_at(commit)
    write_history([*entries, (int(run), commit)])
    print(f"promoted {commit} (run {run})")


def rollback() -> None:
    entries = history()
    if len(entries) < 2:
        refuse("no previous release to roll back to")
    previous = entries[-2][1]
    verify_release(previous)
    point_current_at(previous)
    write_history(entries[:-1])
    print(f"rolled back to {previous}")


def main() -> None:
    command = os.environ.get("SSH_ORIGINAL_COMMAND", "")
    try:
        args = shlex.split(command)
    except ValueError:
        refuse("unreadable command")
    with open(os.path.join(ROOT, ".lock"), "w") as lock:
        # One operation at a time, so promotions are serialized.
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args[:2] == ["rsync", "--server"]:
            upload(command, args)
        elif len(args) == 3 and args[0] == "promote":
            promote(args[1], args[2])
        elif args == ["rollback"]:
            rollback()
        else:
            refuse("unknown command")


if __name__ == "__main__":
    main()
