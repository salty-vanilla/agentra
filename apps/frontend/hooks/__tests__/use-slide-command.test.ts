import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSlideCommand } from '../use-slide-command';

describe('useSlideCommand', () => {
  describe('parseInput', () => {
    it('returns original message and null command when no /slide prefix', () => {
      const { result } = renderHook(() => useSlideCommand());

      const parsed = result.current.parseInput('普通のメッセージ');

      expect(parsed.message).toBe('普通のメッセージ');
      expect(parsed.command).toBeNull();
    });

    it('extracts topic from /slide prefix and detects Japanese', () => {
      const { result } = renderHook(() => useSlideCommand());

      const parsed = result.current.parseInput('/slide AIの活用事例');

      expect(parsed.message).toBe('AIの活用事例');
      expect(parsed.command).toMatchObject({
        type: 'create_slide_presentation',
        topic: 'AIの活用事例',
        language: 'ja',
        slideCount: 'auto',
        outputFormat: 'pptx',
      });
    });

    it('detects English when topic has no Japanese characters', () => {
      const { result } = renderHook(() => useSlideCommand());

      const parsed = result.current.parseInput('/slide Introduction to AI');

      expect(parsed.command?.language).toBe('en');
    });

    it('returns empty message and null command when topic is blank', () => {
      const { result } = renderHook(() => useSlideCommand());

      const parsed = result.current.parseInput('/slide   ');

      expect(parsed.message).toBe('');
      expect(parsed.command).toBeNull();
    });
  });

  describe('activateCommand', () => {
    it('sets active state with default values', () => {
      const { result } = renderHook(() => useSlideCommand());

      act(() => {
        result.current.activateCommand({ topic: 'クラウド入門' });
      });

      expect(result.current.commandState.active).toBe(true);
      expect(result.current.commandState.command).toMatchObject({
        type: 'create_slide_presentation',
        topic: 'クラウド入門',
        language: 'ja',
        slideCount: 'auto',
        outputFormat: 'pptx',
      });
    });
  });

  describe('deactivateCommand', () => {
    it('resets active and command to initial state', () => {
      const { result } = renderHook(() => useSlideCommand());

      act(() => {
        result.current.activateCommand({ topic: 'テスト' });
      });
      act(() => {
        result.current.deactivateCommand();
      });

      expect(result.current.commandState.active).toBe(false);
      expect(result.current.commandState.command).toBeNull();
    });
  });

  describe('updateCommand', () => {
    it('merges partial updates into existing command', () => {
      const { result } = renderHook(() => useSlideCommand());

      act(() => {
        result.current.activateCommand({ topic: '初期トピック' });
      });
      act(() => {
        result.current.updateCommand({ slideCount: 10, language: 'en' });
      });

      expect(result.current.commandState.command).toMatchObject({
        topic: '初期トピック',
        slideCount: 10,
        language: 'en',
      });
    });

    it('is a no-op when command is null', () => {
      const { result } = renderHook(() => useSlideCommand());

      act(() => {
        result.current.updateCommand({ slideCount: 5 });
      });

      expect(result.current.commandState.command).toBeNull();
    });
  });
});
