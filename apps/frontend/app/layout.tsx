import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Sans_JP } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AuthProvider } from '@/components/auth-provider';
import { MockProvider } from '@/components/mock-provider';
import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import './globals.css';

// Latin / UI text. Provides --font-sans-latin; the JP face below fills CJK
// glyphs through the cascade declared in globals.css (@theme inline).
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-latin',
});

// Japanese text. JP webfonts have no Latin subset, so disable preload (the
// face still loads on demand via font-display: swap) to keep first paint light.
const ibmPlexSansJp = IBM_Plex_Sans_JP({
  weight: ['400', '500', '700'],
  preload: false,
  variable: '--font-sans-jp',
});

export const metadata: Metadata = {
  title: 'Agentra',
  description: 'Internal agent chat PoC for AWS and AgentCore integration.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={cn('font-sans', ibmPlexSans.variable, ibmPlexSansJp.variable)}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <ThemeProvider>
          <NuqsAdapter>
            <AuthProvider>
              <MockProvider>
                <QueryProvider>
                  <TooltipProvider>
                    {children}
                    <SonnerToaster />
                  </TooltipProvider>
                </QueryProvider>
              </MockProvider>
            </AuthProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
