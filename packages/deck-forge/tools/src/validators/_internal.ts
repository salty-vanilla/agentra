import type { SlideSpec } from "@deck-forge/core";
import type { z } from "zod";

export const GENERIC_FILLER_PATTERNS = [
  "Proposal Point",
  "Execution Plan",
  "Key Insight",
  "Evidence and context supporting this message",
  "Data indicates a clear direction",
  "Audience agrees on the proposed plan",
  "Adoption",
  "Satisfaction",
  "68%",
  "80%",
  "4.2/5",
  "4.5/5",
];

export function detectRequestLanguage(text: string): "ja" | "en" {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text) ? "ja" : "en";
}

export function slideSpecText(slide: SlideSpec): string {
  return [
    slide.title,
    slide.intent.keyMessage,
    slide.intent.audienceTakeaway,
    ...slide.content.flatMap((block) => contentBlockText(block)),
    slide.speakerNotes?.text ?? "",
  ].join("\n");
}

function contentBlockText(block: SlideSpec["content"][number]): string[] {
  switch (block.type) {
    case "title":
    case "subtitle":
    case "paragraph":
    case "callout":
    case "quote":
      return [block.text];
    case "bullet_list":
      return flattenBulletItems(block.items);
    case "table":
      return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
    case "chart":
      return [
        block.title ?? "",
        block.insight ?? "",
        ...(block.data.categories ?? []),
        ...block.data.series.flatMap((series) => [series.name, ...series.values.map(String)]),
      ];
    case "image":
      return [block.altText ?? "", block.caption ?? ""];
    case "diagram":
      return block.nodes.flatMap((node) => [node.label, node.description ?? ""]);
    case "metric":
      return [block.label, block.value, block.unit ?? ""];
    case "code":
      return [block.code];
    default:
      return [];
  }
}

type TextTreeItem = {
  text: string;
  children?: TextTreeItem[];
};

function flattenBulletItems(items: TextTreeItem[]): string[] {
  const text: string[] = [];
  for (const item of items) {
    text.push(item.text);
    if (item.children) {
      text.push(...flattenBulletItems(item.children));
    }
  }
  return text;
}

/**
 * Convert Zod issues into a flat list of human-readable strings rooted at
 * `prefix` (e.g. "brief", "deckPlan", `slide:${id}`).
 */
export function flattenZodIssues(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
    return `${prefix}${path}: ${issue.message}`;
  });
}
