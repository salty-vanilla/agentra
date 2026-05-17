import { type Agent, type AgentResult, tool } from '@strands-agents/sdk';
import { normalizeSubAgentHandoffOutput } from '../agents/handoff-normalizer.js';
import { createManufacturingLineAgent } from '../agents/manufacturing-line/agent.js';
import {
  buildManufacturingLineAgentHandoffPrompt,
  type ManufacturingLineAgentHandoffInput,
  type ManufacturingLineAgentHandoffOutput,
  manufacturingLineAgentHandoffInputSchema,
  manufacturingLineAgentHandoffOutputSchema,
} from '../agents/manufacturing-line/handoff.js';

type ManufacturingLineAgentLike = Pick<Agent, 'invoke' | 'stream'>;
type ManufacturingLineAgentFactory = () => ManufacturingLineAgentLike;

export type SubAgentProgressEvent = {
  stage: string;
  status: 'running' | 'complete' | 'error';
  durationMs?: number;
  inputTokens?: number;
};

let cachedManufacturingLineAgent: ManufacturingLineAgentLike | undefined;

function getManufacturingLineAgent(): ManufacturingLineAgentLike {
  if (!cachedManufacturingLineAgent) {
    cachedManufacturingLineAgent = createManufacturingLineAgent();
  }

  return cachedManufacturingLineAgent;
}

function buildHandoffOutput(
  result: AgentResult,
  input: ManufacturingLineAgentHandoffInput,
): ManufacturingLineAgentHandoffOutput {
  return normalizeSubAgentHandoffOutput({
    value: result.structuredOutput ?? result.toString(),
    agentKind: 'manufacturing_line',
    agentName: 'Manufacturing Line Agent',
    handoffMode: input.mode ?? 'auto',
    fallbackErrorMessage:
      'Manufacturing Line Agent did not return a usable handoff payload.',
    metadata: {
      parentAgent: 'router-agent',
      childAgent: 'manufacturing-line-agent',
      handoffTool: 'invoke_manufacturing_line_agent',
      handoffMode: input.mode ?? 'auto',
    },
  }) as ManufacturingLineAgentHandoffOutput;
}

function buildErrorOutput(
  message: string,
  input: ManufacturingLineAgentHandoffInput,
): ManufacturingLineAgentHandoffOutput {
  return normalizeSubAgentHandoffOutput({
    value: undefined,
    agentKind: 'manufacturing_line',
    agentName: 'Manufacturing Line Agent',
    handoffMode: input.mode ?? 'auto',
    fallbackErrorMessage: message,
    metadata: {
      parentAgent: 'router-agent',
      childAgent: 'manufacturing-line-agent',
      handoffTool: 'invoke_manufacturing_line_agent',
      handoffMode: input.mode ?? 'auto',
    },
  }) as ManufacturingLineAgentHandoffOutput;
}

export async function* streamInvokeManufacturingLineAgentTool(
  input: ManufacturingLineAgentHandoffInput,
  dependencies: {
    agentFactory?: ManufacturingLineAgentFactory | undefined;
  } = {},
): AsyncGenerator<
  SubAgentProgressEvent,
  { status: 'success' | 'error'; content: [{ text: string }] },
  never
> {
  try {
    const agent = dependencies.agentFactory
      ? dependencies.agentFactory()
      : getManufacturingLineAgent();
    const prompt = buildManufacturingLineAgentHandoffPrompt(input);
    const agentStream = agent.stream(prompt, {
      structuredOutputSchema: manufacturingLineAgentHandoffOutputSchema,
    });

    const toolStarts = new Map<string, { name: string; startedAt: number }>();

    while (true) {
      const { value, done } = await agentStream.next();
      if (done) {
        const output = buildHandoffOutput(value, input);
        return { status: 'success', content: [{ text: JSON.stringify(output) }] };
      }

      const event = value;

      if (
        event.type === 'modelStreamUpdateEvent' &&
        event.event.type === 'modelContentBlockStartEvent' &&
        event.event.start?.type === 'toolUseStart'
      ) {
        const { toolUseId, name } = event.event.start;
        toolStarts.set(toolUseId, { name, startedAt: Date.now() });
        yield { stage: name, status: 'running' };
      } else if (
        event.type === 'contentBlockEvent' &&
        event.contentBlock.type === 'toolUseBlock'
      ) {
        const { toolUseId, name } = event.contentBlock;
        if (!toolStarts.has(toolUseId)) {
          toolStarts.set(toolUseId, { name, startedAt: Date.now() });
          yield { stage: name, status: 'running' };
        }
      } else if (event.type === 'toolResultEvent') {
        const start = toolStarts.get(event.result.toolUseId);
        toolStarts.delete(event.result.toolUseId);
        const stageName = start?.name ?? 'unknown';
        const durationMs = start ? Date.now() - start.startedAt : undefined;
        yield {
          stage: stageName,
          status:
            event.result.status === 'error' ? ('error' as const) : ('complete' as const),
          ...(durationMs !== undefined ? { durationMs } : {}),
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = buildErrorOutput(message, input);
    return { status: 'error', content: [{ text: JSON.stringify(output) }] };
  }
}

export async function executeInvokeManufacturingLineAgentTool(
  input: ManufacturingLineAgentHandoffInput,
  dependencies: {
    agentFactory?: (() => Pick<Agent, 'invoke'>) | undefined;
  } = {},
) {
  try {
    const agent = dependencies.agentFactory
      ? dependencies.agentFactory()
      : getManufacturingLineAgent();
    const prompt = buildManufacturingLineAgentHandoffPrompt(input);
    const result = await agent.invoke(prompt, {
      structuredOutputSchema: manufacturingLineAgentHandoffOutputSchema,
    });
    const output = buildHandoffOutput(result, input);
    return {
      status: 'success' as const,
      content: [{ text: JSON.stringify(output) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = buildErrorOutput(message, input);
    return {
      status: 'error' as const,
      content: [{ text: JSON.stringify(output) }],
    };
  }
}

const invokeManufacturingLineAgentTool = tool({
  name: 'invoke_manufacturing_line_agent',
  description:
    'Delegate manufacturing-line questions to the Manufacturing Line Agent and return a normalized handoff payload.',
  inputSchema: manufacturingLineAgentHandoffInputSchema,
  callback: (input) => streamInvokeManufacturingLineAgentTool(input),
});

export { invokeManufacturingLineAgentTool };
