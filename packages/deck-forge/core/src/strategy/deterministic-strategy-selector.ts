/**
 * DeterministicStrategySelector — picks the best candidate without LLM calls.
 *
 * Selection logic:
 * 1. If preferred candidate exists (reason includes "explicit preferredStrategyId"), pick it.
 * 2. Apply diversity penalty if a strategy has been selected too many times.
 * 3. Apply final-slide heuristic for decision/approval slides.
 * 4. Otherwise pick the first (highest-scored) candidate.
 * 5. If no candidates exist, fallback to "one-message-summary".
 *
 * Confidence:
 * - preferredStrategyId → high
 * - candidate with 3+ reasons → high
 * - candidate with 1-2 reasons → medium
 * - fallback → low
 *
 * Invariant: selection.candidateIds always includes selection.strategyId.
 */

import type {
  StrategySelectionInput,
  StrategySelection,
  StrategySelector,
} from "#src/strategy/strategy-selector.js";

const DEFAULT_FALLBACK_STRATEGY_ID = "one-message-summary";

/** Strategies that are appropriate for final decision/approval slides. */
const DECISION_STRATEGIES = new Set([
  "decision-request",
  "action-plan-table",
  "recommendation-comparison",
]);

/** Strategies that should NOT be selected for final decision/approval slides. */
const GENERIC_KPI_STRATEGIES = new Set([
  "kpi-card-overview",
  "metric-tile-dashboard",
]);

/** Patterns indicating a decision/approval/action final slide. */
const DECISION_SIGNAL_PATTERN =
  /approve|approval|decision|承認|判断|意思決定|稟議|次アクション|action|plan|施策|対応|依頼|決裁/i;

export class DeterministicStrategySelector implements StrategySelector {
  private readonly fallbackStrategyId: string;

  constructor(options?: { fallbackStrategyId?: string }) {
    this.fallbackStrategyId = options?.fallbackStrategyId ?? DEFAULT_FALLBACK_STRATEGY_ID;
  }

  select(input: StrategySelectionInput): StrategySelection {
    const { candidateResult, intent, previousSelections, slideCount, slideIndex } = input;
    const { candidates, warnings } = candidateResult;
    const candidateIds = candidates.map((c) => c.manifest.id);

    if (candidates.length === 0) {
      // Ensure fallback ID is in candidateIds (invariant)
      const fallbackIds = candidateIds.includes(this.fallbackStrategyId)
        ? candidateIds
        : [...candidateIds, this.fallbackStrategyId];

      return {
        strategyId: this.fallbackStrategyId,
        confidence: "low",
        rationale: `No strategy candidates matched the slide intent; using fallback strategy "${this.fallbackStrategyId}".`,
        selectedBy: "fallback",
        candidateIds: fallbackIds,
        warnings: [...warnings],
      };
    }

    // Check for explicit preferredStrategyId
    const preferred = candidates.find((c) =>
      c.reasons.includes("explicit preferredStrategyId"),
    );

    if (preferred) {
      return {
        strategyId: preferred.manifest.id,
        confidence: "high",
        rationale: `Selected by explicit preferredStrategyId: ${preferred.manifest.id}`,
        selectedBy: "preferredStrategyId",
        candidateIds,
        warnings: [...warnings],
      };
    }

    // Build a re-ranked list considering diversity and final-slide heuristic
    const reranked = this.rerankCandidates(
      candidates,
      intent,
      previousSelections,
      slideCount,
      slideIndex,
    );

    const top = reranked[0]!;
    const confidence = top.reasons.length >= 3 ? "high" : "medium";

    return {
      strategyId: top.manifest.id,
      confidence,
      rationale: `Deterministic selection: ${top.reasons.join("; ")}`,
      selectedBy: "deterministicSelector",
      candidateIds,
      warnings: [...warnings],
    };
  }

  /**
   * Re-rank candidates with diversity penalty and final-slide heuristic.
   */
  private rerankCandidates(
    candidates: Array<{ manifest: { id: string }; reasons: string[] }>,
    intent: StrategySelectionInput["intent"],
    previousSelections?: string[],
    slideCount?: number,
    slideIndex?: number,
  ): Array<{ manifest: { id: string }; reasons: string[] }> {
    if (candidates.length <= 1) return [...candidates];

    const textToSearch = [intent.keyMessage, intent.audienceTakeaway ?? ""].join(" ");
    const isLastSlide =
      slideIndex != null && slideCount != null && slideIndex === slideCount - 1;
    const isDecisionSlide = DECISION_SIGNAL_PATTERN.test(textToSearch);

    // Build a scoring overlay
    const overlay: Array<{
      candidate: (typeof candidates)[number];
      penalty: number;
      reasons: string[];
    }> = candidates.map((c) => ({ candidate: c, penalty: 0, reasons: [...c.reasons] }));

    // Diversity penalty
    if (previousSelections && previousSelections.length > 0) {
      const freq = new Map<string, number>();
      for (const s of previousSelections) {
        freq.set(s, (freq.get(s) ?? 0) + 1);
      }
      const totalPrevious = previousSelections.length;
      const diversityThreshold = 0.5;

      for (const entry of overlay) {
        const count = freq.get(entry.candidate.manifest.id) ?? 0;
        if (totalPrevious > 0 && count / totalPrevious >= diversityThreshold) {
          // Apply penalty proportional to overuse
          entry.penalty += 3 + count;
          entry.reasons.push(`diversity penalty: ${entry.candidate.manifest.id} used ${count}/${totalPrevious} times`);
        }
      }
    }

    // Final-slide decision heuristic
    if (isLastSlide && isDecisionSlide) {
      for (const entry of overlay) {
        if (GENERIC_KPI_STRATEGIES.has(entry.candidate.manifest.id)) {
          entry.penalty += 5;
          entry.reasons.push("penalized: generic KPI strategy on final decision slide");
        }
        if (DECISION_STRATEGIES.has(entry.candidate.manifest.id)) {
          entry.penalty -= 3;
          entry.reasons.push("boosted: decision strategy on final slide");
        }
      }
    }

    // Sort by (original order position + penalty), stable sort
    overlay.sort((a, b) => {
      const aIdx = candidates.indexOf(a.candidate);
      const bIdx = candidates.indexOf(b.candidate);
      const aEffective = aIdx + a.penalty;
      const bEffective = bIdx + b.penalty;
      return aEffective - bEffective;
    });

    return overlay.map((e) => ({
      manifest: e.candidate.manifest,
      reasons: e.reasons,
    }));
  }
}
