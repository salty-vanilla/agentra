'use client';

import { useEffect, useState } from 'react';
import { isMockApiMode } from '@/lib/api-config';

export function useCurrentUserSub(): string | null {
  const [sub, setSub] = useState<string | null>(isMockApiMode ? 'demo-sub' : null);

  useEffect(() => {
    if (isMockApiMode) return;
    import('aws-amplify/auth')
      .then(({ fetchAuthSession }) => fetchAuthSession())
      .then((session) => {
        const payload = session.tokens?.accessToken?.payload;
        if (payload?.sub) setSub(payload.sub as string);
      })
      .catch(() => {});
  }, []);

  return sub;
}
