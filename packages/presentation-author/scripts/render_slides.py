#!/usr/bin/env python3
"""
render_slides.py — Render PPTX slides to PNG images.

Usage:
    python render_slides.py <input.pptx> <output_dir> [--dpi 150]

Requires: python-pptx, Pillow (or LibreOffice headless)

This script will be fully implemented in PA-3.
Currently a placeholder that documents the expected interface.
"""

import sys
import os
from pathlib import Path


def render_slides(pptx_path: str, output_dir: str, dpi: int = 150) -> list[str]:
    """
    Render each slide in the PPTX to a PNG file.

    Args:
        pptx_path: Path to input .pptx file
        output_dir: Directory to write slide_001.png, slide_002.png, ...
        dpi: Resolution for rendering

    Returns:
        List of output PNG file paths
    """
    # PA-3: implement using LibreOffice headless or python-pptx + Pillow
    raise NotImplementedError(
        "render_slides will be implemented in PA-3. "
        "Requires LibreOffice headless or equivalent renderer."
    )


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input.pptx> <output_dir> [--dpi 150]")
        sys.exit(1)

    pptx_path = sys.argv[1]
    output_dir = sys.argv[2]
    dpi = 150

    if "--dpi" in sys.argv:
        idx = sys.argv.index("--dpi")
        if idx + 1 < len(sys.argv):
            dpi = int(sys.argv[idx + 1])

    if not os.path.exists(pptx_path):
        print(f"Error: {pptx_path} not found")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)
    paths = render_slides(pptx_path, output_dir, dpi)
    for p in paths:
        print(p)


if __name__ == "__main__":
    main()
