import { randomUUID } from 'node:crypto';
import type { CreatePresentationToolInput } from '@agentra/presentation-author';
import { createPresentation } from '@agentra/presentation-author';
import { S3Client } from '@aws-sdk/client-s3';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { UploadedPresentationArtifact } from '../artifacts/artifact-upload-types.js';
import { uploadPresentationArtifacts } from '../artifacts/s3-artifact-uploader.js';
import { FONT_POLICY_STYLE_GUIDE } from '../font-policy.js';
import { createPresentationAuthorLlmClient } from '../llm-adapter.js';
import { logger } from '../logger.js';

const envDiagnostics = process.env.PRESENTATION_AUTHOR_ENABLE_DIAGNOSTICS !== 'false';
const envRevision = process.env.PRESENTATION_AUTHOR_ENABLE_REVISION !== 'false';
const envOutputDir = process.env.PRESENTATION_AUTHOR_OUTPUT_DIR;
const envBucketName = process.env.PRESENTATION_ARTIFACT_BUCKET_NAME ?? '';
const envPrefix = process.env.PRESENTATION_ARTIFACT_PREFIX ?? 'runs';
const envPresignedUrls = process.env.PRESENTATION_ARTIFACT_PRESIGNED_URLS !== 'false';
const envUrlExpires = Number.parseInt(
  process.env.PRESENTATION_ARTIFACT_URL_EXPIRES_SECONDS ?? '3600',
  10,
);
const envBrandFrameEnabled =
  process.env.PRESENTATION_BRAND_FRAME_ENABLED !== 'false';
const envDefaultBrandFrameId =
  process.env.PRESENTATION_DEFAULT_BRAND_FRAME_ID ?? 'company-basic-v1';

const llmClient = createPresentationAuthorLlmClient();
const s3Client = envBucketName ? new S3Client({}) : undefined;

const createPresentationTool = tool({
  name: 'create_presentation',
  description:
    'Create an editable PowerPoint presentation from a user request using a PptxGenJS authoring workflow. Returns artifact paths for the PPTX, source JS, rendered slides, and contact sheet when available.',
  inputSchema: z.object({
    prompt: z.string().describe('What to create in the presentation.'),
    language: z
      .enum(['ja', 'en'])
      .optional()
      .describe('Output language. Inferred from prompt if omitted.'),
    styleGuide: z
      .string()
      .optional()
      .describe('Optional style guide text (plain text or markdown).'),
    outputDir: z
      .string()
      .optional()
      .describe('Optional output directory for generated artifacts.'),
    diagnostics: z.boolean().optional().describe('Enable diagnostics. Default: true.'),
    revision: z
      .boolean()
      .optional()
      .describe('Enable one revision attempt. Default: true.'),
    timeoutMs: z
      .number()
      .optional()
      .describe('Script execution timeout in milliseconds.'),
    brandFrameId: z
      .string()
      .optional()
      .describe('Optional BrandFrame template ID. Defaults to company-basic-v1 when enabled.'),
  }),
  callback: async (input) => {
    const runId = randomUUID();
    const startTime = Date.now();

    logger.info({
      component: 'create-presentation-tool',
      runId,
      step: 'create_presentation_start',
      language: input.language,
      diagnostics: input.diagnostics ?? envDiagnostics,
      revision: input.revision ?? envRevision,
    });

    const styleGuide = input.styleGuide
      ? `${input.styleGuide}\n\n${FONT_POLICY_STYLE_GUIDE}`
      : FONT_POLICY_STYLE_GUIDE;

    const toolInput: CreatePresentationToolInput = {
      prompt: input.prompt,
      language: input.language,
      styleGuide,
      outputDir: input.outputDir ?? envOutputDir,
      diagnostics: input.diagnostics ?? envDiagnostics,
      revision: input.revision ?? envRevision,
      timeoutMs: input.timeoutMs,
      brandFrameId: envBrandFrameEnabled
        ? (input.brandFrameId ?? envDefaultBrandFrameId)
        : undefined,
    };

    const result = await createPresentation(toolInput, { llm: llmClient });
    const durationMs = Date.now() - startTime;

    if (result.success) {
      logger.info({
        component: 'create-presentation-tool',
        runId,
        step: 'create_presentation_done',
        success: true,
        durationMs,
        diagnosticsStatus: result.diagnosticsStatus,
        revisionAttempted: result.revisionAttempted,
        revisionSucceeded: result.revisionSucceeded,
        revisionReason: result.revisionReason,
        artifactCount: result.artifacts?.length ?? 0,
        pptxPath: result.pptxPath,
        contactSheetPath: result.contactSheetPath,
        warningCount: result.warnings?.length ?? 0,
      });

      // --- Artifact upload ---
      let uploadedArtifacts: UploadedPresentationArtifact[] | undefined;
      let pptxDownloadUrl: string | undefined;
      let contactSheetDownloadUrl: string | undefined;
      const uploadWarnings: string[] = [];

      if (envBucketName && s3Client) {
        try {
          const uploadResult = await uploadPresentationArtifacts(
            {
              result,
              bucketName: envBucketName,
              prefix: envPrefix,
              runId,
              includePresignedUrls: envPresignedUrls,
              presignedUrlExpiresSeconds: envUrlExpires,
            },
            { s3Client },
          );

          uploadedArtifacts = uploadResult.uploadedArtifacts;
          uploadWarnings.push(...uploadResult.warnings);

          pptxDownloadUrl = uploadedArtifacts.find(
            (a) => a.kind === 'pptx' && a.downloadUrl,
          )?.downloadUrl;
          contactSheetDownloadUrl = uploadedArtifacts.find(
            (a) => a.kind === 'contact-sheet' && a.downloadUrl,
          )?.downloadUrl;
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          uploadWarnings.push(`Artifact upload failed: ${msg}`);
          logger.error({
            component: 'create-presentation-tool',
            runId,
            step: 'artifact_upload_error',
            error: msg,
          });
        }
      } else {
        uploadWarnings.push(
          'PRESENTATION_ARTIFACT_BUCKET_NAME is not set; artifacts were not uploaded.',
        );
      }

      const extendedResult = {
        ...result,
        warnings: [...result.warnings, ...uploadWarnings],
        uploadedArtifacts,
        pptxDownloadUrl,
        contactSheetDownloadUrl,
      };

      return {
        status: 'success' as const,
        content: [{ text: JSON.stringify(extendedResult) }],
      };
    } else {
      logger.error({
        component: 'create-presentation-tool',
        runId,
        step: 'create_presentation_failed',
        success: false,
        durationMs,
        phase: result.error?.phase,
        message: result.error?.message,
      });
    }

    return {
      status: result.success ? ('success' as const) : ('error' as const),
      content: [{ text: JSON.stringify(result) }],
    };
  },
});

export { createPresentationTool };
