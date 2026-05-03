#!/usr/bin/env python3
"""
ensure_raster_image.py — Ensure an image is in raster format (PNG/JPEG).

Usage:
    python ensure_raster_image.py <input_image> <output.png>

Converts SVG or other vector formats to raster PNG.
Passes through existing raster images with optional resize.

Requires: Pillow, cairosvg (optional for SVG)

This script will be fully implemented in PA-3.
Currently a placeholder that documents the expected interface.
"""

import sys
import os


def ensure_raster_image(
    input_path: str, output_path: str, max_width: int = 1920
) -> str:
    """
    Convert input image to raster PNG format.

    Args:
        input_path: Path to input image (PNG, JPEG, SVG, etc.)
        output_path: Path for output PNG file
        max_width: Maximum output width in pixels

    Returns:
        Path to the output raster image
    """
    # PA-3: implement using Pillow + optional cairosvg
    raise NotImplementedError(
        "ensure_raster_image will be implemented in PA-3. Requires Pillow."
    )


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input_image> <output.png>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found")
        sys.exit(1)

    result = ensure_raster_image(input_path, output_path)
    print(f"Raster image: {result}")


if __name__ == "__main__":
    main()
