import {
  createHorizontalCards,
  hasDecisionSignals,
  isDecisionIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import {
  layoutCardGrid,
  layoutMetricRail,
  layoutBottomCallout,
  layoutSidecarStack,
} from "#src/builders/layouts/primitives/index.js";
import { normalizeDecisionContent } from "#src/normalizers/normalize-decision-request.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { DecisionRequestInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Decision Request: optimised for the `approval-with-kpi-sidecar` template layout.
 * Uses cta → main → metrics → supporting slot order.
 *
 * Phase 7.8: Uses normalizeDecisionContent + layout primitives
 * (layoutCardGrid / layoutMetricRail / layoutBottomCallout / layoutSidecarStack)
 * for deterministic, overlap-free placement.
 */
export const decisionRequestStrategy: LayoutStrategy = {
  id: "decision-request",
  capability: "decision_request",
  priority: 90,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<DecisionRequestInput>({ strategyId: "decision-request", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (ctx.blocks.length < 2) return false;
    if (ctx.blocks.length > 10) return false;
    return hasDecisionSignals(ctx) || isDecisionIntent(ctx);
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<DecisionRequestInput>({ strategyId: "decision-request", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      let idx = 0;
      syntheticBlocks.push({ id: `si-callout-${idx++}`, type: "callout", text: inp.decisionNeeded, tone: "warning" });
      if (inp.context) {
        syntheticBlocks.push({ id: `si-paragraph-${idx++}`, type: "paragraph", text: inp.context });
      }
      if (inp.options) {
        for (const [i, opt] of inp.options.entries()) {
          const items: { text: string }[] = [];
          if (opt.summary) items.push({ text: opt.summary });
          if (opt.pros) for (const p of opt.pros) items.push({ text: `✓ ${p}` });
          if (opt.cons) for (const c of opt.cons) items.push({ text: `✗ ${c}` });
          if (opt.score) items.push({ text: `Score: ${opt.score}` });
          if (opt.recommended) items.push({ text: "★ Recommended" });
          syntheticBlocks.push({ id: `si-bullet_list-${i}`, type: "bullet_list", items: items.length > 0 ? items : [{ text: opt.label }] });
        }
      }
      if (inp.recommendation) {
        syntheticBlocks.push({ id: `si-callout-rec`, type: "callout", text: inp.recommendation, tone: "success" });
      }
      if (inp.requestedAction) {
        syntheticBlocks.push({ id: `si-callout-action`, type: "callout", text: inp.requestedAction, tone: "info" });
      }
      const nativeCtx = { ...ctx, blocks: syntheticBlocks };
      const assignments = layoutBlocks(nativeCtx);
      return { assignments, syntheticBlocks, strategyInputMode: "native", strategyInputWarnings: sir.warnings };
    }
    const assignments = layoutBlocks(ctx);
    const mode = sir.mode === "invalid" && ctx.blocks.length > 0 ? "invalid-fallback" as const : sir.mode;
    return { assignments, strategyInputMode: mode, strategyInputWarnings: sir.warnings.length > 0 ? sir.warnings : undefined };
  },
};

function layoutBlocks(ctx: LayoutContext): SubFrameAssignment[] {
  const density = ctx.layoutSpec.density;
  const region = mergeAllRegions(ctx);

  // Normalize blocks into semantic groups
  const normalized = normalizeDecisionContent(ctx.blocks);

  // Resolve template slots — approval-with-kpi-sidecar provides:
  // cta, main, metrics, supporting, footer, title
  const ctaRes = resolveSlotFrame(ctx, ["cta", "callout"], region);
  const mainRes = resolveSlotFrame(ctx, ["main", "body"], region);
  const metricsRes = resolveSlotFrame(ctx, "metrics", region);
  const supportingRes = resolveSlotFrame(ctx, ["supporting", "footer"], region);

  const assignments: SubFrameAssignment[] = [];
  const hasCtaSlot = !!ctaRes.slot;

  if (hasCtaSlot) {
    // --- Template-slot-aware layout using primitives ---

    // 1) CTA callout → cta slot
    if (normalized.cta) {
      const ctaAssignments = layoutBottomCallout({
        region: ctaRes.frame,
        block: normalized.cta,
        height: ctaRes.frame.height,
      });
      for (const a of ctaAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: ctaRes,
            frame: a.frame,
            hints: {
              fontScale: 1.4,
              alignment: "center",
              role: "callout",
              decoration: "accent-bar",
            },
          }),
        );
      }
    }

    // 2) Approval items → main slot via cardGrid
    if (normalized.approvalItems.length > 0) {
      const cardAssignments = layoutCardGrid({
        region: mainRes.frame,
        blocks: normalized.approvalItems,
        density,
      });
      for (const a of cardAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: mainRes,
            frame: a.frame,
            hints: a.hints,
          }),
        );
      }
    }

    // 3) Metrics → metrics slot via metricRail
    if (normalized.metrics.length > 0) {
      const metricAssignments = layoutMetricRail({
        region: metricsRes.frame,
        blocks: normalized.metrics,
        density,
        gap: 16,
      });
      for (const a of metricAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: metricsRes,
            frame: a.frame,
            hints: { decoration: "card", fontScale: 1.2 },
          }),
        );
      }
    }

    // 4) Supporting → supporting slot via sidecarStack
    if (normalized.supporting.length > 0) {
      const sidecarAssignments = layoutSidecarStack({
        region: supportingRes.frame,
        blocks: normalized.supporting,
        density,
      });
      for (const a of sidecarAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: supportingRes,
            frame: a.frame,
          }),
        );
      }
    }

    return assignments;
  }

  // --- Fallback: no template slots, geometric split ---

  const allDecision = [
    ...(normalized.cta ? [normalized.cta] : []),
    ...normalized.approvalItems,
  ];
  if (allDecision.length > 0) {
    const hasBottom =
      normalized.metrics.length > 0 || normalized.supporting.length > 0;
    const topRatio = hasBottom ? 0.3 : 1.0;

    if (!hasBottom) {
      // CTA + approval items fill region via cardGrid
      const gridAssignments = layoutCardGrid({
        region,
        blocks: allDecision,
        density,
      });
      for (const a of gridAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: ctaRes,
            frame: a.frame,
            hints: {
              fontScale: 1.4,
              alignment: "center",
              role: "callout",
              decoration: "accent-bar",
            },
          }),
        );
      }
      return assignments;
    }

    const { top: decisionRegion, bottom: lowerRegion } = splitTopBottom(region, topRatio);

    // CTA in top region
    const topAssignments = layoutCardGrid({
      region: decisionRegion,
      blocks: allDecision,
      density,
    });
    for (const a of topAssignments) {
      assignments.push(
        assignmentFromSlot({
          blockId: a.blockId,
          resolution: ctaRes,
          frame: a.frame,
          hints: {
            fontScale: 1.4,
            alignment: "center",
            role: "callout",
            decoration: "accent-bar",
          },
        }),
      );
    }

    // Distribute lower region across metrics + supporting
    const remaining = [...normalized.metrics, ...normalized.supporting];
    if (remaining.length > 0) {
      const frames =
        remaining.length <= 4
          ? createHorizontalCards(lowerRegion, remaining.length, density)
          : splitVertical(lowerRegion, remaining.length, density);
      remaining.forEach((block, i) => {
        const isMetric = block.type === "metric";
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: isMetric ? metricsRes : mainRes,
            frame: frames[i] ?? lowerRegion,
            hints: isMetric ? { decoration: "card", fontScale: 1.2 } : { decoration: "card" },
          }),
        );
      });
    }
  } else {
    // No explicit callout — first block gets decision treatment
    const [first, ...rest] = ctx.blocks;
    if (!first) return assignments;

    const { top: decisionRegion, bottom: lowerRegion } = splitTopBottom(region, 0.3);

    assignments.push(
      assignmentFromSlot({
        blockId: first.id,
        resolution: ctaRes,
        frame: decisionRegion,
        hints: {
          fontScale: 1.4,
          alignment: "center",
          role: "callout",
          decoration: "accent-bar",
        },
      }),
    );

    if (rest.length > 0) {
      const cards = createHorizontalCards(lowerRegion, rest.length, density);
      rest.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: cards[i] ?? lowerRegion,
          hints: { decoration: "card" as const },
        });
      });
    }
  }

  return assignments;
}
