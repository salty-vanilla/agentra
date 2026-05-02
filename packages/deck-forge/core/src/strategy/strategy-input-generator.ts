/**
 * StrategyInput generator interface and deterministic implementation.
 *
 * The generator takes a ResolvedSlideIntent + StrategySelection and
 * produces a valid semantic input object for the selected strategy.
 */

import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategySelection } from "#src/strategy/strategy-selector.js";
import { validateStrategyInput } from "#src/strategy/strategy-input-validation.js";

export interface StrategyInputGenerationInput {
  slideIntent: ResolvedSlideIntent;
  selection: StrategySelection;
  sourceContent?: unknown;
}

export interface StrategyInputGenerationResult<TInput = unknown> {
  strategyId: string;
  input: TInput;
  source: "deterministic" | "llm" | "fallback";
  warnings: string[];
}

export interface StrategyInputGenerator {
  generate(
    input: StrategyInputGenerationInput,
  ): StrategyInputGenerationResult | Promise<StrategyInputGenerationResult>;
}

// ---------------------------------------------------------------------------
// Per-strategy placeholder warnings
// ---------------------------------------------------------------------------

const PLACEHOLDER_WARNINGS: Record<string, string> = {
  "recommendation-comparison":
    'Generated placeholder options for "recommendation-comparison"; use LLM StrategyInput generation for production-quality content.',
  "option-comparison-table":
    'Generated placeholder options/criteria for "option-comparison-table"; use LLM StrategyInput generation for production-quality content.',
  "process-flow-with-impact":
    'Generated placeholder steps for "process-flow-with-impact"; use LLM StrategyInput generation for production-quality content.',
  "implementation-roadmap":
    'Generated placeholder milestones for "implementation-roadmap"; use LLM StrategyInput generation for production-quality content.',
  "layered-architecture":
    'Generated placeholder layers/components for "layered-architecture"; use LLM StrategyInput generation for production-quality content.',
  "small-multiples-trend":
    'Generated placeholder chart data for "small-multiples-trend"; use LLM StrategyInput generation for production-quality content.',
  "two-axis-matrix":
    'Generated placeholder matrix items for "two-axis-matrix"; use LLM StrategyInput generation for production-quality content.',
  "metric-tile-dashboard":
    'Generated placeholder tiles for "metric-tile-dashboard"; use LLM StrategyInput generation for production-quality content.',
  "action-plan-table":
    'Generated placeholder actions for "action-plan-table"; use LLM StrategyInput generation for production-quality content.',
  "event-timeline":
    'Generated placeholder events for "event-timeline"; use LLM StrategyInput generation for production-quality content.',
  "kpi-card-overview":
    'Generated placeholder metrics for "kpi-card-overview"; use LLM StrategyInput generation for production-quality content.',
  "kpi-dashboard-with-insight":
    'Generated placeholder metrics for "kpi-dashboard-with-insight"; use LLM StrategyInput generation for production-quality content.',
  "two-column-comparison":
    'Generated fallback StrategyInput for "two-column-comparison" because no comparison source content was provided.',
  "three-point-summary":
    'Generated fallback StrategyInput for "three-point-summary" because no detailed source content was provided.',
  "data-insight-story":
    'Generated fallback StrategyInput for "data-insight-story" because no data source content was provided.',
};

// ---------------------------------------------------------------------------
// Minimal-valid input factories for each strategy
// ---------------------------------------------------------------------------

function metric(msg: string) {
  return { label: msg, value: "N/A" };
}

