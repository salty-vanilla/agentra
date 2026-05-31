import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { IBM_Plex_Sans, IBM_Plex_Sans_JP } from 'next/font/google';
import { SonnerToaster } from '@/components/ui/sonner';
import '../app/globals.css';

// Mirror app/layout.tsx so Storybook renders the adopted typeface and visual
// diffs stay stable instead of falling back to the system sans.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-latin',
});
const ibmPlexSansJp = IBM_Plex_Sans_JP({
  weight: ['400', '500', '700'],
  preload: false,
  variable: '--font-sans-jp',
});
const fontVariables = `${ibmPlexSans.variable} ${ibmPlexSansJp.variable}`;

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
            <div className={`${fontVariables} font-sans`}>
              <Story />
              <SonnerToaster />
            </div>
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
