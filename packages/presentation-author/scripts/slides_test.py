#!/usr/bin/env python3
"""
slides_test.py — Validate a PPTX file for common issues.

Usage:
    python slides_test.py <input.pptx>

Checks:
    - File exists and is valid PPTX
    - At least one slide
    - No empty slides
    - Font sizes within acceptable range
    - Slide count within limits

Requires: python-pptx

This script will be fully implemented in PA-3.
Currently a placeholder that documents the expected interface.
"""

import sys
import os


def validate_presentation(pptx_path: str) -> dict:
    """
    Validate a PPTX presentation.

    Args:
        pptx_path: Path to .pptx file

    Returns:
        dict with keys: valid, warnings, errors, slide_count
    """
    # PA-3: implement using python-pptx
    raise NotImplementedError(
        "slides_test will be implemented in PA-3. Requires python-pptx."
    )


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input.pptx>")
        sys.exit(1)

    pptx_path = sys.argv[1]
    if not os.path.exists(pptx_path):
        print(f"Error: {pptx_path} not found")
        sys.exit(1)

    result = validate_presentation(pptx_path)
    if result["valid"]:
        print(f"PASS: {result['slide_count']} slides")
    else:
        print(f"FAIL: {'; '.join(result['errors'])}")
        sys.exit(1)

    if result.get("warnings"):
        for w in result["warnings"]:
            print(f"  WARN: {w}")


if __name__ == "__main__":
    main()
