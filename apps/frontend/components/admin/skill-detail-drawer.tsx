'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminSkillStats } from '@/lib/generated/model';
import { DetailRow } from './detail-row';

type Props = {
  skill: AdminSkillStats | null;
  onClose: () => void;
};

export function SkillDetailDrawer({ skill, onClose }: Props) {
  return (
    <Sheet open={skill !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>スキル詳細</SheetTitle>
        </SheetHeader>

        {skill && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow label="スキル" value={skill.skillName} />
              <DetailRow label="リクエスト" value={skill.requestCount.toLocaleString()} />
              <DetailRow label="平均時間" value={`${skill.avgDurationMs}ms`} />
              <DetailRow
                label="合計トークン"
                value={skill.totalTokens.toLocaleString()}
              />
              <DetailRow
                label="エラー率"
                value={`${(skill.errorRate * 100).toFixed(1)}%`}
              />
            </dl>

            <div className="pt-4">
              <Button variant="outline" disabled>
                関連トレースを表示
                <span className="ml-2 text-xs text-muted-foreground">(準備中)</span>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
