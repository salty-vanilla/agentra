import { Amplify } from 'aws-amplify';

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function isAmplifyAuthConfigured() {
  return Boolean(userPoolId && userPoolClientId && domain);
}

export function configureAmplify() {
  if (!isAmplifyAuthConfigured()) {
    // Local dev can run without Cognito.
    return false;
  }

  const resolvedUserPoolId = userPoolId;
  const resolvedUserPoolClientId = userPoolClientId;
  const resolvedDomain = domain;
  if (!resolvedUserPoolId || !resolvedUserPoolClientId || !resolvedDomain) {
    return false;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: resolvedUserPoolId,
        userPoolClientId: resolvedUserPoolClientId,
        loginWith: {
          oauth: {
            domain: resolvedDomain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [appUrl],
            redirectSignOut: [appUrl],
            responseType: 'code',
          },
        },
      },
    },
  });

  return true;
}
