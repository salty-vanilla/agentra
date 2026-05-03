/**
 * Intent-to-Strategy candidate selection.
 *
 * Given a ResolvedSlideIntent and a StrategyRegistry, finds the best
 * candidate strategies using filtering and basic scoring.
 * Phase 8B: filtering-based. Phase 8C will add LLM reranking.
 * Phase 8J: text signal scoring for content-driven strategy affinity.
 */

import type { StrategyManifest } from "#src/strategy/manifest.js";
import type { StrategyRegistry } from "#src/strategy/registry.js";
import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";

export interface StrategyCandidate {
  manifest: StrategyManifest;
  reasons: string[];
}

export interface StrategyCandidateResult {
  candidates: StrategyCandidate[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Text signal → strategy affinity rules
// ---------------------------------------------------------------------------

interface TextSignalRule {
  /** Patterns that match in keyMessage / audienceTakeaway (case-insensitive). */
  patterns: RegExp;
  /** Strategy IDs that get a bonus when this signal fires. */
  affinityStrategies: string[];
  /** Score bonus (added once per rule per manifest). */
  bonus: number;
  /** Human-readable reason for tracing. */
  reason: string;
}

const TEXT_SIGNAL_RULES: TextSignalRule[] = [
  // Trend / time-series / monthly transition
  {
    patterns: /trend|推移|月次|時系列|変化|trajectory|transition|トレンド|前月比|前年比|YoY|MoM/i,
    affinityStrategies: ["small-multiples-trend", "data-insight-story", "kpi-dashboard-with-insight"],
    bonus: 4,
    reason: "text signal: trend/time-series",
  },
  // Root cause / insight / analysis
  {
    patterns: /原因|要因|分析|insight|root\s*cause|driver|why|背景|因果|要因分析|ドライバー/i,
    affinityStrategies: ["data-insight-story", "two-column-comparison", "two-axis-matrix"],
    bonus: 4,
    reason: "text signal: root-cause/analysis",
  },
  // Process / workflow / flow
  {
    patterns: /process|flow|workflow|ステップ|工程|流れ|改善フロー|実行手順|プロセス|フロー/i,
    affinityStrategies: ["process-flow-with-impact", "implementation-roadmap"],
    bonus: 4,
    reason: "text signal: process/workflow",
  },
  // Action plan / next steps
  {
    patterns: /action|plan|施策|対応|次アクション|ロードマップ|owner|due|担当|期限|改善施策|対策/i,
    affinityStrategies: ["action-plan-table", "implementation-roadmap", "decision-request"],
    bonus: 4,
    reason: "text signal: action-plan/next-steps",
  },
  // Decision / approval request
  {
    patterns: /approve|approval|decision|承認|判断|意思決定|稟議|投資判断|決裁|依頼/i,
    affinityStrategies: ["decision-request", "recommendation-comparison", "action-plan-table"],
    bonus: 5,
    reason: "text signal: decision/approval",
  },
  // KPI / metric / dashboard
  {
    patterns: /KPI|metric|dashboard|達成|実績|指標|パフォーマンス|サマリー|overview/i,
    affinityStrategies: ["kpi-card-overview", "metric-tile-dashboard", "kpi-dashboard-with-insight"],
    bonus: 3,
    reason: "text signal: kpi/metric",
  },
  // Comparison
  {
    patterns: /比較|comparison|versus|vs\.|対比|before.*after|現状.*改善/i,
    affinityStrategies: ["two-column-comparison", "recommendation-comparison", "option-comparison-table"],
    bonus: 3,
    reason: "text signal: comparison",
  },
];

/**
 * Extracts text signal bonuses for a given strategy manifest.
 */
function computeTextSignalScore(
  manifest: StrategyManifest,
  intent: ResolvedSlideIntent,
): { bonus: number; reasons: string[] } {
  const textToSearch = [
    intent.keyMessage,
    intent.audienceTakeaway ?? "",
  ].join(" ");

  let bonus = 0;
  const reasons: string[] = [];

  for (const rule of TEXT_SIGNAL_RULES) {
    if (rule.affinityStrategies.includes(manifest.id) && rule.patterns.test(textToSearch)) {
      bonus += rule.bonus;
      reasons.push(rule.reason);
    }
  }

  return { bonus, reasons };
}

/**
 * Finds strategy candidates for the given resolved slide intent.
 *
 * Filtering logic:
 * 1. Exclude avoidStrategyIds
 * 2. If preferredStrategyId is valid, place it first
 * 3. Score remaining manifests by overlap with intent fields
 * 4. Return top 5 candidates with reasons
 */
export function findStrategyCandidatesForIntent(
  intent: ResolvedSlideIntent,
  registry: StrategyRegistry,
): StrategyCandidateResult {
  const warnings: string[] = [];
  const allManifests = registry.listStrategyManifests();

  // Handle avoidStrategyIds
  const avoidSet = new Set(intent.avoidStrategyIds ?? []);
  const eligible = allManifests.filter((m) => !avoidSet.has(m.id));

  // Handle preferredStrategyId
  let preferred: StrategyCandidate | undefined;
  if (intent.preferredStrategyId) {
    const preferredManifest = registry.getStrategyManifest(intent.preferredStrategyId);
    if (preferredManifest) {
      if (!avoidSet.has(preferredManifest.id)) {
        preferred = {
          manifest: preferredManifest,
          reasons: ["explicit preferredStrategyId"],
        };
      }
    } else {
      warnings.push(
        `Unknown preferredStrategyId "${intent.preferredStrategyId}"; ignoring preference.`,
      );
    }
  }

  // Score each eligible manifest
  const scored: Array<{ manifest: StrategyManifest; score: number; reasons: string[] }> = [];

  for (const m of eligible) {
    // Skip the preferred one from scoring — it goes first regardless
    if (preferred && m.id === preferred.manifest.id) continue;

    const reasons: string[] = [];
    let score = 0;

    // Audience match
    if (m.audiences.includes(intent.audience)) {
      score += 3;
      reasons.push(`matches audience: ${intent.audience}`);
    }

    // Genre match
    if (m.suitableFor.includes(intent.genre)) {
      score += 3;
      reasons.push(`matches genre: ${intent.genre}`);
    }

    // Intent match
    if (m.intents.includes(intent.intent)) {
      score += 2;
      reasons.push(`matches intent: ${intent.intent}`);
    }

    // ContentKind overlap
    const kindOverlap = intent.contentKinds.filter((k) => m.contentKinds.includes(k));
    if (kindOverlap.length > 0) {
      score += 2 * kindOverlap.length;
      reasons.push(`matches contentKind: ${kindOverlap.join(", ")}`);
    }

    // Density match
    if (m.density === intent.density) {
      score += 1;
      reasons.push(`matches density: ${intent.density}`);
    }

    // Capability constraints
    if (intent.constraints) {
      const caps = m.capabilities;
      if (intent.constraints.requiresChart && caps?.supportsCharts) {
        score += 1;
        reasons.push("supports charts");
      }
      if (intent.constraints.requiresTable && caps?.supportsTables) {
        score += 1;
        reasons.push("supports tables");
      }
      if (intent.constraints.requiresIcons && caps?.supportsIcons) {
        score += 1;
        reasons.push("supports icons");
      }
      if (intent.constraints.requiresImages && caps?.supportsImages) {
        score += 1;
        reasons.push("supports images");
      }
    }

    // Text signal scoring (Phase 8J)
    const textSignal = computeTextSignalScore(m, intent);
    if (textSignal.bonus > 0) {
      score += textSignal.bonus;
      reasons.push(...textSignal.reasons);
    }

    if (score > 0) {
      scored.push({ manifest: m, score, reasons });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Build final candidates (max 5)
  const candidates: StrategyCandidate[] = [];
  if (preferred) {
    candidates.push(preferred);
  }
  for (const s of scored) {
    if (candidates.length >= 5) break;
    candidates.push({ manifest: s.manifest, reasons: s.reasons });
  }

  return { candidates, warnings };
}
