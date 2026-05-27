import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

let _client: CognitoIdentityProviderClient | undefined;

export function getCognitoClient(): CognitoIdentityProviderClient {
  if (!_client) {
    _client = new CognitoIdentityProviderClient({
      region: process.env.COGNITO_REGION ?? 'ap-northeast-1',
    });
  }
  return _client;
}

export function _resetCognitoClient(): void {
  _client = undefined;
}
