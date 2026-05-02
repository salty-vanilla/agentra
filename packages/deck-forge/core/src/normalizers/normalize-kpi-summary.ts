import type { ContentBlock } from "#src/index.js";

export type NormalizedKpiSummaryContent = {
  metrics: ContentBlock[];
  insight?: ContentBlock;
  supporting: ContentBlock[];
};

/**
 * Normalize a set of ContentBlock[] into semantic groups for the
 * kpi-card-overview strategy.
 *
 * - metric blocks → metrics
 * - primary callout → insight (first one)
 * - remaining paragraphs/callouts/bullets → supporting
 */
export function normalizeKpiSummaryContent(
  blocks: ContentBlock[],
): NormalizedKpiSummaryContent {
  const metrics: ContentBlock[] = [];
  const callouts: ContentBlock[] = [];
  const supporting: ContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === "metric") {
      metrics.push(block);
    } else if (block.type === "callout") {
      callouts.push(block);
    } else {
      supporting.push(block);
    }
  }

  // First callout is the insight; rest go to supporting
  const insight = callouts[0];
  if (callouts.length > 1) {
    supporting.push(...callouts.slice(1));
  }

  return { metrics, insight, supporting };
}
