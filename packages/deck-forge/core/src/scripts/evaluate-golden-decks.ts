#!/usr/bin/env node
/**
 * Golden deck evaluation script for Phase 5.5.
 *
 * Runs each golden deck fixture through the full pipeline:
 *   build IR → validate → optional repair → layout quality scoring → export JSON
 *
 * Usage:
 *   npx tsx packages/deck-forge/core/src/scripts/evaluate-golden-decks.ts [--output <dir>] [--repair] [--pptx]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildPresentationIr } from "../builders/build-presentation-ir.js";
import { validatePresentation } from "../validation/validate-presentation.js";
import { repairPresentationLayout, repairTextOverflow } from "../repair/index.js";
import { scoreLayoutQuality } from "../quality/score-layout-quality.js";
import { analyzeDeckLayout } from "../diagnostics/layout-diagnostics.js";
import { analyzeOperationLog } from "../diagnostics/operation-diagnostics.js";
import { goldenDecks } from "../__tests__/fixtures/golden-decks/index.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

const outputDir = getArg("--output") ?? getArg("-o") ?? "./eval-output";
const enableRepair = process.argv.includes("--repair");
const enablePptx = process.argv.includes("--pptx");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(outputDir, { recursive: true });

  const summaries: Record<string, unknown> = {};

  for (const [name, fixture] of Object.entries(goldenDecks)) {
    process.stderr.write(`evaluating: ${name}...\n`);

    // 1. Build IR
    const presentation = buildPresentationIr(fixture);

    // 2. Validate
    const validation = await validatePresentation(presentation, { level: "export" });

    // 3. Optional repair
    let repairSummary: unknown = null;
    let repairedPresentation = presentation;
    if (enableRepair) {
      const layoutRepair = await repairPresentationLayout({
        presentation: repairedPresentation,
        issues: validation.issues,
      });
      repairedPresentation = layoutRepair.presentation;

      const textRepair = await repairTextOverflow({
        presentation: repairedPresentation,
        issues: validation.issues,
      });
      repairedPresentation = textRepair.presentation;

      repairSummary = {
        layout: layoutRepair.summary,
        textOverflow: textRepair.summary,
      };
    }

    // 4. Quality scoring
    const qualityReport = scoreLayoutQuality(repairedPresentation);

    // 4b. Layout diagnostics
    const layoutDiagnostics = analyzeDeckLayout(repairedPresentation);
    const operationDiagnostics = analyzeOperationLog(repairedPresentation.operationLog);

    // 5. Write outputs
    const prefix = join(outputDir, name);

    await writeFile(
      `${prefix}.presentation.json`,
      JSON.stringify(repairedPresentation, null, 2),
      "utf8",
    );
    await writeFile(
      `${prefix}.validation.json`,
      JSON.stringify(validation, null, 2),
      "utf8",
    );
    await writeFile(
      `${prefix}.quality-report.json`,
      JSON.stringify(qualityReport, null, 2),
      "utf8",
    );

    if (repairSummary) {
      await writeFile(
        `${prefix}.repair-summary.json`,
        JSON.stringify(repairSummary, null, 2),
        "utf8",
      );
    }
    await writeFile(
      `${prefix}.layout-diagnostics.json`,
      JSON.stringify(layoutDiagnostics, null, 2),
      "utf8",
    );
    await writeFile(
      `${prefix}.operation-diagnostics.json`,
      JSON.stringify(operationDiagnostics, null, 2),
      "utf8",
    );

    // 6. Optional PPTX export
    if (enablePptx) {
      try {
        const { PptxExporter } = await import("../exporters/pptx/pptx-exporter.js");
        const exporter = new PptxExporter();
        const result = await exporter.export(repairedPresentation, { format: "pptx" });
        if (result.data instanceof Uint8Array) {
          await writeFile(`${prefix}.pptx`, result.data);
        }
        process.stderr.write(`  → ${name}.pptx written\n`);
      } catch (err) {
        process.stderr.write(`  ⚠ PPTX export failed for ${name}: ${err}\n`);
      }
    }

    summaries[name] = {
      validation: validation.summary,
      quality: qualityReport.summary,
      repair: repairSummary,
      layoutDiagnostics: layoutDiagnostics.summary,
      operationDiagnostics,
    };
  }

  // Write combined summary
  await writeFile(
    join(outputDir, "_summary.json"),
    JSON.stringify(summaries, null, 2),
    "utf8",
  );

  process.stderr.write(`\nDone. Results written to: ${outputDir}/\n`);
  process.stdout.write(JSON.stringify(summaries, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`Error: ${err}\n`);
  process.exitCode = 1;
});
