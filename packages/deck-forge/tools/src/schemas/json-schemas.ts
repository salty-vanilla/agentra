import {
  AssetSpecSchema,
  BriefSchema,
  ContentBlockSchema,
  DeckPlanSchema,
  SlideSpecSchema,
} from "@deck-forge/core";
import { z } from "zod";

/**
 * JSON Schema definitions derived at module-load time from the canonical Zod
 * schemas in `@deck-forge/core`. Suitable as `input_schema` for Anthropic
 * `tool_use` or `parameters` for OpenAI function calling.
 *
 * Single source of truth: TypeScript types and these JSON schemas are both
 * derived from the same Zod definitions, so they cannot drift.
 */
export type JsonSchema = Record<string, unknown>;

export const BRIEF_JSON_SCHEMA: JsonSchema = z.toJSONSchema(BriefSchema, {
  target: "draft-7",
}) as JsonSchema;

export const DECK_PLAN_JSON_SCHEMA: JsonSchema = z.toJSONSchema(DeckPlanSchema, {
  target: "draft-7",
}) as JsonSchema;

export const SLIDE_SPEC_JSON_SCHEMA: JsonSchema = z.toJSONSchema(
  SlideSpecSchema,
  { target: "draft-7" },
) as JsonSchema;

export const CONTENT_BLOCK_JSON_SCHEMA: JsonSchema = z.toJSONSchema(
  ContentBlockSchema,
  { target: "draft-7" },
) as JsonSchema;

export const ASSET_SPEC_JSON_SCHEMA: JsonSchema = z.toJSONSchema(
  AssetSpecSchema,
  { target: "draft-7" },
) as JsonSchema;
