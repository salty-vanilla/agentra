import { cp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createDefaultLocalIconProvider } from './icon-provider.js';
import type { IconCopyResult, IconManifest, IconProvider } from './types.js';

const WORKSPACE_ICON_DIR = 'assets/icons';
const ICON_HELPER_NAME = 'icons.js';

export async function copyIconsToWorkspace(input: {
  workDir: string;
  iconIds?: string[] | undefined;
  provider?: IconProvider | undefined;
}): Promise<IconCopyResult> {
  const warnings: string[] = [];
  const provider = input.provider ?? createDefaultLocalIconProvider();
  const manifest = provider.getManifest();
  const providerId = provider.id;

  // Determine which icons to copy
  const allIds = provider.getAllIds();
  const requestedIds = input.iconIds ?? allIds;

  const workspaceIconDir = join(input.workDir, WORKSPACE_ICON_DIR);
  const providerSubdir = providerId === 'lucide-local' ? 'lucide' : providerId;
  const workspaceProviderDir = join(workspaceIconDir, providerSubdir);
  await mkdir(workspaceProviderDir, { recursive: true });

  const copiedIcons: IconCopyResult['copiedIcons'] = [];

  for (const id of requestedIds) {
    const resolved = provider.resolve(id);
    if (!resolved) {
      warnings.push(`Unknown icon id: ${id}`);
      continue;
    }

    const iconEntry = manifest.icons.find((i) => i.id === id);
    if (!iconEntry) continue;

    const src = resolved.path;
    const dest = join(workspaceProviderDir, `${id}.svg`);

    try {
      await cp(src, dest);

      copiedIcons.push({
        ...resolved,
        workspacePath: `${providerSubdir}/${id}.svg`,
      });
    } catch (err) {
      warnings.push(
        `Failed to copy icon "${id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Write workspace manifest with workspacePath
  const workspaceManifest: IconManifest & { icons: Array<{ workspacePath?: string }> } = {
    provider: manifest.provider,
    version: manifest.version,
    style: manifest.style,
    license: manifest.license,
    icons: copiedIcons.map((icon) => {
      const original = manifest.icons.find((i) => i.id === icon.id);
      return {
        id: icon.id,
        label: icon.label,
        path: icon.workspacePath ?? `${providerSubdir}/${icon.id}.svg`,
        workspacePath: icon.workspacePath ?? `${providerSubdir}/${icon.id}.svg`,
        keywords: original?.keywords ?? [],
      };
    }),
  };

  const manifestPath = join(workspaceIconDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(workspaceManifest, null, 2), 'utf-8');

  // Write JS helper into workspace
  const helpersDir = join(input.workDir, 'helpers');
  await mkdir(helpersDir, { recursive: true });
  const helperDest = join(helpersDir, ICON_HELPER_NAME);
  // Resolve @resvg/resvg-js absolute path so the helper can require it at runtime
  const require_ = createRequire(import.meta.url);
  let resvgModulePath: string;
  try {
    resvgModulePath = require_.resolve('@resvg/resvg-js');
  } catch {
    resvgModulePath = '@resvg/resvg-js'; // fallback — may work if NODE_PATH covers it
  }
  await writeFile(helperDest, generateIconHelperSource(resvgModulePath), 'utf-8');

  return {
    copiedIcons,
    workspaceIconDir,
    manifestPath,
    warnings,
  };
}

export function generateIconHelperSource(resvgModulePath?: string): string {
  const resvgRequire = resvgModulePath
    ? JSON.stringify(resvgModulePath)
    : '"@resvg/resvg-js"';

  return `"use strict";
const path = require("node:path");
const fs = require("node:fs");
var Resvg;
try { Resvg = require(${resvgRequire}).Resvg; } catch(e) { Resvg = null; }
const ICONS = require("../assets/icons/manifest.json");

/**
 * Find an icon by ID or keyword.
 * @param {string} idOrKeyword - Icon ID or keyword to search for
 * @returns {object|null} Icon manifest entry or null
 */
function findIcon(idOrKeyword) {
  const q = String(idOrKeyword || "").toLowerCase();
  const icons = ICONS.icons || [];

  return (
    icons.find(function (icon) { return icon.id === q; }) ||
    icons.find(function (icon) {
      return icon.keywords && icon.keywords.some(function (kw) {
        return String(kw).toLowerCase() === q;
      });
    }) ||
    icons.find(function (icon) {
      return icon.id.includes(q) || (icon.label && icon.label.toLowerCase().includes(q));
    }) ||
    null
  );
}

/**
 * Get the workspace-relative path for an icon SVG.
 * @param {string} idOrKeyword - Icon ID or keyword
 * @returns {string|null} Relative path or null
 */
function getIconPath(idOrKeyword) {
  var icon = findIcon(idOrKeyword);
  if (!icon) return null;
  var iconPath = "./assets/icons/" + (icon.workspacePath || icon.path);
  return iconPath;
}

/**
 * Render an SVG icon to PNG and return as base64 data URI.
 * Replaces stroke="currentColor" with the given strokeColor.
 * Falls back to raw SVG data URI if resvg is unavailable.
 * @param {string} idOrKeyword - Icon ID or keyword
 * @param {object} [styleOpts] - { strokeColor: "#hex" }
 * @returns {string|null} Data URI string or null
 */
function getIconDataUri(idOrKeyword, styleOpts) {
  var iconPath = getIconPath(idOrKeyword);
  if (!iconPath) return null;
  var fullPath = path.join(__dirname, "..", iconPath);
  try {
    var raw = fs.readFileSync(fullPath, "utf-8");
    var strokeColor = (styleOpts && styleOpts.strokeColor) || "#333333";
    var svg = raw.replace(/stroke="currentColor"/g, 'stroke="' + strokeColor + '"');
    svg = svg.replace(/width="d+"/, 'width="128"');
    svg = svg.replace(/height="d+"/, 'height="128"');

    if (Resvg) {
      var resvg = new Resvg(svg, { fitTo: { mode: "width", value: 128 }, background: "rgba(0,0,0,0)" });
      var pngBuf = Buffer.from(resvg.render().asPng());
      return "data:image/png;base64," + pngBuf.toString("base64");
    }
    // Fallback: raw SVG (may not render in all PPTX viewers)
    return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  } catch (e) {
    return null;
  }
}

/**
 * Add an icon to a PptxGenJS slide.
 * @param {object} slide - PptxGenJS slide object
 * @param {string} idOrKeyword - Icon ID or keyword
 * @param {object} options - { x, y, w, h, transparency, strokeColor }
 * @returns {boolean} true if icon was added, false if not found
 */
function addIcon(slide, idOrKeyword, options) {
  var styleOpts = options.strokeColor ? { strokeColor: options.strokeColor } : undefined;
  var dataUri = getIconDataUri(idOrKeyword, styleOpts);
  if (!dataUri) return false;

  var opts = {
    data: dataUri,
    x: options.x,
    y: options.y,
    w: options.w || 0.35,
    h: options.h || 0.35,
  };
  if (options.transparency != null) {
    opts.transparency = options.transparency;
  }

  slide.addImage(opts);
  return true;
}

module.exports = {
  ICONS: ICONS,
  findIcon: findIcon,
  getIconPath: getIconPath,
  getIconDataUri: getIconDataUri,
  addIcon: addIcon,
};
`;
}
