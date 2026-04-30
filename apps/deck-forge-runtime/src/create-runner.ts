import { DeckForgeRunner } from '@deck-forge/runner';
import type { DeckForgeRunnerOptions } from '@deck-forge/runner';
import { createBasicIntentParser } from './intent-parser.js';
import { createNoopPresentationRuntime } from './noop-runtime.js';

export function createDeckForgeRunner(options: {
  revisionPolicy: NonNullable<DeckForgeRunnerOptions['revisionPolicy']>;
}): DeckForgeRunner {
  return new DeckForgeRunner({
    runtime: createNoopPresentationRuntime(),
    intentParser: createBasicIntentParser(),
    revisionPolicy: options.revisionPolicy,
  });
}
