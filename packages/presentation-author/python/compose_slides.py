#!/usr/bin/env python3
"""Split a LibreOffice SVG into per-slide compose JSON + shared defs JSON.

Adapted from aws-samples/sample-spec-driven-presentation-maker (MIT-0),
`mcp-server/tools/compose.py`. Changes for Agentra:
  - Hardened PNG→WebP conversion (never crashes a slide on a bad image).
  - Every component carries `changed: false` (MVP has no diff/animation).
  - CLI: iterates content slide groups (SVG group index 0 is structural — the
    first content slide is group 1; verified in spike #383) and writes
    `defs.json` + `<slug>.compose.json` into an output dir.

Emits a single JSON line on stdout:
  {"success": true, "count": 7, "defsPath": ".../defs.json",
   "slides": [{"slug": "slide-1", "index": 1, "composePath": ".../slide-1.compose.json"}, ...],
   "warnings": [...]}
"""

import argparse
import base64
import io
import json
import re
import sys
from pathlib import Path

from lxml import etree
from PIL import Image

SVG_NS = "http://www.w3.org/2000/svg"
OOO_NS = "http://xml.openoffice.org/svg/export"
_PNG_B64_RE = re.compile(r"data:image/png;base64,([A-Za-z0-9+/=]+)")

COMPOSE_VERSION = 1
WEBP_QUALITY = 80

# Defense in depth: the SVG is produced by our own soffice from our own PPTX, but
# disable external entity / network resolution so a crafted DOCTYPE cannot trigger
# file disclosure or SSRF if an untrusted SVG ever reaches this parser.
_SAFE_PARSER = etree.XMLParser(resolve_entities=False, no_network=True)


def _parse(svg_path: Path) -> etree._ElementTree:
    return etree.parse(str(svg_path), _SAFE_PARSER)


def _png_to_webp_b64(match: re.Match) -> str:
    """Convert a base64 PNG data-uri to WebP. On any failure, keep the original.

    SDPM's original raised on malformed PNGs and lost the whole slide; we degrade
    to the source data-uri instead (spike #383 finding).
    """
    try:
        png_data = base64.b64decode(match.group(1))
        img = Image.open(io.BytesIO(png_data))
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=WEBP_QUALITY)
        return f"data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception:  # noqa: BLE001 — never let one bad image break compose
        return match.group(0)


def _convert_images(svg_str: str) -> str:
    return _PNG_B64_RE.sub(_png_to_webp_b64, svg_str)


def _strip_fonts(defs_el: etree._Element) -> None:
    for font in defs_el.findall(f".//{{{SVG_NS}}}font"):
        font.getparent().remove(font)


def count_slides(svg_path: Path) -> int:
    """Return the number of slide groups in a LibreOffice SVG (incl. structural)."""
    root = _parse(svg_path).getroot()
    return len(root.findall(f".//{{{SVG_NS}}}g[@class='Slide']"))


def extract_optimized_defs(svg_path: Path) -> dict:
    """Extract shared defs: strip SVG fonts, convert PNG→WebP."""
    tree = _parse(svg_path)
    root = tree.getroot()
    defs_elements = root.findall(f"{{{SVG_NS}}}defs")
    for d in defs_elements:
        _strip_fonts(d)
    defs_svg = "".join(etree.tostring(d, encoding="unicode") for d in defs_elements)
    return {"version": COMPOSE_VERSION, "defs": _convert_images(defs_svg)}


