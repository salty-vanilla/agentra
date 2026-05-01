import { type SlideSpec, SlideSpecSchema } from "@deck-forge/core";
import type { ValidationResult } from "#src/types.js";
import {
  GENERIC_FILLER_PATTERNS,
  flattenZodIssues,
  slideSpecText,
} from "#src/validators/_internal.js";

export type ValidateSlideSpecOptions = {
  /** Strings that must appear somewhere in the slide's textual content. */
  mustInclude?: string[];
  /** Strings that must not appear. Generic filler patterns are always added. */
  mustAvoid?: string[];
  /** Whether to apply the built-in generic-filler check. Defaults to true. */
  applyGenericFillerCheck?: boolean;
};

/**
 * Validate a single SlideSpec structurally (via Zod) plus optional content
 * inclusion/avoidance checks. Returns `{ valid, issues }`.
 */
export function validateSlideSpec(
  slideSpec: unknown,
  options: ValidateSlideSpecOptions = {},
): ValidationResult {
  const parsed = SlideSpecSchema.safeParse(slideSpec);
  if (!parsed.success) {
    const id =
      typeof slideSpec === "object" &&
      slideSpec !== null &&
      "id" in slideSpec &&
      typeof (slideSpec as { id?: unknown }).id === "string"
        ? (slideSpec as { id: string }).id
        : "<unknown>";
    return {
      valid: false,
      issues: flattenZodIssues(`slide:${id}`, parsed.error),
    };
  }
  const issues = semanticIssues(parsed.data, options);
  return { valid: issues.length === 0, issues };
}

function semanticIssues(
  slide: SlideSpec,
  { mustInclude = [], mustAvoid = [], applyGenericFillerCheck = true }: ValidateSlideSpecOptions,
): string[] {
  const issues: string[] = [];
  if (!slide.title.trim()) {
    issues.push(`slide ${slide.id} is missing a title`);
  }
  if (slide.content.length === 0) {
    issues.push(`slide ${slide.id} has no content blocks`);
  }

  const text = slideSpecText(slide);
  for (const required of mustInclude.filter(Boolean)) {
    if (!text.includes(required)) {
      issues.push(`slide ${slide.id} missing required content: ${required}`);
    }
  }

  const forbidden = [
    ...mustAvoid.filter(Boolean),
    ...(applyGenericFillerCheck ? GENERIC_FILLER_PATTERNS : []),
  ];
  for (const pattern of forbidden) {
    if (text.includes(pattern)) {
      issues.push(`slide ${slide.id} contains forbidden or generic filler content: ${pattern}`);
    }
  }

  return issues;
}
