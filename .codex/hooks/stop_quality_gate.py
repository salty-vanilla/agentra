#!/usr/bin/env python3
"""Run repo-local quality gates before Codex stops."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from shutil import which


def emit(payload: dict[str, object]) -> None:
    json.dump(payload, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


def main() -> int:
    try:
        json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        emit(
            {
                "decision": "block",
                "reason": f"Invalid hook input: {exc.msg}",
            }
        )
        return 0

    repo_root_result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=False,
        capture_output=True,
        text=True,
    )
    if repo_root_result.returncode != 0:
        reason = repo_root_result.stderr.strip() or "Failed to resolve repo root."
        emit({"decision": "block", "reason": reason})
        return 0

    repo_root = Path(repo_root_result.stdout.strip())

    node_path = which("node")
    if not node_path:
        emit(
            {
                "decision": "block",
                "reason": "Node.js is not available on PATH. Install Node 22+ and try again.",
            }
        )
        return 0

    node_version_result = subprocess.run(
        [node_path, "-p", "process.versions.node"],
        check=False,
        capture_output=True,
        text=True,
    )
    if node_version_result.returncode != 0:
        reason = node_version_result.stderr.strip() or "Failed to detect Node.js version."
        emit({"decision": "block", "reason": reason})
        return 0

    version_parts = node_version_result.stdout.strip().split(".")
    try:
        major = int(version_parts[0])
    except (IndexError, ValueError):
        emit(
            {
                "decision": "block",
                "reason": f"Could not parse Node.js version: {node_version_result.stdout.strip()!r}",
            }
        )
        return 0

    if major < 22:
        emit(
            {
                "decision": "block",
                "reason": (
                    f"Node.js {node_version_result.stdout.strip()} is too old for this repo. "
                    "Use Node 22+ so pnpm typecheck can run successfully."
                ),
            }
        )
        return 0

    commands = [
        ["pnpm", "typecheck"],
        ["pnpm", "biome", "check", "."],
    ]

    failures: list[str] = []
    for command in commands:
        completed = subprocess.run(
            command,
            cwd=repo_root,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            stderr = completed.stderr.strip()
            stdout = completed.stdout.strip()
            details = stderr or stdout or f"exit code {completed.returncode}"
            failures.append(f"{' '.join(command)} failed: {details}")

    if failures:
        emit(
            {
                "decision": "block",
                "reason": "Quality gate failed. Fix the following and let Codex stop again: "
                + " | ".join(failures),
                "systemMessage": "Stop hook blocked completion until typecheck and biome pass.",
            }
        )
        return 0

    emit({})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
