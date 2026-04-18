'use client';

import { APP_NAME } from '@agentra/shared';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { isMockApiMode } from '@/lib/api-config';

export function MockProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(!isMockApiMode);

  useEffect(() => {
    if (!isMockApiMode) {
      return;
    }

    let isMounted = true;

    const startWorker = async () => {
      try {
        const { enableMocking } = await import('@/mocks/browser');
        await enableMocking();
      } catch (error) {
        console.error('Failed to start MSW.', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    void startWorker();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isReady) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-6">
        <div className="max-w-sm space-y-2 text-center">
          <p className="font-semibold text-lg tracking-tight">{APP_NAME}</p>
          <p className="text-muted-foreground text-sm leading-6">
            Mock API を初期化しています。frontend 単体での画面開発を優先するモードです。
          </p>
        </div>
      </div>
    );
  }

  return children;
}
