#!/usr/bin/env python3
"""
create_montage.py — Create a contact sheet (montage) from rendered slide PNGs.

Usage:
    python create_montage.py <slides_dir> <output.png> [--cols 3]

Requires: Pillow

This script will be fully implemented in PA-3.
Currently a placeholder that documents the expected interface.
"""

import sys
import os


def create_montage(
    slides_dir: str, output_path: str, cols: int = 3, thumb_width: int = 400
) -> str:
    """
    Create a montage image from slide PNG files.

    Args:
        slides_dir: Directory containing slide_001.png, slide_002.png, ...
        output_path: Path for the output montage image
        cols: Number of columns in the grid
        thumb_width: Width of each thumbnail in pixels

    Returns:
        Path to the created montage image
    """
    # PA-3: implement using Pillow
    raise NotImplementedError(
        "create_montage will be implemented in PA-3. Requires Pillow."
    )


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <slides_dir> <output.png> [--cols 3]")
        sys.exit(1)

    slides_dir = sys.argv[1]
    output_path = sys.argv[2]
    cols = 3

    if "--cols" in sys.argv:
        idx = sys.argv.index("--cols")
        if idx + 1 < len(sys.argv):
            cols = int(sys.argv[idx + 1])

    result = create_montage(slides_dir, output_path, cols)
    print(f"Montage created: {result}")


if __name__ == "__main__":
    main()
