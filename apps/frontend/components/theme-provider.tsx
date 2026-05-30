'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * App-wide theme provider.
 *
 * Toggles the `.dark` class on <html> so the OKLCH stone tokens in
 * `app/globals.css` switch between light and dark. System preference is the
 * default; the user's explicit choice is persisted by next-themes.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
