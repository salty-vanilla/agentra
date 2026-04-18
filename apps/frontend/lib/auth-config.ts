import { Amplify } from 'aws-amplify';

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function configureAmplify() {
  if (!userPoolId || !userPoolClientId || !domain) {
    // In mock mode the env vars may be absent — skip configuration
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [appUrl],
            redirectSignOut: [appUrl],
            responseType: 'code',
          },
        },
      },
    },
  });
}
