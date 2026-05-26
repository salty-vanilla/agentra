import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  BotIcon,
  FileTextIcon,
  HomeIcon,
  MessageSquareIcon,
  SearchIcon,
  SettingsIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar';

const NAV_ITEMS = [
  { label: 'Home', icon: HomeIcon },
  { label: 'Conversations', icon: MessageSquareIcon },
  { label: 'Agents', icon: BotIcon },
  { label: 'Documents', icon: FileTextIcon },
  { label: 'Search', icon: SearchIcon },
];

const MANY_ITEMS = Array.from({ length: 20 }, (_, i) => ({
  label: `Item ${i + 1}`,
  icon: FileTextIcon,
}));

function SidebarDemo({
  items = NAV_ITEMS,
}: {
  items?: { label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <>
      <Sidebar>
        <SidebarHeader className="px-4 py-3 font-semibold text-sm">Agentra</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton tooltip={item.label}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Settings">
                <SettingsIcon className="size-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">Main content area</span>
        </header>
        <div className="p-4 text-sm text-muted-foreground">
          Page content renders here beside the sidebar.
        </div>
      </SidebarInset>
    </>
  );
}

const meta = {
  title: 'UI/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  render: () => (
    <SidebarProvider defaultOpen>
      <div style={{ height: '600px', display: 'flex', width: '100%' }}>
        <SidebarDemo />
      </div>
    </SidebarProvider>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <div style={{ height: '600px', display: 'flex', width: '100%' }}>
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-4 py-3 font-semibold text-sm">A</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton tooltip={item.label}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings">
                  <SettingsIcon className="size-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground">
              Icon-only collapsed state
            </span>
          </header>
          <div className="p-4 text-sm text-muted-foreground">
            Sidebar uses <code>collapsible="icon"</code> — icons remain visible when
            collapsed. Hover over an icon to see the tooltip label.
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  ),
};

export const WithManyItems: Story = {
  render: () => (
    <SidebarProvider defaultOpen>
      <div style={{ height: '600px', display: 'flex', width: '100%' }}>
        <SidebarDemo items={MANY_ITEMS} />
      </div>
    </SidebarProvider>
  ),
};

export const MobileWidth: Story = {
  render: () => (
    <SidebarProvider defaultOpen>
      <div style={{ height: '600px', display: 'flex', width: '320px' }}>
        <SidebarDemo />
      </div>
    </SidebarProvider>
  ),
};
