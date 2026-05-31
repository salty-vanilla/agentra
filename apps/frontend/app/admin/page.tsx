import { BarChart3, BookOpen, Bot, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Section {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  enabled: boolean;
}

const SECTIONS: Section[] = [
  {
    label: '利用状況',
    description: '利用状況、トレース、エージェント活動を確認',
    href: '/admin/observability',
    icon: BarChart3,
    enabled: true,
  },
  {
    label: 'ユーザー',
    description: 'ユーザーとアクセス権を管理',
    href: '/admin/users',
    icon: Users,
    enabled: true,
  },
  {
    label: 'エージェント',
    description: 'エージェントとツールを設定',
    href: '/admin/agents',
    icon: Bot,
    enabled: false,
  },
  {
    label: 'RAG / KB',
    description: 'ナレッジベースを管理',
    href: '/admin/rag',
    icon: BookOpen,
    enabled: false,
  },
  {
    label: '設定',
    description: 'システム設定',
    href: '/admin/settings',
    icon: Settings,
    enabled: false,
  },
];

function SectionCard({ section }: { section: Section }) {
  const Icon = section.icon;
  const disabled = !section.enabled;
  // Dim only the informational icon/title/description on disabled cards. The
  // "準備中" badge is informational text (not a disabled control), so it must
  // keep full token contrast to meet WCAG AA — see issue #354 (L-2).
  const dimClass = disabled ? 'opacity-60' : undefined;
  const card = (
    <Card
      className={
        section.enabled
          ? 'hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer'
          : undefined
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <Icon className={cn('size-5 text-primary', dimClass)} />
          {disabled && <Badge variant="secondary">準備中</Badge>}
        </div>
        <CardTitle className={cn('mt-2', dimClass)}>{section.label}</CardTitle>
        <CardDescription className={dimClass}>{section.description}</CardDescription>
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
      <h1 className="text-2xl font-semibold mb-2">管理コンソール</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Agentra の運用状況を管理・監視します。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((section) => (
          <SectionCard key={section.href} section={section} />
        ))}
      </div>
    </div>
  );
}
