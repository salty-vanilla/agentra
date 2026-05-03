#!/usr/bin/env python3
"""
detect_font.py — Detect available fonts on the system for PPTX rendering.

Usage:
    python detect_font.py [--check "Arial,Meiryo,Noto Sans JP"]

Checks font availability for slide rendering.
Returns JSON list of available/missing fonts.

This script will be fully implemented in PA-3.
Currently a placeholder that documents the expected interface.
"""

import sys
import json


def detect_fonts(font_names: list[str]) -> dict:
    """
    Check which fonts are available on the system.

    Args:
        font_names: List of font names to check

    Returns:
        dict with keys: available, missing
    """
    # PA-3: implement using fontTools or matplotlib.font_manager
    raise NotImplementedError(
        "detect_font will be implemented in PA-3."
    )


def main():
    fonts_to_check = ["Arial", "Meiryo", "Noto Sans JP", "Courier New"]

    if "--check" in sys.argv:
        idx = sys.argv.index("--check")
        if idx + 1 < len(sys.argv):
            fonts_to_check = [f.strip() for f in sys.argv[idx + 1].split(",")]

    result = detect_fonts(fonts_to_check)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
