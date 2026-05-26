'use client';

import type { FC } from 'react';

interface PromptCard {
  category: string;
  icon: string;
  title: string;
  prompt: string;
}

const PROMPT_CARDS: PromptCard[] = [
  {
    category: 'Webリサーチ',
    icon: '🔍',
    title: '業界トレンド調査',
    prompt:
      '生成AIを活用したビジネス変革の最新トレンドを調査し、日本企業への示唆をまとめてください',
  },
  {
    category: 'Webリサーチ',
    icon: '⚖️',
    title: '競合比較',
    prompt:
      'AWS BedrockとAzure OpenAI Serviceを技術・コスト・エンタープライズ対応の観点で比較分析してください',
  },
  {
    category: 'スライド生成',
    icon: '📊',
    title: '提案資料作成',
    prompt: '/slide 生成AIを活用した業務効率化の提案',
  },
  {
    category: 'スライド生成',
    icon: '📈',
    title: 'レポート資料',
    prompt: '/slide 2025年 AI市場動向レポート 対象:経営層 7枚',
  },
  {
    category: '分析・まとめ',
    icon: '📝',
    title: '要点整理',
    prompt: 'DX推進において中小企業が直面する課題と解決策を構造化して説明してください',
  },
  {
    category: '分析・まとめ',
    icon: '🏭',
    title: '製造業分析',
    prompt: '製造ラインの品質管理における代表的なKPIとその改善アプローチを教えてください',
  },
];

interface WelcomePromptCardsProps {
  onSelect: (prompt: string) => void;
}

export const WelcomePromptCards: FC<WelcomePromptCardsProps> = ({ onSelect }) => (
  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
    {PROMPT_CARDS.map((card) => (
      <button
        key={card.title}
        type="button"
        onClick={() => onSelect(card.prompt)}
        className="group flex cursor-pointer flex-col gap-1 rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-base">
            {card.icon}
          </span>
          <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
            {card.category}
          </span>
        </div>
        <p className="font-medium text-sm text-foreground">{card.title}</p>
        <p className="line-clamp-2 text-muted-foreground text-xs">{card.prompt}</p>
      </button>
    ))}
  </div>
);
