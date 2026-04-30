import { selectLayoutStrategy } from "#src/builders/layouts/index.js";
import type { LayoutHints, SubFrameAssignment } from "#src/builders/layouts/index.js";
import type {
  Asset,
  AssetMetadata,
  AssetSpec,
  AssetUsage,
  CalloutBlock,
  ContentBlock,
  DeckPlan,
  Id,
  LayoutSpec,
  MetricBlock,
  ParagraphBlock,
  PresentationBrief,
  PresentationIR,
  ResolvedFrame,
  RichText,
  SlideIR,
  SlideSize,
  SlideSpec,
  TableBlock,
  TextElementIR,
  ThemeSpec,
  TitleBlock,
} from "#src/index.js";
import { createResolvedRegions, defaultFrameForRole } from "#src/operations/utils.js";

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_SLIDE_SIZE: SlideSize = {
  width: 1280,
  height: 720,
  unit: "px",
};

export type BuildPresentationIrInput = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs?: AssetSpec[];
  id?: string;
  version?: string;
  title?: string;
  theme?: ThemeSpec;
  meta?: Partial<PresentationIR["meta"]>;
};

export type BuildPresentationIrOutput = PresentationIR;

export function buildPresentationIr(input: BuildPresentationIrInput): BuildPresentationIrOutput {
  const theme = input.theme ?? createTheme(input.brief);
  const usedElementIds = new Set<string>();
  const slideSpecs = [...input.slideSpecs].sort((left, right) => {
    const leftOrder = left.slideNumber ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.slideNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id.localeCompare(right.id);
  });

  const slides = slideSpecs.map((slideSpec, index) =>
    buildSlideIr(slideSpec, index, theme, usedElementIds),
  );
  const assets = buildAssetRegistry(input.assetSpecs ?? [], slides, slideSpecs);

  return {
    id: input.id ?? input.deckPlan.id,
    version: input.version ?? "1.0.0",
    meta: {
      title: input.title ?? (input.deckPlan.title || input.brief.title),
      createdAt: input.meta?.createdAt ?? DEFAULT_TIMESTAMP,
      updatedAt: input.meta?.updatedAt ?? DEFAULT_TIMESTAMP,
      author: input.meta?.author,
      source: input.meta?.source ?? input.brief.id,
    },
    brief: input.brief,
    deckPlan: input.deckPlan,
    theme,
    slides,
    assets: {
      assets,
    },
    operationLog: [
      {
        id: "op-1",
        timestamp: DEFAULT_TIMESTAMP,
        actor: "system",
        operation: {
          type: "build_presentation_ir",
          slideCount: slides.length,
          assetCount: assets.length,
        },
        result: "success",
      },
    ],
  };
}

function buildSlideIr(
  slideSpec: SlideSpec,
  index: number,
  theme: ThemeSpec,
  usedElementIds: Set<string>,
): SlideIR {
  const layout = {
    spec: slideSpec.layout,
    slideSize: DEFAULT_SLIDE_SIZE,
    regions: createResolvedRegions(slideSpec.layout, DEFAULT_SLIDE_SIZE),
  };
  const elements = buildElements(slideSpec, layout.spec, layout.regions, theme, usedElementIds);

  return {
    id: slideSpec.id,
    index,
    specId: slideSpec.id,
    title: slideSpec.title,
    intent: slideSpec.intent,
    layout,
    elements,
    speakerNotes: slideSpec.speakerNotes?.text,
  };
}

