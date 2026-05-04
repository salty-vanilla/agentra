import { chatCommandSchema } from '@agentra/shared';
import { describe, expect, it } from 'vitest';
import { buildRouterCommandDirective } from '../lib/command-directive.js';

describe('buildRouterCommandDirective', () => {
  it('builds a directive for a slide command with all fields', () => {
    const directive = buildRouterCommandDirective({
      type: 'create_slide_presentation',
      topic: '製造ライン #4 のQ2報告資料',
      audience: 'executive',
      purpose: 'report',
      slideCount: 10,
      durationMinutes: 15,
      language: 'ja',
      tone: 'executive',
      outputFormat: 'pptx',
    });

    expect(directive).toContain('create_slide_presentation');
    expect(directive).toContain('製造ライン #4 のQ2報告資料');
    expect(directive).toContain('audience: executive');
    expect(directive).toContain('purpose: report');
    expect(directive).toContain('slideCount: 10');
    expect(directive).toContain('durationMinutes: 15');
    expect(directive).toContain('language: ja');
    expect(directive).toContain('tone: executive');
    expect(directive).toContain('outputFormat: pptx');
    expect(directive).toContain('<UI command directive>');
    expect(directive).toContain('</UI command directive>');
    expect(directive).not.toContain('route directly to `/api/presentations`');
  });

  it('builds a directive with minimal fields', () => {
    const directive = buildRouterCommandDirective({
      type: 'create_slide_presentation',
      topic: 'Test topic',
    });

    expect(directive).toContain('create_slide_presentation');
    expect(directive).toContain('topic: Test topic');
    expect(directive).toContain('outputFormat: pptx');
    expect(directive).not.toContain('audience:');
    expect(directive).not.toContain('purpose:');
  });

  it('directive instructs not to use /api/presentations', () => {
    const directive = buildRouterCommandDirective({
      type: 'create_slide_presentation',
      topic: 'test',
    });

    expect(directive).toContain('Do not ask the user to use /api/presentations');
    expect(directive).toContain(
      'You must delegate this request to the create_slide_presentation tool',
    );
  });
});

describe('chatCommandSchema validation', () => {
  it('accepts a valid slide command', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: '報告資料',
      audience: 'executive',
      language: 'ja',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty topic', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only topic', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('accepts auto for slideCount', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'test',
      slideCount: 'auto',
    });

    expect(result.success).toBe(true);
  });

  it('accepts numeric slideCount', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'test',
      slideCount: 10,
    });

    expect(result.success).toBe(true);
  });

  it('accepts custom audience string', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'test',
      audience: '経営企画部',
    });

    expect(result.success).toBe(true);
  });
});
