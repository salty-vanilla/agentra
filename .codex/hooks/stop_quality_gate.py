#!/usr/bin/env python3
"""Run repo-local quality gates before Codex stops."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from shutil import which


def emit(payload: dict[str, object]) -> None:
    json.dump(payload, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


def resolve_quality_gate_mode(raw: str | None = None) -> str:
    normalized = (raw if raw is not None else os.environ.get("AGENTRA_STOP_QUALITY_GATE", "off")).strip().lower()
    if normalized in {"", "off"}:
        return "off"
    if normalized == "changed":
        return "changed"
    if normalized == "full":
        return "full"
    return "off"


def repo_root() -> Path:
    repo_root_result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=False,
        capture_output=True,
        text=True,
    )
    if repo_root_result.returncode != 0:
        raise RuntimeError(repo_root_result.stderr.strip() or "Failed to resolve repo root.")
    return Path(repo_root_result.stdout.strip())


def parse_status_paths(status_output: str) -> list[str]:
    paths: list[str] = []
    for raw_line in status_output.splitlines():
        if not raw_line:
            continue
        path = raw_line[3:] if len(raw_line) > 3 else raw_line
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if path:
            paths.append(path)
    return paths


def collect_changed_paths(root: Path) -> list[str]:
    status_result = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    if status_result.returncode != 0:
        raise RuntimeError(status_result.stderr.strip() or "Failed to collect changed files.")

    existing_paths: list[str] = []
    for path in parse_status_paths(status_result.stdout):
        if (root / path).exists():
            existing_paths.append(path)
    return existing_paths


def should_run_guardrail_self_test(paths: list[str]) -> bool:
    relevant_exact = {
        ".codex/hooks.json",
        ".codex/config.toml",
        ".env.example",
    }
    return any(path in relevant_exact or path.startswith(".codex/") or path.startswith("scripts/agent/") for path in paths)


def changed_mode_commands(paths: list[str]) -> list[list[str]]:
    commands: list[list[str]] = []
    if paths:
        commands.append(["pnpm", "biome", "check", "--no-errors-on-unmatched", *paths])
    if should_run_guardrail_self_test(paths):
        commands.append(["python3", "scripts/agent/codex_guardrails.py", "--self-test"])
    return commands


def ensure_node_22() -> str | None:
    node_path = which("node")
    if not node_path:
        return "Node.js is not available on PATH. Install Node 22+ and try again."

    node_version_result = subprocess.run(
        [node_path, "-p", "process.versions.node"],
        check=False,
        capture_output=True,
        text=True,
    )
    if node_version_result.returncode != 0:
        return node_version_result.stderr.strip() or "Failed to detect Node.js version."

    version = node_version_result.stdout.strip()
    version_parts = version.split(".")
    try:
        major = int(version_parts[0])
    except (IndexError, ValueError):
        return f"Could not parse Node.js version: {version!r}"

    if major < 22:
        return f"Node.js {version} is too old for this repo. Use Node 22+."
    return None


def run_commands(commands: list[list[str]], root: Path) -> list[str]:
    failures: list[str] = []
    for command in commands:
        completed = subprocess.run(
            command,
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            stderr = completed.stderr.strip()
            stdout = completed.stdout.strip()
            details = stderr or stdout or f"exit code {completed.returncode}"
            failures.append(f"{' '.join(command)} failed: {details}")
    return failures


def assert_equal(actual: object, expected: object, message: str) -> None:
    if actual != expected:
        raise AssertionError(f"{message}: expected {expected!r}, got {actual!r}")


def self_test() -> int:
    assert_equal(resolve_quality_gate_mode(None), "off", "Default quality gate mode should be off")
    assert_equal(resolve_quality_gate_mode("changed"), "changed", "changed mode should resolve")
    assert_equal(resolve_quality_gate_mode("full"), "full", "full mode should resolve")

    parsed = parse_status_paths(" M .codex/hooks.json\nR  old.ts -> new.ts\n?? scripts/agent/codex_guardrails.py\n")
    assert_equal(
        parsed,
        [".codex/hooks.json", "new.ts", "scripts/agent/codex_guardrails.py"],
        "Status parsing should preserve changed targets",
    )
    assert_equal(should_run_guardrail_self_test(["docs/readme.md"]), False, "Docs-only changes should skip guardrail self-test")
    assert_equal(
        should_run_guardrail_self_test(["scripts/agent/codex_guardrails.py"]),
        True,
        "Guardrail script changes should run self-test",
    )
    assert_equal(
        changed_mode_commands(["docs/development/codex-config.md"]),
        [["pnpm", "biome", "check", "--no-errors-on-unmatched", "docs/development/codex-config.md"]],
        "changed mode should run changed-file biome",
    )
    assert_equal(
        changed_mode_commands([".codex/hooks.json"]),
        [
            ["pnpm", "biome", "check", "--no-errors-on-unmatched", ".codex/hooks.json"],
            ["python3", "scripts/agent/codex_guardrails.py", "--self-test"],
        ],
        "Guardrail changes should add guardrail self-test",
    )
    print("stop_quality_gate self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

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

    try:
        mode = resolve_quality_gate_mode()
        if mode == "off":
            emit({})
            return 0

        root = repo_root()
        if mode == "changed":
            paths = collect_changed_paths(root)
            if not paths:
                emit({})
                return 0
            commands = changed_mode_commands(paths)
        else:
            commands = [
                ["pnpm", "typecheck"],
                ["pnpm", "biome", "check", "."],
            ]

        if any(command[0] == "pnpm" for command in commands):
            node_error = ensure_node_22()
            if node_error:
                emit({"decision": "block", "reason": node_error})
                return 0

        failures = run_commands(commands, root)
    except RuntimeError as exc:
        emit({"decision": "block", "reason": str(exc)})
        return 0

    if failures:
        emit(
            {
                "decision": "block",
                "reason": "Quality gate failed. Fix the following and let Codex stop again: " + " | ".join(failures),
                "systemMessage": "Stop hook blocked completion until the configured checks pass.",
            }
        )
        return 0

    emit({})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
