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

  // Token Storage Decision: localStorage (Amplify default)
  //
  // Current approach: Cognito tokens are stored in browser localStorage (Amplify default).
  // This is a deliberate choice with known tradeoffs:
  //
  // PROS:
  // - Standard SPA token persistence across browser tabs and restarts
  // - Works with current OAuth redirect flow
  //
  // CONS:
  // - Tokens are readable by JavaScript (XSS risk)
  //
  // MITIGATIONS:
  // 1. Strict Content Security Policy (CSP):
  //    - Disable inline scripts, unsafe-eval
  //    - Whitelist external script sources
  //    - Consider script-src nonce or hash-based validation
  //
  // 2. Regular security audits and dependency scanning
  //
  // FUTURE IMPROVEMENTS:
  // 1. HttpOnly/Secure/SameSite cookies (requires backend changes to manage tokens)
  // 2. Backend-managed session with secure cookie + CSRF protection
  // 3. Custom storage adapter using sessionStorage (cleared on browser close)
  //
  // See: https://owasp.org/www-community/attacks/xss/
  // See: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

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
