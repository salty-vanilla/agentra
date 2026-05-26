import { BarChart3, BookOpen, Bot, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Section {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  enabled: boolean;
}

const SECTIONS: Section[] = [
  {
    label: 'Observability',
    description: 'Usage metrics, traces, and agent activity',
    href: '/admin/observability',
    icon: BarChart3,
    enabled: true,
  },
  {
    label: 'Users',
    description: 'Manage users and access',
    href: '/admin/users',
    icon: Users,
    enabled: true,
  },
  {
    label: 'Agents',
    description: 'Configure agents and tools',
    href: '/admin/agents',
    icon: Bot,
    enabled: false,
  },
  {
    label: 'RAG / KB',
    description: 'Knowledge base management',
    href: '/admin/rag',
    icon: BookOpen,
    enabled: false,
  },
  {
    label: 'Settings',
    description: 'System configuration',
    href: '/admin/settings',
    icon: Settings,
    enabled: false,
  },
];

function SectionCard({ section }: { section: Section }) {
  const Icon = section.icon;
  const card = (
    <Card
      className={
        section.enabled
          ? 'hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer'
          : 'opacity-60'
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <Icon className="size-5 text-primary" />
          {!section.enabled && <Badge variant="secondary">Coming Soon</Badge>}
        </div>
        <CardTitle className="mt-2">{section.label}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (!section.enabled) return card;

  return (
    <Link href={section.href} className="block">
      {card}
    </Link>
  );
}

export default function AdminHomePage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Admin Console</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage and monitor your Agentra deployment.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((section) => (
          <SectionCard key={section.href} section={section} />
        ))}
      </div>
    </div>
  );
}