def split_slide_components(svg_path: Path, slide_num: int) -> dict:
    """Split one slide group into component fragments with metadata (defs excluded).

    `slide_num` is the SVG slide-group index (1-based for content; 0 is structural).
    """
    tree = _parse(svg_path)
    root = tree.getroot()
    view_box = root.get("viewBox", "0 0 33867 19050")

    slides = root.findall(f".//{{{SVG_NS}}}g[@class='Slide']")
    if slide_num >= len(slides):
        raise ValueError(f"Slide {slide_num} not found (total: {len(slides) - 1})")

    page_g = slides[slide_num].find(f"{{{SVG_NS}}}g[@class='Page']")
    if page_g is None:
        raise ValueError("No Page group found")

    bg_fill = "#000"
    bg_svg = None

    slide_bg_defs = page_g.find(f"{{{SVG_NS}}}defs[@class='SlideBackground']")
    if slide_bg_defs is not None:
        parts = []
        for child in slide_bg_defs:
            cls = child.get("class", "")
            if cls in ("Background", "BackgroundObjects"):
                parts.append(etree.tostring(child, encoding="unicode"))
                if cls == "Background":
                    for el in child.iter():
                        f = el.get("fill")
                        if f and f != "none":
                            bg_fill = f
                            break
        if parts:
            bg_svg = _convert_images("\n".join(parts))

    if bg_svg is None:
        meta_slides = root.find(f".//{{{SVG_NS}}}g[@id='ooo:meta_slides']")
        if meta_slides is not None:
            meta = meta_slides.find(
                f".//{{{SVG_NS}}}g[@id='ooo:meta_slide_{slide_num - 1}']"
            )
            if meta is not None:
                master_id = meta.get(f"{{{OOO_NS}}}master", "")
                if master_id:
                    master_g = root.find(f".//*[@id='{master_id}']")
                    if master_g is not None:
                        parts = []
                        bg_g = master_g.find(f"{{{SVG_NS}}}g[@class='Background']")
                        if bg_g is not None:
                            parts.append(etree.tostring(bg_g, encoding="unicode"))
                            for el in bg_g.iter():
                                f = el.get("fill")
                                if f and f != "none":
                                    bg_fill = f
                                    break
                        bo_g = master_g.find(f"{{{SVG_NS}}}g[@class='BackgroundObjects']")
                        if bo_g is not None:
                            for child in bo_g:
                                if child.get("visibility") != "hidden":
                                    parts.append(etree.tostring(child, encoding="unicode"))
                        if parts:
                            bg_svg = _convert_images("\n".join(parts))

    components = []
    for shape_g in page_g:
        if shape_g.tag != f"{{{SVG_NS}}}g":
            continue
        cls = shape_g.get("class", "")
        bbox_el = shape_g.find(f".//{{{SVG_NS}}}rect[@class='BoundingBox']")
        bbox = None
        if bbox_el is not None:
            bbox = {
                "x": float(bbox_el.get("x", 0)),
                "y": float(bbox_el.get("y", 0)),
                "w": float(bbox_el.get("width", 0)),
                "h": float(bbox_el.get("height", 0)),
            }
        text_el = shape_g.find(f".//{{{SVG_NS}}}text")
        text = ""
        if text_el is not None:
            text = "".join(text_el.itertext()).strip()[:80]
        components.append({
            "class": cls,
            "bbox": bbox,
            "text": text,
            "svg": _convert_images(etree.tostring(shape_g, encoding="unicode")),
            # MVP: no diff/animation — always false (spike #383).
            "changed": False,
        })

    return {
        "version": COMPOSE_VERSION,
        "viewBox": view_box,
        "bgFill": bg_fill,
        "bgSvg": bg_svg,
        "components": components,
    }


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser(description="Split LibreOffice SVG to compose/defs JSON.")
    parser.add_argument("svg_path", help="Path to the LibreOffice SVG")
    parser.add_argument("--output_dir", required=True, help="Directory for output JSON")
    parser.add_argument(
        "--slugs",
        default="",
        help="Comma-separated slugs for content slides (1..N). Defaults to slide-N.",
    )
    args = parser.parse_args()

    svg_path = Path(args.svg_path)
    if not svg_path.is_file():
        _emit({"success": False, "error": f"svg not found: {svg_path}"})
        return 1

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    slugs = [s for s in args.slugs.split(",") if s] if args.slugs else []
    warnings: list[str] = []

    try:
        total = count_slides(svg_path)
    except Exception as exc:  # noqa: BLE001 — surface a structured error
        _emit({"success": False, "error": f"failed to parse svg: {exc}"})
        return 1

    # Shared defs (deck-wide).
    try:
        defs = extract_optimized_defs(svg_path)
        defs_path = output_dir / "defs.json"
        defs_path.write_text(json.dumps(defs, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        _emit({"success": False, "error": f"failed to extract defs: {exc}"})
        return 1

    # Content slide groups are 1..total-1 (group 0 is structural — spike #383).
    slides_out = []
    for pn in range(1, total):
        slug = slugs[pn - 1] if pn - 1 < len(slugs) else f"slide-{pn}"
        try:
            compose = split_slide_components(svg_path, pn)
        except Exception as exc:  # noqa: BLE001 — skip one bad slide, keep the rest
            warnings.append(f"slide {pn} ({slug}) failed: {exc}")
            continue
        compose_path = output_dir / f"{slug}.compose.json"
        compose_path.write_text(json.dumps(compose, ensure_ascii=False), encoding="utf-8")
        slides_out.append({"slug": slug, "index": pn, "composePath": str(compose_path)})

    _emit({
        "success": True,
        "count": len(slides_out),
        "defsPath": str(output_dir / "defs.json"),
        "slides": slides_out,
        "warnings": warnings,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
