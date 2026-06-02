#!/usr/bin/env python3
"""Export a PPTX to a single LibreOffice SVG.

Input for the deck Live Preview compose pipeline (see compose_slides.py).
Mirrors the soffice invocation used by vendor/openai-slides/scripts/render_slides.py
(isolated UserInstallation profile, headless, bounded timeout) but exports SVG
instead of PDF.

Emits a single JSON line on stdout:
  {"success": true,  "svgPath": "/abs/deck.svg"}
  {"success": false, "error": "..."}

Exit code is 0 on success, 1 on failure (so the TS wrapper can degrade).
"""

import argparse
import json
import os
import shutil
import subprocess  # nosec B404
import sys
import tempfile
from pathlib import Path

# Fallback only — the TS wrapper (export-svg.ts) always passes --timeout, so
# keep this in sync with SOFFICE_TIMEOUT_SEC there if the default changes.
DEFAULT_TIMEOUT_SEC = 90


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def export_svg(pptx_path: Path, output_dir: Path, timeout_sec: int) -> Path | None:
    """Convert *pptx_path* to SVG in *output_dir*. Returns the SVG path or None."""
    output_dir.mkdir(parents=True, exist_ok=True)
    # Isolated profile dir avoids clobbering a shared LibreOffice profile and
    # prevents concurrent soffice invocations from colliding.
    with tempfile.TemporaryDirectory(prefix="soffice_profile_") as user_profile:
        cmd = [
            "soffice",
            "-env:UserInstallation=file://" + user_profile,
            "--invisible",
            "--headless",
            "--norestore",
            "--convert-to",
            "svg",
            "--outdir",
            str(output_dir),
            str(pptx_path),
        ]
        try:
            subprocess.run(  # nosec B603
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=timeout_sec,
                check=True,
            )
        except FileNotFoundError as exc:  # soffice not installed
            raise RuntimeError("soffice (LibreOffice) not found on PATH") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"soffice timed out after {timeout_sec}s") from exc
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"soffice exited with code {exc.returncode}") from exc

    svg_path = output_dir / (pptx_path.stem + ".svg")
    return svg_path if svg_path.exists() else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a PPTX to LibreOffice SVG.")
    parser.add_argument("pptx_path", help="Path to the input .pptx")
    parser.add_argument("--output_dir", required=True, help="Directory for the .svg")
    parser.add_argument(
        "--timeout", type=int, default=DEFAULT_TIMEOUT_SEC, help="soffice timeout (s)"
    )
    args = parser.parse_args()

    pptx_path = Path(args.pptx_path)
    if not pptx_path.is_file():
        _emit({"success": False, "error": f"input not found: {pptx_path}"})
        return 1

    if shutil.which("soffice") is None:
        _emit({"success": False, "error": "soffice (LibreOffice) not found on PATH"})
        return 1

    try:
        svg_path = export_svg(pptx_path, Path(args.output_dir), args.timeout)
    except RuntimeError as exc:
        _emit({"success": False, "error": str(exc)})
        return 1

    if svg_path is None:
        _emit({"success": False, "error": "soffice produced no SVG output"})
        return 1

    _emit({"success": True, "svgPath": str(svg_path)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
