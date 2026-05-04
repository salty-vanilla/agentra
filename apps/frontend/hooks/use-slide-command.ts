import type { ChatCommand } from '@agentra/shared';
import { useCallback, useState } from 'react';

export type SlideCommandState = {
  active: boolean;
  command: ChatCommand | null;
};

const SLIDE_PREFIX = /^\/slide\s+/;

/**
 * Detects /slide prefix in input and manages slide command state.
 */
export function useSlideCommand() {
  const [commandState, setCommandState] = useState<SlideCommandState>({
    active: false,
    command: null,
  });

  /**
   * Parse input text for /slide command. Returns the cleaned message
   * and whether the command was detected.
   */
  const parseInput = useCallback(
    (input: string): { message: string; command: ChatCommand | null } => {
      const match = input.match(SLIDE_PREFIX);
      if (!match) {
        return { message: input, command: null };
      }

      const topic = input.slice(match[0].length).trim();
      if (!topic) {
        return { message: '', command: null };
      }

      const command: ChatCommand = {
        type: 'create_slide_presentation',
        topic,
        language: detectLanguage(topic),
        slideCount: 'auto',
        durationMinutes: 'auto',
        outputFormat: 'pptx',
      };

      return { message: topic, command };
    },
    [],
  );

  const activateCommand = useCallback(
    (
      params?: Partial<Omit<ChatCommand & { type: 'create_slide_presentation' }, 'type'>>,
    ) => {
      setCommandState({
        active: true,
        command: {
          type: 'create_slide_presentation',
          topic: params?.topic ?? '',
          language: params?.language ?? 'ja',
          audience: params?.audience,
          purpose: params?.purpose,
          slideCount: params?.slideCount ?? 'auto',
          durationMinutes: params?.durationMinutes ?? 'auto',
          outputFormat: 'pptx',
          tone: params?.tone,
        },
      });
    },
    [],
  );

  const deactivateCommand = useCallback(() => {
    setCommandState({ active: false, command: null });
  }, []);

  const updateCommand = useCallback(
    (
      updates: Partial<Omit<ChatCommand & { type: 'create_slide_presentation' }, 'type'>>,
    ) => {
      setCommandState((prev) => {
        if (!prev.command || prev.command.type !== 'create_slide_presentation')
          return prev;
        return {
          ...prev,
          command: { ...prev.command, ...updates },
        };
      });
    },
    [],
  );

  return {
    commandState,
    parseInput,
    activateCommand,
    deactivateCommand,
    updateCommand,
  };
}

function detectLanguage(text: string): 'ja' | 'en' {
  // Simple heuristic: if text contains Japanese characters, it's Japanese
  const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
  return hasJapanese ? 'ja' : 'en';
}
