import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default:
          'border-border bg-secondary text-secondary-foreground [a]:hover:bg-muted',
        secondary: 'border-border bg-muted text-muted-foreground [a]:hover:bg-muted/80',
        success:
          'border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-300 [a]:hover:bg-green-600/15',
        warning:
          'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/15 dark:text-amber-300 [a]:hover:bg-amber-500/15',
        info: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/15 dark:text-blue-300 [a]:hover:bg-blue-500/15',
        destructive:
          'border-destructive/20 bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
