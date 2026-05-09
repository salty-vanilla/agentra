const MANUFACTURING_LINE_HINTS = [
  /manufacturing\s*line/i,
  /equipment/i,
  /anomaly/i,
  /\bkpi\b/i,
  /error\s*code/i,
  /\bE-[A-Z0-9-]+\b/,
  /production\s*result/i,
  /maintenance/i,
  /equipment\s*history/i,
  /line\s*status/i,
  /製造ライン/,
  /設備/,
  /異常/,
  /稼働率/,
  /スループット/,
  /エラーコード/,
  /生産実績/,
  /保全履歴/,
  /ライン状況/,
] as const;

const WEB_RESEARCH_HINTS = [
  /latest/i,
  /recent/i,
  /recently/i,
  /public\s+web/i,
  /external\s+docs?/i,
  /release\s+notes?/i,
  /pricing/i,
  /news/i,
  /comparison/i,
  /current\s+information/i,
  /update/i,
  /updates/i,
  /最新/,
  /最近/,
  /公開Web/,
  /外部ドキュメント/,
  /リリースノート/,
  /価格/,
  /ニュース/,
  /比較/,
  /アップデート/,
  /最新情報/,
] as const;

const PRESENTATION_HINTS = [
  /slides?/i,
  /pptx/i,
  /presentation/i,
  /スライド/,
  /PowerPoint/,
  /説明資料/,
  /資料作成/,
  /プレゼン/,
] as const;

const SELF_HANDLE_HINTS = [
  /simple\s+calculation/i,
  /calculate/i,
  /math/i,
  /date\s+normalization/i,
  /brief/i,
  /artifact\s+metadata/i,
  /簡単な計算/,
  /日付.*正規化/,
  /brief.*整理/,
  /成果物.*メタデータ/,
] as const;

export type RouterHandoffHint =
  | 'manufacturing_line'
  | 'web_research'
  | 'presentation'
  | 'self_handle'
  | 'unknown';

function matchesAny(patterns: readonly RegExp[], question: string): boolean {
  return patterns.some((pattern) => pattern.test(question));
}

export function classifyRouterHandoffHint(question: string): RouterHandoffHint {
  const normalizedQuestion = question.trim();

  if (matchesAny(PRESENTATION_HINTS, normalizedQuestion)) {
    return 'presentation';
  }

  if (matchesAny(WEB_RESEARCH_HINTS, normalizedQuestion)) {
    return 'web_research';
  }

  if (matchesAny(MANUFACTURING_LINE_HINTS, normalizedQuestion)) {
    return 'manufacturing_line';
  }

  if (matchesAny(SELF_HANDLE_HINTS, normalizedQuestion)) {
    return 'self_handle';
  }

  return 'unknown';
}
