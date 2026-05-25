import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './sheet';

const LONG_TEXT = Array.from(
  { length: 30 },
  (_, i) =>
    `Item ${i + 1}: This is example content to demonstrate how the sheet panel handles long body text that exceeds the visible height and requires scrolling.`,
);

const meta = {
  title: 'UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RightOpen: Story = {
  render: () => (
    <Sheet open onOpenChange={() => {}}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Right Panel</SheetTitle>
          <SheetDescription>
            This sheet slides in from the right edge of the screen.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">
          Panel body content goes here. Use this area for navigation, forms, or detail
          views.
        </div>
        <SheetFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Apply</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftOpen: Story = {
  render: () => (
    <Sheet open onOpenChange={() => {}}>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Left Panel</SheetTitle>
          <SheetDescription>
            This sheet slides in from the left edge of the screen.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">
          Left panels are commonly used for navigation drawers or filter sidebars.
        </div>
        <SheetFooter>
          <Button variant="outline">Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LongContent: Story = {
  render: () => (
    <Sheet open onOpenChange={() => {}}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Long Content Sheet</SheetTitle>
          <SheetDescription>Scroll down to see all items.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 space-y-3">
          {LONG_TEXT.map((text) => (
            <p key={text} className="text-sm text-muted-foreground border-b pb-2">
              {text}
            </p>
          ))}
        </div>
        <SheetFooter>
          <Button>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const MobileWidth: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => (
    <Sheet open onOpenChange={() => {}}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Mobile Sheet</SheetTitle>
          <SheetDescription>
            This story renders at a mobile viewport to test the sheet panel width (3/4 of
            screen) on small screens.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4 text-sm text-muted-foreground">Sheet body content.</div>
        <SheetFooter>
          <Button variant="outline">Cancel</Button>
          <Button>OK</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
