import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBrandFrameTemplateDir, loadBrandFrame } from './registry.js';
import type { BrandFrame } from './types.js';

const BRAND_FRAME_WORKSPACE_DIR = 'assets/brand-frame';
const BRAND_FRAME_HELPER_NAME = 'brand-frame.js';

export async function copyBrandFrameToWorkspace(input: {
  brandFrameId?: string;
  workDir: string;
}): Promise<{
  brandFrame: BrandFrame;
  workspaceAssetDir: string;
  manifestPath: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const brandFrame = await loadBrandFrame(input.brandFrameId);
  const templateDir = getBrandFrameTemplateDir(brandFrame.id);
  const workspaceAssetDir = join(input.workDir, BRAND_FRAME_WORKSPACE_DIR);

  await mkdir(workspaceAssetDir, { recursive: true });

  // Copy manifest
  const manifestPath = join(workspaceAssetDir, 'manifest.json');
  const manifestSrc = join(templateDir, 'manifest.json');
  try {
    const manifestContent = await readFile(manifestSrc, 'utf-8');
    await writeFile(manifestPath, manifestContent, 'utf-8');
  } catch (err) {
    warnings.push(
      `Failed to copy BrandFrame manifest: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Copy image assets referenced in manifest
  const imageFiles: string[] = [];
  if (brandFrame.header?.imagePath) imageFiles.push(brandFrame.header.imagePath);
  if (brandFrame.footer?.imagePath) imageFiles.push(brandFrame.footer.imagePath);

  for (const imageFile of imageFiles) {
    const src = join(templateDir, imageFile);
    const dest = join(workspaceAssetDir, imageFile);
    try {
      await cp(src, dest);
    } catch (err) {
      warnings.push(
        `Failed to copy BrandFrame asset "${imageFile}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Write the JS helper into the workspace
  const helpersDir = join(input.workDir, 'helpers');
  await mkdir(helpersDir, { recursive: true });
  const helperDest = join(helpersDir, BRAND_FRAME_HELPER_NAME);
  await writeFile(helperDest, generateBrandFrameHelperSource(), 'utf-8');

  return {
    brandFrame,
    workspaceAssetDir,
    manifestPath,
    warnings,
  };
}

export function generateBrandFrameHelperSource(): string {
  return `"use strict";
const fs = require("fs");
const path = require("path");
const BRAND_FRAME = require("../assets/brand-frame/manifest.json");

// Pre-load images as base64 data URIs so they embed reliably into the PPTX.
function loadImageAsDataUri(imagePath) {
  const fullPath = path.join(__dirname, "..", "assets", "brand-frame", imagePath);
  const buf = fs.readFileSync(fullPath);
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/" + ext;
  return "data:" + mime + ";base64," + buf.toString("base64");
}

const headerDataUri = BRAND_FRAME.header ? loadImageAsDataUri(BRAND_FRAME.header.imagePath) : null;
const footerDataUri = BRAND_FRAME.footer ? loadImageAsDataUri(BRAND_FRAME.footer.imagePath) : null;

/**
 * Apply brand frame images to a slide.
 * @param {object} slide - PptxGenJS slide object
 * @param {object} [options] - { header: true/false, footer: true/false, pageNumber: number|null }
 *   Defaults to { header: true, footer: true, pageNumber: null }.
 */
function applyBrandFrame(slide, options) {
  const opts = Object.assign({ header: true, footer: true, pageNumber: null }, options);

  if (opts.header && BRAND_FRAME.header && headerDataUri) {
    slide.addImage({
      data: headerDataUri,
      x: BRAND_FRAME.header.x,
      y: BRAND_FRAME.header.y,
      w: BRAND_FRAME.header.width,
      h: BRAND_FRAME.header.height,
    });

    // Page number on the right end of the header
    if (opts.pageNumber != null) {
      slide.addText(String(opts.pageNumber), {
        x: BRAND_FRAME.header.width - 0.8,
        y: BRAND_FRAME.header.y,
        w: 0.7,
        h: BRAND_FRAME.header.height,
        align: "right",
        valign: "middle",
        fontSize: 12,
        color: "FFFFFF",
        bold: false,
      });
    }
  }

  if (opts.footer && BRAND_FRAME.footer && footerDataUri) {
    slide.addImage({
      data: footerDataUri,
      x: BRAND_FRAME.footer.x,
      y: BRAND_FRAME.footer.y,
      w: BRAND_FRAME.footer.width,
      h: BRAND_FRAME.footer.height,
    });
  }
}

function getSafeArea() {
  return BRAND_FRAME.safeArea;
}

function getSlideSize() {
  return BRAND_FRAME.slideSize;
}

function getHeaderArea() {
  return BRAND_FRAME.header || null;
}

module.exports = {
  BRAND_FRAME,
  applyBrandFrame,
  getSafeArea,
  getSlideSize,
  getHeaderArea,
};
`;
}