function buildElements(
  slideSpec: SlideSpec,
  layoutSpec: LayoutSpec,
  regions: SlideIR["layout"]["regions"],
  theme: ThemeSpec,
  usedElementIds: Set<string>,
): SlideIR["elements"] {
  const content = [...slideSpec.content];
  const titleBlock = firstBlockByType(content, "title");
  const ensuredTitleText = titleBlock?.text || slideSpec.title;

  if (ensuredTitleText) {
    const synthesizedTitle: TitleBlock = {
      id: titleBlock?.id ?? `${slideSpec.id}-title`,
      type: "title",
      text: ensuredTitleText,
      emphasis: titleBlock?.emphasis,
    };
    if (!titleBlock) {
      content.unshift(synthesizedTitle);
    } else {
      const firstTitleIndex = content.findIndex((block) => block.id === titleBlock.id);
      if (firstTitleIndex > 0) {
        content.splice(firstTitleIndex, 1);
        content.unshift(synthesizedTitle);
      }
    }
  }

  const titledLayoutType = layoutSpec.type;
  const titleRegionFrame = frameForRole(regions, "title");
  const bodyRegionFrame = frameForRole(regions, "body");
  const tableRegionFrame = frameForRole(regions, "table");
  const visualRegionFrame = frameForRole(regions, "visual");
  const calloutRegionFrame = frameForRole(regions, "callout");

  // For "title" layout, split titleRegionFrame vertically into top 60% (title)
  // and bottom 40% (subtitle) with an 8px gap so they never overlap. For other
  // layouts the title uses the full title region and the subtitle falls back
  // to the body region.
  const titleSubtitleGap = 8;
  const titleElementFrame =
    titledLayoutType === "title"
      ? {
          x: titleRegionFrame.x,
          y: titleRegionFrame.y,
          width: titleRegionFrame.width,
          height: Math.max(
            44,
            Math.round(titleRegionFrame.height * 0.6) - Math.round(titleSubtitleGap / 2),
          ),
        }
      : titleRegionFrame;
  const subtitleBaseFrame =
    titledLayoutType === "title"
      ? {
          x: titleRegionFrame.x,
          y: titleElementFrame.y + titleElementFrame.height + titleSubtitleGap,
          width: titleRegionFrame.width,
          height: Math.max(
            42,
            titleRegionFrame.y +
              titleRegionFrame.height -
              (titleElementFrame.y + titleElementFrame.height + titleSubtitleGap),
          ),
        }
      : bodyRegionFrame;

  const bodyBlocks = content.filter(
    (block) => block.type === "paragraph" || block.type === "bullet_list",
  );
  const tableBlocks = content.filter((block) => block.type === "table");
  const imageBlocks = content.filter((block) => block.type === "image");
  const calloutBlocks = content.filter((block) => block.type === "callout");

  // Blocks the layout strategy is responsible for placing (everything except
  // title/subtitle, which the outer shell positions in the title region).
  const placedBlocks = content.filter(
    (block) => block.type !== "title" && block.type !== "subtitle",
  );

  const strategy = selectLayoutStrategy({
    slideSpec,
    layoutSpec,
    regions,
    theme,
    slideSize: DEFAULT_SLIDE_SIZE,
    blocks: placedBlocks,
    regionFrames: {
      body: bodyRegionFrame,
      visual: visualRegionFrame,
      callout: calloutRegionFrame,
      table: tableRegionFrame,
    },
  });
  const assignments = strategy.layout({
    slideSpec,
    layoutSpec,
    regions,
    theme,
    slideSize: DEFAULT_SLIDE_SIZE,
    blocks: placedBlocks,
    regionFrames: {
      body: bodyRegionFrame,
      visual: visualRegionFrame,
      callout: calloutRegionFrame,
      table: tableRegionFrame,
    },
  });
  const assignmentByBlock = new Map<string, SubFrameAssignment>(
    assignments.map((assignment) => [assignment.blockId, assignment]),
  );

  // Suppress unused-variable warnings: the per-region split is now handled
  // by the layout strategy, but we keep the typed groupings around for
  // possible future use (debug logging, density-aware fallbacks).
  void bodyBlocks;
  void tableBlocks;
  void imageBlocks;
  void calloutBlocks;

  const elements: SlideIR["elements"] = [];

  for (const block of content) {
    if (block.type === "title") {
      elements.push(
        createTextElement({
          blockId: block.id,
          text: block.text,
          role: "title",
          frame: titleElementFrame,
          style: {
            fontFamily: theme.typography.fontFamily.heading,
            fontSize: theme.typography.fontSize.title,
            color: theme.colors.textPrimary,
            bold: true,
          },
          usedElementIds,
        }),
      );
      continue;
    }

    if (block.type === "subtitle") {
      elements.push(
        createTextElement({
          blockId: block.id,
          text: block.text,
          role: "subtitle",
          frame: subtitleBaseFrame,
          style: {
            fontFamily: theme.typography.fontFamily.heading,
            fontSize: theme.typography.fontSize.heading,
            color: theme.colors.textSecondary,
          },
          usedElementIds,
        }),
      );
      continue;
    }

    const assignment = assignmentByBlock.get(block.id);
    const hints = assignment?.hints;

    if (block.type === "paragraph") {
      elements.push(
        createTextElement({
          blockId: block.id,
          text: block.text,
          role: hints?.role ?? "body",
          frame: assignment?.frame ?? bodyRegionFrame,
          style: applyHintsToStyle(
            {
              fontFamily: theme.typography.fontFamily.body,
              fontSize: theme.typography.fontSize.body,
              color: theme.colors.textPrimary,
              lineHeight: theme.typography.lineHeight.normal,
            },
            hints,
          ),
          alignment: hints?.alignment,
          decoration: decorationFromHints(hints),
          usedElementIds,
        }),
      );
      continue;
    }

    if (block.type === "bullet_list") {
      elements.push(
        createTextElement({
          blockId: block.id,
          text: bulletListToRichText(block),
          role: hints?.role ?? "body",
          frame: assignment?.frame ?? bodyRegionFrame,
          style: applyHintsToStyle(
            {
              fontFamily: theme.typography.fontFamily.body,
              fontSize: theme.typography.fontSize.body,
              color: theme.colors.textPrimary,
            },
            hints,
          ),
          alignment: hints?.alignment,
          decoration: decorationFromHints(hints),
          usedElementIds,
        }),
      );
      continue;
    }

    if (block.type === "table") {
      elements.push({
        id: ensureUniqueId(block.id, usedElementIds),
        type: "table",
        frame: assignment?.frame ?? tableRegionFrame,
        headers: block.headers,
        rows: normalizeTableRows(block),
        style: {
          headerFill: theme.colors.surface,
          borderColor: theme.colors.secondary,
          textStyle: {
            fontFamily: theme.typography.fontFamily.body,
            fontSize: theme.typography.fontSize.caption,
            color: theme.colors.textPrimary,
          },
        },
      });
      continue;
    }

    if (block.type === "image") {
      elements.push({
        id: ensureUniqueId(block.id, usedElementIds),
        type: "image",
        assetId: block.assetId,
        role: "inline",
        frame: assignment?.frame ?? visualRegionFrame,
      });
      continue;
    }

    if (block.type === "callout") {
      elements.push(
        createTextElement({
          blockId: block.id,
          text: block.text,
          role: hints?.role ?? "callout",
          frame: assignment?.frame ?? calloutRegionFrame,
          style: applyHintsToStyle(
            {
              fontFamily: theme.typography.fontFamily.body,
              fontSize: theme.typography.fontSize.body,
              color: toneColor(block, theme),
              bold: true,
            },
            hints,
          ),
          alignment: hints?.alignment,
          decoration: decorationFromHints(hints),
          usedElementIds,
        }),
      );
      continue;
    }

    if (block.type === "metric") {
      const metricBlock = block as MetricBlock;
      const arrow = metricBlock.trend === "up" ? " ↑" : metricBlock.trend === "down" ? " ↓" : "";
      const valueText = metricBlock.unit
        ? `${metricBlock.value} ${metricBlock.unit}`
        : metricBlock.value;
      elements.push(
        createTextElement({
          blockId: metricBlock.id,
          text: `${metricBlock.label}\n${valueText}${arrow}`,
          role: hints?.role ?? "callout",
          frame: assignment?.frame ?? calloutRegionFrame,
          style: applyHintsToStyle(
            {
              fontFamily: theme.typography.fontFamily.heading,
              fontSize: theme.typography.fontSize.heading,
              color: theme.colors.primary,
              bold: true,
            },
            hints,
          ),
          alignment: hints?.alignment,
          decoration: decorationFromHints(hints) ?? { kind: "card" },
          usedElementIds,
        }),
      );
    }
  }

  return elements;
}