function makeMinimalInput(strategyId: string, keyMessage: string): unknown {
  switch (strategyId) {
    case "kpi-card-overview":
      return {
        headline: keyMessage,
        metrics: [metric("Metric 1"), metric("Metric 2"), metric("Metric 3")],
      };

    case "kpi-dashboard-with-insight":
      return {
        headline: keyMessage,
        metrics: [metric("Metric 1"), metric("Metric 2")],
        insight: { headline: keyMessage },
      };

    case "decision-request":
      return {
        headline: keyMessage,
        decisionNeeded: keyMessage,
      };

    case "recommendation-comparison":
      return {
        headline: keyMessage,
        recommendation: keyMessage,
        options: [{ label: "Option A" }, { label: "Option B" }],
      };

    case "action-plan-table":
      return {
        headline: keyMessage,
        actions: [{ action: "Action item 1" }],
      };

    case "process-flow-with-impact":
      return {
        headline: keyMessage,
        steps: [{ label: "Step 1" }, { label: "Step 2" }],
      };

    case "implementation-roadmap":
      return {
        headline: keyMessage,
        milestones: [{ label: "Phase 1" }, { label: "Phase 2" }],
      };

    case "layered-architecture":
      return {
        headline: keyMessage,
        layers: [
          { name: "Presentation", components: ["UI"] },
          { name: "Business Logic", components: ["Service"] },
        ],
      };

    case "data-insight-story":
      return {
        headline: keyMessage,
        insight: { headline: keyMessage },
      };

    case "small-multiples-trend":
      return {
        headline: keyMessage,
        charts: [
          { title: "Series A", categories: ["Q1", "Q2"], values: [0, 0] },
          { title: "Series B", categories: ["Q1", "Q2"], values: [0, 0] },
        ],
      };

    case "option-comparison-table":
      return {
        headline: keyMessage,
        options: [{ label: "Option A" }, { label: "Option B" }],
        criteria: ["Cost", "Quality"],
      };

    case "one-message-summary":
      return {
        message: keyMessage,
      };

    case "three-point-summary":
      return {
        headline: keyMessage,
        points: [
          { title: "Point 1" },
          { title: "Point 2" },
          { title: "Point 3" },
        ],
      };

    case "two-column-comparison":
      return {
        headline: keyMessage,
        left: { title: "Before", points: [keyMessage] },
        right: { title: "After", points: [keyMessage] },
      };

    case "event-timeline":
      return {
        headline: keyMessage,
        events: [{ label: "Event 1" }, { label: "Event 2" }],
      };

    case "metric-tile-dashboard":
      return {
        headline: keyMessage,
        tiles: [
          metric("Tile 1"),
          metric("Tile 2"),
          metric("Tile 3"),
          metric("Tile 4"),
        ],
      };

    case "two-axis-matrix":
      return {
        headline: keyMessage,
        xAxis: "Impact",
        yAxis: "Effort",
        items: [
          { label: "Item 1", x: "high" as const, y: "low" as const },
          { label: "Item 2", x: "medium" as const, y: "medium" as const },
          { label: "Item 3", x: "low" as const, y: "high" as const },
        ],
      };

    default:
      return { message: keyMessage };
  }
}

/**
 * Deterministic StrategyInput generator for all 17 built-in strategies.
 *
 * Produces a minimal valid semantic input from the slide intent's keyMessage.
 * Always validates output against the schema.
 *
 * Source semantics:
 * - "deterministic": sourceContent was provided and could be used
 * - "fallback": generating placeholder/minimal input from keyMessage only
 */
export class DeterministicStrategyInputGenerator implements StrategyInputGenerator {
  generate(input: StrategyInputGenerationInput): StrategyInputGenerationResult {
    const { slideIntent, selection, sourceContent } = input;
    const strategyId = selection.strategyId;
    const keyMessage = slideIntent.keyMessage;
    const warnings: string[] = [];

    const generated = makeMinimalInput(strategyId, keyMessage);

    const validation = validateStrategyInput({ strategyId, value: generated });

    if (!validation.ok) {
      warnings.push(
        `Deterministic input for "${strategyId}" failed validation: ${validation.errors.join("; ")}`,
      );
      // Return the fallback one-message-summary input
      const fallback = { message: keyMessage };
      return {
        strategyId,
        input: fallback,
        source: "fallback",
        warnings,
      };
    }

    // Determine source: "deterministic" if sourceContent was provided,
    // "fallback" if generating from keyMessage placeholder only
    const hasSourceContent = sourceContent != null && sourceContent !== "";
    const source = hasSourceContent ? "deterministic" : "fallback";

    // Add per-strategy placeholder warnings when no source content
    if (!hasSourceContent) {
      const placeholderWarning = PLACEHOLDER_WARNINGS[strategyId];
      if (placeholderWarning) {
        warnings.push(placeholderWarning);
      }
    }

    return {
      strategyId,
      input: validation.input ?? generated,
      source,
      warnings,
    };
  }
}
