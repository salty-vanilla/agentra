import type { ChatCommand } from '@agentra/shared';

/**
 * Build a Router directive string from a structured UI command.
 * This directive is appended to the user message so the Router Agent
 * strongly delegates to the appropriate tool.
 */
export function buildRouterCommandDirective(command: ChatCommand): string {
  if (command.type !== 'create_slide_presentation') {
    return '';
  }

  const fields = [
    `- type: ${command.type}`,
    `- topic: ${command.topic}`,
    command.audience ? `- audience: ${command.audience}` : null,
    command.purpose ? `- purpose: ${command.purpose}` : null,
    command.slideCount != null ? `- slideCount: ${command.slideCount}` : null,
    command.durationMinutes != null
      ? `- durationMinutes: ${command.durationMinutes}`
      : null,
    command.language ? `- language: ${command.language}` : null,
    command.tone ? `- tone: ${command.tone}` : null,
    `- outputFormat: ${command.outputFormat ?? 'pptx'}`,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    '<UI command directive>',
    'The user explicitly requested slide generation via the chat UI command.',
    '',
    'Command:',
    fields,
    '',
    'You must delegate this request to the create_slide_presentation tool.',
    'If audience or purpose are not specified, ask the user one brief clarifying question before generating (e.g. "対象読者と目的を教えていただけますか？").',
    'Do not answer with a normal text-only response.',
    'Do not ask the user to use /api/presentations.',
    'Do not generate PPTX XML yourself.',
    'Do not write PptxGenJS code in the Router response.',
    '</UI command directive>',
  ].join('\n');
}
