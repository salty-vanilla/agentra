import type { IntentParser } from '@deck-forge/tools';

export function createBasicIntentParser(): IntentParser {
  return {
    async parseCreate({ userRequest }) {
      return {
        mode: 'create',
        confidence: 0.9,
        missingFields: [],
        goal: userRequest,
        audience: 'business stakeholders',
        slideCount: 8,
        tone: 'professional',
      };
    },

    async parseModify({ userRequest }) {
      return {
        mode: 'modify',
        confidence: 0.9,
        missingFields: [],
        goal: userRequest,
        modifyIntent: {
          changeRequest: userRequest,
          operations: [],
        },
      };
    },
  };
}
