import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { SonnerToaster } from '@/components/ui/sonner';
import '../app/globals.css';

initialize();

const preview: Preview = {
  loaders: [mswLoader],
  decorators: [
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: false, gcTime: 0 },
        },
      });
      return (
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Story />
            <SonnerToaster />
          </TooltipProvider>
        </QueryClientProvider>
      );
    },
  ],
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
    },
  },
};

export default preview;
