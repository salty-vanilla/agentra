/**
 * StrategyInput Zod schemas for all 17 built-in strategies.
 *
 * These schemas define the semantic input shape that each strategy expects.
 * They contain no rendering instructions (no x/y/width/height/fill/stroke).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const StatusSchema = z.enum(["good", "warning", "critical", "neutral"]);
export type Status = z.infer<typeof StatusSchema>;

export const TrendSchema = z.enum(["up", "down", "flat", "mixed", "unknown"]);
export type Trend = z.infer<typeof TrendSchema>;

export const PrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const KpiMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  trend: TrendSchema.optional(),
  status: StatusSchema.optional(),
  insight: z.string().optional(),
});
export type KpiMetric = z.infer<typeof KpiMetricSchema>;

export const ActionItemSchema = z.object({
  action: z.string(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["not-started", "in-progress", "blocked", "done"]).optional(),
  priority: PrioritySchema.optional(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const OptionSchema = z.object({
  label: z.string(),
  summary: z.string().optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
  score: z.string().optional(),
  recommended: z.boolean().optional(),
});
export type Option = z.infer<typeof OptionSchema>;

export const TimelineItemSchema = z.object({
  label: z.string(),
  dateOrPhase: z.string().optional(),
  description: z.string().optional(),
  status: StatusSchema.optional(),
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const InsightSchema = z.object({
  headline: z.string(),
  detail: z.string().optional(),
  implication: z.string().optional(),
});
export type Insight = z.infer<typeof InsightSchema>;

// ---------------------------------------------------------------------------
// 1. kpi-card-overview
// ---------------------------------------------------------------------------
export const KpiCardOverviewInputSchema = z.object({
  headline: z.string(),
  metrics: z.array(KpiMetricSchema).min(1).max(6),
  keyTakeaway: z.string().optional(),
});
export type KpiCardOverviewInput = z.infer<typeof KpiCardOverviewInputSchema>;

// ---------------------------------------------------------------------------
// 2. kpi-dashboard-with-insight
// ---------------------------------------------------------------------------
export const KpiDashboardWithInsightInputSchema = z.object({
  headline: z.string(),
  metrics: z.array(KpiMetricSchema).min(2).max(6),
  trend: z
    .object({
      title: z.string().optional(),
      categories: z.array(z.string()),
      series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).max(4),
    })
    .optional(),
  insight: InsightSchema,
});
export type KpiDashboardWithInsightInput = z.infer<typeof KpiDashboardWithInsightInputSchema>;

// ---------------------------------------------------------------------------
// 3. decision-request
// ---------------------------------------------------------------------------
export const DecisionRequestInputSchema = z.object({
  headline: z.string(),
  decisionNeeded: z.string(),
  context: z.string().optional(),
  options: z.array(OptionSchema).optional(),
  recommendation: z.string().optional(),
  requestedAction: z.string().optional(),
});
export type DecisionRequestInput = z.infer<typeof DecisionRequestInputSchema>;

// ---------------------------------------------------------------------------
// 4. recommendation-comparison
// ---------------------------------------------------------------------------
export const RecommendationComparisonInputSchema = z.object({
  headline: z.string(),
  recommendation: z.string(),
  options: z.array(OptionSchema).min(2).max(4),
  criteria: z.array(z.string()).optional(),
});
export type RecommendationComparisonInput = z.infer<typeof RecommendationComparisonInputSchema>;

// ---------------------------------------------------------------------------
// 5. action-plan-table
// ---------------------------------------------------------------------------
export const ActionPlanTableInputSchema = z.object({
  headline: z.string(),
  actions: z.array(ActionItemSchema).min(1).max(8),
  keyTakeaway: z.string().optional(),
});
export type ActionPlanTableInput = z.infer<typeof ActionPlanTableInputSchema>;

// ---------------------------------------------------------------------------
// 6. process-flow-with-impact
// ---------------------------------------------------------------------------
export const ProcessFlowWithImpactInputSchema = z.object({
  headline: z.string(),
  steps: z
    .array(
      z.object({
        label: z.string(),
        description: z.string().optional(),
        impact: z.string().optional(),
        status: StatusSchema.optional(),
        bottleneck: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(6),
  keyTakeaway: z.string().optional(),
});
export type ProcessFlowWithImpactInput = z.infer<typeof ProcessFlowWithImpactInputSchema>;

// ---------------------------------------------------------------------------
// 7. implementation-roadmap
// ---------------------------------------------------------------------------
export const ImplementationRoadmapInputSchema = z.object({
  headline: z.string(),
  milestones: z.array(TimelineItemSchema).min(2).max(8),
  keyTakeaway: z.string().optional(),
});
export type ImplementationRoadmapInput = z.infer<typeof ImplementationRoadmapInputSchema>;

// ---------------------------------------------------------------------------
// 8. layered-architecture
// ---------------------------------------------------------------------------
export const LayeredArchitectureInputSchema = z.object({
  headline: z.string(),
  layers: z
    .array(
      z.object({
        name: z.string(),
        components: z.array(z.string()).max(6),
        responsibility: z.string().optional(),
      }),
    )
    .min(2)
    .max(6),
  keyTakeaway: z.string().optional(),
});
export type LayeredArchitectureInput = z.infer<typeof LayeredArchitectureInputSchema>;

// ---------------------------------------------------------------------------
// 9. data-insight-story
// ---------------------------------------------------------------------------
export const DataInsightStoryInputSchema = z.object({
  headline: z.string(),
  visualTitle: z.string().optional(),
  dataSummary: z.string().optional(),
  insight: InsightSchema,
  keyTakeaway: z.string().optional(),
});
export type DataInsightStoryInput = z.infer<typeof DataInsightStoryInputSchema>;

// ---------------------------------------------------------------------------
// 10. small-multiples-trend
// ---------------------------------------------------------------------------
export const SmallMultiplesTrendInputSchema = z.object({
  headline: z.string(),
  charts: z
    .array(
      z.object({
        title: z.string(),
        categories: z.array(z.string()),
        values: z.array(z.number()),
        insight: z.string().optional(),
      }),
    )
    .min(2)
    .max(4),
  keyTakeaway: z.string().optional(),
});
export type SmallMultiplesTrendInput = z.infer<typeof SmallMultiplesTrendInputSchema>;

// ---------------------------------------------------------------------------
// 11. option-comparison-table
// ---------------------------------------------------------------------------
export const OptionComparisonTableInputSchema = z.object({
  headline: z.string(),
  options: z.array(OptionSchema).min(2).max(5),
  criteria: z.array(z.string()).min(2).max(6),
  recommendation: z.string().optional(),
});
export type OptionComparisonTableInput = z.infer<typeof OptionComparisonTableInputSchema>;

// ---------------------------------------------------------------------------
// 12. one-message-summary
// ---------------------------------------------------------------------------
export const OneMessageSummaryInputSchema = z.object({
  message: z.string(),
  supportingText: z.string().optional(),
  callout: z.string().optional(),
});
export type OneMessageSummaryInput = z.infer<typeof OneMessageSummaryInputSchema>;

// ---------------------------------------------------------------------------
// 13. three-point-summary
// ---------------------------------------------------------------------------
export const ThreePointSummaryInputSchema = z.object({
  headline: z.string(),
  points: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        iconHint: z.string().optional(),
      }),
    )
    .length(3),
});
export type ThreePointSummaryInput = z.infer<typeof ThreePointSummaryInputSchema>;

// ---------------------------------------------------------------------------
// 14. two-column-comparison
// ---------------------------------------------------------------------------
export const TwoColumnComparisonInputSchema = z.object({
  headline: z.string(),
  left: z.object({
    title: z.string(),
    points: z.array(z.string()),
  }),
  right: z.object({
    title: z.string(),
    points: z.array(z.string()),
  }),
  keyTakeaway: z.string().optional(),
});
export type TwoColumnComparisonInput = z.infer<typeof TwoColumnComparisonInputSchema>;

// ---------------------------------------------------------------------------
// 15. event-timeline
// ---------------------------------------------------------------------------
export const EventTimelineInputSchema = z.object({
  headline: z.string(),
  events: z.array(TimelineItemSchema).min(2).max(8),
  keyTakeaway: z.string().optional(),
});
export type EventTimelineInput = z.infer<typeof EventTimelineInputSchema>;

// ---------------------------------------------------------------------------
// 16. metric-tile-dashboard
// ---------------------------------------------------------------------------
export const MetricTileDashboardInputSchema = z.object({
  headline: z.string(),
  tiles: z.array(KpiMetricSchema).min(4).max(9),
  keyTakeaway: z.string().optional(),
});
export type MetricTileDashboardInput = z.infer<typeof MetricTileDashboardInputSchema>;

// ---------------------------------------------------------------------------
// 17. two-axis-matrix
// ---------------------------------------------------------------------------
export const TwoAxisMatrixInputSchema = z.object({
  headline: z.string(),
  xAxis: z.string(),
  yAxis: z.string(),
  items: z
    .array(
      z.object({
        label: z.string(),
        x: z.enum(["low", "medium", "high"]),
        y: z.enum(["low", "medium", "high"]),
        description: z.string().optional(),
      }),
    )
    .min(3)
    .max(12),
  keyTakeaway: z.string().optional(),
});
export type TwoAxisMatrixInput = z.infer<typeof TwoAxisMatrixInputSchema>;

// ---------------------------------------------------------------------------
// Schema map: strategy ID → Zod schema
// ---------------------------------------------------------------------------
export const STRATEGY_INPUT_SCHEMAS: Record<string, z.ZodType> = {
  "kpi-card-overview": KpiCardOverviewInputSchema,
  "kpi-dashboard-with-insight": KpiDashboardWithInsightInputSchema,
  "decision-request": DecisionRequestInputSchema,
  "recommendation-comparison": RecommendationComparisonInputSchema,
  "action-plan-table": ActionPlanTableInputSchema,
  "process-flow-with-impact": ProcessFlowWithImpactInputSchema,
  "implementation-roadmap": ImplementationRoadmapInputSchema,
  "layered-architecture": LayeredArchitectureInputSchema,
  "data-insight-story": DataInsightStoryInputSchema,
  "small-multiples-trend": SmallMultiplesTrendInputSchema,
  "option-comparison-table": OptionComparisonTableInputSchema,
  "one-message-summary": OneMessageSummaryInputSchema,
  "three-point-summary": ThreePointSummaryInputSchema,
  "two-column-comparison": TwoColumnComparisonInputSchema,
  "event-timeline": EventTimelineInputSchema,
  "metric-tile-dashboard": MetricTileDashboardInputSchema,
  "two-axis-matrix": TwoAxisMatrixInputSchema,
};
