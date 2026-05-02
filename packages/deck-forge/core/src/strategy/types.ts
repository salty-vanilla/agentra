/**
 * Phase 8A: Audience / Genre / Strategy Manifest Foundation
 *
 * Core domain types for the Typed Presentation Strategy Engine.
 * These types decouple strategy selection from any specific theme or template.
 */

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

/** Who is the primary reader of this presentation? */
export type AudienceType =
  | "executive"
  | "manager"
  | "engineer"
  | "researcher"
  | "operator"
  | "customer"
  | "general";

// ---------------------------------------------------------------------------
// Genre
// ---------------------------------------------------------------------------

/** What category of presentation is this? */
export type PresentationGenre =
  | "executive-summary"
  | "business-review"
  | "technical-architecture"
  | "engineering-design-review"
  | "research-presentation"
  | "manufacturing-operations"
  | "sales-proposal"
  | "product-roadmap"
  | "incident-review"
  | "training"
  | "data-analytics-report";

// ---------------------------------------------------------------------------
// Communication Intent
// ---------------------------------------------------------------------------

/** What is the presenter trying to accomplish on this slide? */
export type CommunicationIntent =
  | "summarize"
  | "compare"
  | "explain"
  | "persuade"
  | "decide"
  | "report"
  | "teach"
  | "diagnose"
  | "plan"
  | "review";

// ---------------------------------------------------------------------------
// Content Kind
// ---------------------------------------------------------------------------

/** What type of content does this slide primarily contain? */
export type ContentKind =
  | "title"
  | "section"
  | "summary"
  | "kpi"
  | "comparison"
  | "timeline"
  | "process"
  | "architecture"
  | "flow"
  | "table"
  | "chart"
  | "research-result"
  | "action-plan"
  | "risk"
  | "decision"
  | "root-cause"
  | "training-step";

// ---------------------------------------------------------------------------
// Density
// ---------------------------------------------------------------------------

/** How information-dense should the slide be? */
export type DensityLevel = "low" | "medium" | "high";
