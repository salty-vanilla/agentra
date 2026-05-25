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
          <SheetTitle>Skill Detail</SheetTitle>
        </SheetHeader>

        {skill && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow label="Skill" value={skill.skillName} />
              <DetailRow label="Requests" value={skill.requestCount.toLocaleString()} />
              <DetailRow label="Avg Duration" value={`${skill.avgDurationMs}ms`} />
              <DetailRow
                label="Total Tokens"
                value={skill.totalTokens.toLocaleString()}
              />
              <DetailRow
                label="Error Rate"
                value={`${(skill.errorRate * 100).toFixed(1)}%`}
              />
            </dl>

            <div className="pt-4">
              <Button variant="outline" disabled>
                View related traces →
                <span className="ml-2 text-xs text-muted-foreground">(coming soon)</span>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
