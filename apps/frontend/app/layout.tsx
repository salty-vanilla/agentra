import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AuthProvider } from '@/components/auth-provider';
import { MockProvider } from '@/components/mock-provider';
import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
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
    <html lang="ja" className={cn('font-sans', geist.variable)} suppressHydrationWarning>
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