function applyHintsToStyle(
  base: TextElementIR["style"],
  hints: LayoutHints | undefined,
): TextElementIR["style"] {
  if (!hints?.fontScale || hints.fontScale === 1) {
    return base;
  }
  if (typeof base.fontSize !== "number") {
    return base;
  }
  return { ...base, fontSize: Math.round(base.fontSize * hints.fontScale) };
}

function decorationFromHints(
  hints: LayoutHints | undefined,
): TextElementIR["decoration"] | undefined {
  if (!hints?.decoration || hints.decoration === "none") {
    return undefined;
  }
  return { kind: hints.decoration };
}

function buildAssetRegistry(
  assetSpecs: AssetSpec[],
  slides: SlideIR[],
  _slideSpecs: SlideSpec[],
): Asset[] {
  const knownSlideIds = new Set(slides.map((slide) => slide.id));
  const imageUsageByAsset = collectImageUsages(slides);
  const builtAssets = new Map<string, Asset>();

  for (const spec of assetSpecs) {
    const asset = toAsset(spec, imageUsageByAsset, knownSlideIds);
    builtAssets.set(asset.id, asset);
  }

  for (const [assetId, usages] of imageUsageByAsset.entries()) {
    if (builtAssets.has(assetId)) {
      continue;
    }

    builtAssets.set(assetId, {
      id: assetId,
      type: "image",
      uri: `placeholder://${assetId}.png`,
      mimeType: "image/png",
      metadata: {
        source: "derived",
        createdAt: DEFAULT_TIMESTAMP,
      },
      usage: usages,
    });
  }

  return [...builtAssets.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function collectImageUsages(slides: SlideIR[]): Map<Id, AssetUsage[]> {
  const usageByAsset = new Map<Id, AssetUsage[]>();

  for (const slide of slides) {
    for (const element of slide.elements) {
      if (element.type !== "image") {
        continue;
      }

      const usage: AssetUsage = {
        slideId: slide.id,
        elementId: element.id,
        role: element.role ?? "inline",
      };

      const current = usageByAsset.get(element.assetId) ?? [];
      current.push(usage);
      usageByAsset.set(element.assetId, dedupeUsages(current));
    }
  }

  return usageByAsset;
}

/**
 * (Removed in 0.2.2) `collectSlideAssetRefs` previously synthesized phantom
 * `asset-ref-*` element IDs per slide. We no longer record asset-slide
 * associations for slides that lack a real ImageElementIR — the validator
 * relies on real elementIds only.
 */

function toAsset(
  spec: AssetSpec,
  imageUsageByAsset: Map<Id, AssetUsage[]>,
  knownSlideIds: Set<Id>,
): Asset {
  const usage = dedupeUsages([...(imageUsageByAsset.get(spec.id) ?? [])]);
  if (spec.type === "generated_image") {
    return {
      id: spec.id,
      specId: spec.id,
      type: "image",
      uri: `generated://${spec.id}.png`,
      mimeType: "image/png",
      metadata: {
        width: spec.resolution?.width,
        height: spec.resolution?.height,
        source: "generated",
        generator: "core-builder",
        prompt: spec.prompt,
        createdAt: DEFAULT_TIMESTAMP,
      },
      usage: mergeTargetSlideUsage(usage, spec.targetSlideIds, knownSlideIds),
    };
  }

  if (spec.type === "external_image") {
    return {
      id: spec.id,
      specId: spec.id,
      type: "image",
      uri: spec.uri,
      mimeType: "image/png",
      metadata: {
        source: "external",
        provider: spec.provider,
        author: spec.author,
        license: spec.license,
        sourcePageUrl: spec.sourcePageUrl,
        attributionRequired: spec.attributionRequired,
        attributionText: spec.attributionText,
        createdAt: DEFAULT_TIMESTAMP,
      },
      usage: mergeTargetSlideUsage(usage, spec.targetSlideIds, knownSlideIds),
    };
  }

  if (spec.type === "retrieved_image") {
    return {
      id: spec.id,
      specId: spec.id,
      type: "image",
      uri: spec.selected?.imageUrl ?? `placeholder://${spec.id}.png`,
      mimeType: "image/png",
      metadata: {
        source: "external",
        provider: spec.provider,
        author: spec.selected?.author,
        license: spec.selected?.license,
        sourcePageUrl: spec.selected?.sourcePageUrl,
        attributionRequired: spec.selected?.attributionRequired,
        attributionText: spec.selected?.attributionText,
        createdAt: DEFAULT_TIMESTAMP,
      },
      usage: mergeTargetSlideUsage(usage, spec.targetSlideIds, knownSlideIds),
    };
  }

  if (spec.type === "diagram") {
    return {
      id: spec.id,
      specId: spec.id,
      type: "diagram",
      uri: `generated://${spec.id}.svg`,
      mimeType: "image/svg+xml",
      metadata: {
        source: "derived",
        createdAt: DEFAULT_TIMESTAMP,
      },
      usage: mergeTargetSlideUsage(usage, spec.targetSlideIds, knownSlideIds),
    };
  }

  if (spec.type === "icon") {
    return {
      id: spec.id,
      specId: spec.id,
      type: "icon",
      uri: `generated://${spec.id}.svg`,
      mimeType: "image/svg+xml",
      metadata: {
        source: "derived",
        createdAt: DEFAULT_TIMESTAMP,
      },
      usage: mergeTargetSlideUsage(usage, spec.targetSlideIds, knownSlideIds),
    };
  }

  return {
    id: spec.id,
    specId: spec.id,
    type: "image",
    uri: `generated://${spec.id}.png`,
    mimeType: "image/png",
    metadata: {
      source: "derived",
      createdAt: DEFAULT_TIMESTAMP,
    },
    usage: mergeTargetSlideUsage(usage, spec.targetSlideIds, knownSlideIds),
  };
}

/**
 * Merges targetSlideIds into the usage list so that assets declared via
 * assetSpec.targetSlideIds are associated with the correct slides.
 *
 * We only add usages for slides that already have a real ImageElementIR
 * referencing this asset (i.e. the elementId is already in imageUsageByAsset).
 * We do NOT synthesize phantom element IDs for slides where the asset has
 * no rendered element — that caused "non-existent element" validator warnings.
 */
/**
 * (Kept as a typed pass-through in 0.2.2.) Historically this merged
 * `targetSlideIds` into `usage[]` by synthesizing phantom `asset-target-*`
 * element IDs. We now refuse to fabricate elementIds the slide does not
 * actually contain, so the only thing left to do is dedupe and return the
 * existing usages.  `targetSlideIds` and `knownSlideIds` are accepted so
 * callers do not need to change shape if a future revision reintroduces
 * non-element-bearing usage tracking.
 */
function mergeTargetSlideUsage(
  usage: AssetUsage[],
  _targetSlideIds: Id[] | undefined,
  _knownSlideIds: Set<Id>,
): AssetUsage[] {
  return dedupeUsages(usage);
}

function dedupeUsages(usages: AssetUsage[]): AssetUsage[] {
  const seen = new Set<string>();
  const deduped: AssetUsage[] = [];

  for (const usage of usages) {
    const key = `${usage.slideId}::${usage.elementId}::${usage.role}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(usage);
  }

  return deduped;
}

/**
 * Predefined color palettes keyed by visualDirection.mood.
 * Used as a fallback when brief.brand.colors is not explicitly set.
 */
const MOOD_PALETTES: Record<
  string,
  { primary: string; secondary: string; accent: string; background: string }
> = {
  energetic: { primary: "#F59E0B", secondary: "#0EA5E9", accent: "#EF4444", background: "#FFFBEB" },
  calm: { primary: "#0EA5E9", secondary: "#A5F3FC", accent: "#6366F1", background: "#F0F9FF" },
  trustworthy: {
    primary: "#1D4ED8",
    secondary: "#0EA5E9",
    accent: "#14B8A6",
    background: "#FFFFFF",
  },
  futuristic: {
    primary: "#6366F1",
    secondary: "#8B5CF6",
    accent: "#22D3EE",
    background: "#0F172A",
  },
  premium: { primary: "#0F172A", secondary: "#334155", accent: "#D4AF37", background: "#F8FAFC" },
  practical: { primary: "#475569", secondary: "#94A3B8", accent: "#0EA5E9", background: "#FFFFFF" },
};

function createTheme(brief: PresentationBrief): ThemeSpec {
  const brandColors = brief.brand?.colors;
  const mood = brief.visualDirection?.mood as string | undefined;
  const moodPalette = mood ? (MOOD_PALETTES[mood] ?? null) : null;
  const headingFont = brief.brand?.fonts?.heading ?? "Arial";
  const bodyFont = brief.brand?.fonts?.body ?? "Arial";
  const monoFont = brief.brand?.fonts?.mono ?? "Courier New";

  // Priority: brand.colors (explicit) > moodPalette (from visualDirection) > built-in defaults.
  const primary = brandColors?.primary ?? moodPalette?.primary ?? "#1D4ED8";
  const secondary = brandColors?.secondary ?? moodPalette?.secondary ?? "#0EA5E9";
  const accent = brandColors?.accent ?? moodPalette?.accent ?? "#14B8A6";
  const background = brandColors?.background ?? moodPalette?.background ?? "#FFFFFF";

  return {
    id: `theme-${slugify(brief.id)}`,
    name: brief.brand?.name ?? (mood ? `${mood} theme` : "Core Default"),
    colors: {
      background,
      surface: brandColors?.surface ?? "#F8FAFC",
      textPrimary: brandColors?.textPrimary ?? "#0F172A",
      textSecondary: brandColors?.textSecondary ?? "#475569",
      primary,
      secondary,
      accent,
      success: brandColors?.success,
      warning: brandColors?.warning,
      danger: brandColors?.danger,
      chartPalette: brandColors?.chartPalette ?? [primary, secondary, accent, "#F59E0B"],
    },
    typography: {
      fontFamily: {
        heading: headingFont,
        body: bodyFont,
        mono: monoFont,
      },
      fontSize: {
        title: 40,
        heading: 28,
        body: 18,
        caption: 14,
        footnote: 12,
      },
      lineHeight: {
        tight: 1.1,
        normal: 1.4,
        relaxed: 1.7,
      },
      weight: {
        regular: 400,
        medium: 500,
        bold: 700,
      },
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
    radius: {
      none: 0,
      sm: 4,
      md: 8,
      lg: 12,
      full: 999,
    },
    slideDefaults: {
      backgroundColor: brandColors?.background ?? "#FFFFFF",
      padding: 24,
    },
    elementDefaults: {
      text: {
        fontFamily: bodyFont,
        fontSize: 18,
        color: brandColors?.textPrimary ?? "#0F172A",
      },
    },
  };
}

function createTextElement(input: {
  blockId: string;
  text: string | RichText;
  role: TextElementIR["role"];
  frame: ResolvedFrame;
  style: TextElementIR["style"];
  alignment?: "left" | "center" | "right";
  decoration?: TextElementIR["decoration"];
  usedElementIds: Set<string>;
}): TextElementIR {
  const richText = typeof input.text === "string" ? toRichText(input.text) : input.text;
  const text: RichText = input.alignment
    ? {
        paragraphs: richText.paragraphs.map((paragraph) => ({
          ...paragraph,
          alignment: paragraph.alignment ?? input.alignment,
        })),
      }
    : richText;
  const element: TextElementIR = {
    id: ensureUniqueId(input.blockId, input.usedElementIds),
    type: "text",
    role: input.role,
    text,
    frame: input.frame,
    style: input.style,
  };
  if (input.decoration) {
    element.decoration = input.decoration;
  }
  return element;
}

function toRichText(text: string): RichText {
  return {
    paragraphs: [
      {
        runs: [{ text }],
      },
    ],
  };
}

function bulletListToRichText(block: Extract<ContentBlock, { type: "bullet_list" }>): RichText {
  const paragraphs: RichText["paragraphs"] = [];

  const visit = (items: typeof block.items, depth: number): void => {
    for (const item of items) {
      paragraphs.push({
        runs: [{ text: item.text }],
        bullet: { indentLevel: depth },
        spacingAfter: 6,
      });
      if (item.children && item.children.length > 0) {
        visit(item.children, depth + 1);
      }
    }
  };

  visit(block.items, 0);

  return { paragraphs };
}

function normalizeTableRows(block: TableBlock): string[][] {
  const columns = block.headers.length;
  return block.rows.map((row) => {
    if (row.length === columns) {
      return row;
    }

    if (row.length > columns) {
      return row.slice(0, columns);
    }

    const padded = [...row];
    while (padded.length < columns) {
      padded.push("");
    }
    return padded;
  });
}

function toneColor(block: CalloutBlock, theme: ThemeSpec): string {
  if (block.tone === "success") {
    return theme.colors.success ?? theme.colors.accent;
  }
  if (block.tone === "warning") {
    return theme.colors.warning ?? theme.colors.accent;
  }
  if (block.tone === "danger") {
    return theme.colors.danger ?? theme.colors.accent;
  }
  return theme.colors.accent;
}

function frameForRole(
  regions: SlideIR["layout"]["regions"],
  role: SlideIR["layout"]["regions"][number]["role"],
): ResolvedFrame {
  const match = regions.find((region) => region.role === role);
  if (match) {
    return match.frame;
  }
  return defaultFrameForRole(role, DEFAULT_SLIDE_SIZE);
}

function ensureUniqueId(id: string, usedIds: Set<string>): string {
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }

  let suffix = 2;
  let next = `${id}-${suffix}`;
  while (usedIds.has(next)) {
    suffix += 1;
    next = `${id}-${suffix}`;
  }
  usedIds.add(next);
  return next;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function firstBlockByType<T extends ContentBlock["type"]>(
  blocks: ContentBlock[],
  type: T,
): Extract<ContentBlock, { type: T }> | undefined {
  return blocks.find((block): block is Extract<ContentBlock, { type: T }> => block.type === type);
}
