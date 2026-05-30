'use client';

import {
  CogIcon,
  DatabaseIcon,
  GlobeIcon,
  LayoutIcon,
  SearchIcon,
  WrenchIcon,
} from 'lucide-react';
import type { ElementType, FC } from 'react';

interface PromptCard {
  category: string;
  icon: ElementType;
  title: string;
  prompt: string;
}

const PROMPT_CARDS: PromptCard[] = [
  {
    category: 'Webリサーチ',
    icon: GlobeIcon,
    title: '業界トレンド調査',
    prompt:
      '生成AIを活用したビジネス変革の最新トレンドを調査し、日本企業への示唆をまとめてください',
  },
  {
    category: 'Webリサーチ',
    icon: SearchIcon,
    title: '競合比較',
    prompt:
      'AWS BedrockとAzure OpenAI Serviceを技術・コスト・エンタープライズ対応の観点で比較分析してください',
  },
  {
    category: 'スライド生成',
    icon: LayoutIcon,
    title: '提案資料作成',
    prompt: '/slide 生成AIを活用した業務効率化の提案',
  },
  {
    category: 'スライド生成',
    icon: DatabaseIcon,
    title: 'レポート資料',
    prompt: '/slide 2025年 AI市場動向レポート 対象:経営層 7枚',
  },
  {
    category: '分析・まとめ',
    icon: WrenchIcon,
    title: '要点整理',
    prompt: 'DX推進において中小企業が直面する課題と解決策を構造化して説明してください',
  },
  {
    category: '分析・まとめ',
    icon: CogIcon,
    title: '製造業分析',
    prompt: '製造ラインの品質管理における代表的なKPIとその改善アプローチを教えてください',
  },
];

interface WelcomePromptCardsProps {
  onSelect: (prompt: string) => void;
}

export const WelcomePromptCards: FC<WelcomePromptCardsProps> = ({ onSelect }) => (
  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
    {PROMPT_CARDS.map((card) => {
      const Icon = card.icon;
      return (
        <button
          key={card.title}
          type="button"
          onClick={() => onSelect(card.prompt)}
          className="group flex cursor-pointer flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="text-[0.7rem] font-medium text-muted-foreground">
              {card.category}
            </span>
          </div>
          <p className="font-medium text-sm text-foreground">{card.title}</p>
          <p className="line-clamp-2 text-muted-foreground text-xs">{card.prompt}</p>
        </button>
      );
    })}
  </div>
);
