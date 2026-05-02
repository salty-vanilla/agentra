import type { ContentBlock } from "#src/index.js";

export type NormalizedDecisionContent = {
  cta?: ContentBlock;
  approvalItems: ContentBlock[];
  metrics: ContentBlock[];
  supporting: ContentBlock[];
};

const CTA_KEYWORDS =
  /(?:承認|お願い|本日|決議|判断|依頼|approval|decision|request|go[\s/]no[\s-]?go)/i;

const APPROVAL_KEYWORDS =
  /(?:施策|initiative|measure|対策|改善|導入|自動化|最適化|①|②|③|④|⑤|⑥)/i;

/**
 * Normalize a set of ContentBlock[] into semantic groups for the
 * decision-request strategy.
 *
 * Rules:
 * - callout matching CTA keywords → cta (first match only)
 * - callout matching approval keywords → approvalItems
 * - bullet_list with 3-6 items → approvalItems (one per item is too fine;
 *   keep as single block)
 * - metric blocks → metrics
 * - remaining → supporting
 */
export function normalizeDecisionContent(
  blocks: ContentBlock[],
): NormalizedDecisionContent {
  let cta: ContentBlock | undefined;
  const approvalItems: ContentBlock[] = [];
  const metrics: ContentBlock[] = [];
  const supporting: ContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === "metric") {
      metrics.push(block);
      continue;
    }

    if (block.type === "callout") {
      const text = block.text;
      if (!cta && CTA_KEYWORDS.test(text)) {
        cta = block;
      } else if (APPROVAL_KEYWORDS.test(text)) {
        approvalItems.push(block);
      } else {
        // Default: treat non-CTA callouts as approval items if we don't
        // have enough yet; otherwise supporting
        approvalItems.push(block);
      }
      continue;
    }

    if (block.type === "bullet_list") {
      const items = block.items;
      if (items.length >= 3 && items.length <= 6) {
        // Likely approval-looking items
        approvalItems.push(block);
      } else {
        supporting.push(block);
      }
      continue;
    }

    if (block.type === "table") {
      // Tables in decision context go to approval items (main slot)
      approvalItems.push(block);
      continue;
    }

    if (block.type === "paragraph") {
      const text = block.text;
      if (APPROVAL_KEYWORDS.test(text)) {
        approvalItems.push(block);
      } else {
        supporting.push(block);
      }
      continue;
    }

    supporting.push(block);
  }

  // If no CTA was found and we have approval items, promote the first
  if (!cta && approvalItems.length > 0) {
    cta = approvalItems.shift();
  }

  return { cta, approvalItems, metrics, supporting };
}
