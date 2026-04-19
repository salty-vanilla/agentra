'use client';

import { getCurrentUser, signInWithRedirect } from 'aws-amplify/auth';
import { useEffect, useState } from 'react';
import { isMockApiMode } from '@/lib/api-config';
import { configureAmplify, isAmplifyAuthConfigured } from '@/lib/auth-config';

const amplifyConfigured = configureAmplify();

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    // Skip auth check in mock mode and in local real-mode without Cognito env.
    if (isMockApiMode || !isAmplifyAuthConfigured() || !amplifyConfigured) {
      setAuthState('authenticated');
      return;
    }

    getCurrentUser()
      .then(() => setAuthState('authenticated'))
      .catch(() => {
        signInWithRedirect().catch(() => setAuthState('unauthenticated'));
      });
  }, []);

  if (authState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return null;
  }

  return <>{children}</>;
}
