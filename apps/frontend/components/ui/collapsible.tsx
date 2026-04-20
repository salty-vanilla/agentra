'use client';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as React from 'react';

const Collapsible = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root>
>(({ ...props }, ref) => {
  return <CollapsiblePrimitive.Root data-slot="collapsible" ref={ref} {...props} />;
});

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>
>(({ ...props }, ref) => {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" ref={ref} {...props} />
  );
});

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ ...props }, ref) => {
  return (
    <CollapsiblePrimitive.Content data-slot="collapsible-content" ref={ref} {...props} />
  );
});

Collapsible.displayName = CollapsiblePrimitive.Root.displayName;
CollapsibleTrigger.displayName = CollapsiblePrimitive.Trigger.displayName;
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
