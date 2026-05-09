import { describe, expect, it } from 'vitest';
import { classifyRouterHandoffHint } from '../../../agents/router/index.js';

describe('Router routing policy', () => {
  it('routes manufacturing-line questions to the manufacturing handoff', () => {
    expect(classifyRouterHandoffHint('ライン4の温度異常の原因候補を教えて')).toBe(
      'manufacturing_line',
    );
    expect(classifyRouterHandoffHint('E-TEMP-001 の意味と推奨対応を教えて')).toBe(
      'manufacturing_line',
    );
    expect(
      classifyRouterHandoffHint('今週のライン4の稼働率とスループットをまとめて'),
    ).toBe('manufacturing_line');
    expect(classifyRouterHandoffHint('設備M1の保全履歴を確認して')).toBe(
      'manufacturing_line',
    );
  });

  it('routes current and public information requests to web research', () => {
    expect(
      classifyRouterHandoffHint(
        '最新のBedrock Knowledge Basesの構造化データ対応を調べて',
      ),
    ).toBe('web_research');
    expect(classifyRouterHandoffHint('OpenAI APIの最新料金を確認して')).toBe(
      'web_research',
    );
    expect(classifyRouterHandoffHint('最近のAWS AgentCoreのアップデートを調べて')).toBe(
      'web_research',
    );
  });

  it('routes slide requests to presentation generation', () => {
    expect(classifyRouterHandoffHint('この内容でPowerPointを作って')).toBe(
      'presentation',
    );
    expect(classifyRouterHandoffHint('製造ラインPoCの説明資料を作成して')).toBe(
      'presentation',
    );
  });

  it('keeps simple self-contained work in the router', () => {
    expect(classifyRouterHandoffHint('簡単な計算で 3 + 4 を求めて')).toBe('self_handle');
  });
});
