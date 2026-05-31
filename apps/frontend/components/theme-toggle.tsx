'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { CheckIcon, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * Light / Dark / System theme switcher.
 *
 * Uses next-themes; the choice is persisted and applied via the `.dark` class
 * on <html>. Until mounted the trigger renders a stable, theme-agnostic icon so
 * server and client markup match (avoids a hydration mismatch).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="テーマを切り替える">
          <Sun className="hidden [.dark_&]:block" aria-hidden="true" />
          <Moon className="block [.dark_&]:hidden" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={mounted && theme ? theme : ''}
          onValueChange={setTheme}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuPrimitive.RadioItem
              key={value}
              value={value}
              className={cn(
                'grid grid-cols-[1rem_1fr_1rem] items-center gap-2',
                'cursor-default select-none rounded-sm px-2 py-1.5 text-sm outline-none',
                'transition-colors focus:bg-accent focus:text-accent-foreground',
                'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
              <span
                className="flex size-4 items-center justify-center"
                aria-hidden="true"
              >
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon className="size-3.5" />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
