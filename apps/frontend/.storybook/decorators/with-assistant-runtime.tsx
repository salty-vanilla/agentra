import { AssistantRuntimeProvider as AssistantRuntimeProviderCore } from '@assistant-ui/core/react';
import { type ChatModelAdapter, useLocalRuntime } from '@assistant-ui/react';
import type { Decorator } from '@storybook/nextjs-vite';
import { useMemo } from 'react';

const noopAdapter: ChatModelAdapter = {
  async *run() {
    // no-op: Storybook runtime that accepts messages but returns no AI response
  },
};

function LocalRuntimeProvider({ children }: { children: React.ReactNode }) {
  const adapter = useMemo(() => noopAdapter, []);
  const runtime = useLocalRuntime(adapter);
  return (
    <AssistantRuntimeProviderCore runtime={runtime}>
      {children}
    </AssistantRuntimeProviderCore>
  );
}

export const withAssistantRuntime: Decorator = (Story) => (
  <LocalRuntimeProvider>
    <Story />
  </LocalRuntimeProvider>
);
