import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AgentraAppStack } from './agentra-app-stack.js';
import { AgentraDataAuthStack } from './agentra-data-auth-stack.js';

function makeStacks() {
  const app = new App();
  const dataAuthStack = new AgentraDataAuthStack(app, 'AgentraDataAuthStack-test', {
    stage: 'dev',
  });
  const appStack = new AgentraAppStack(app, 'AgentraAppStack-test', {
    dataAuthStack,
    allowedCorsOrigins: ['http://localhost:3000'],
  });
  return { appStack, template: Template.fromStack(appStack) };
}

describe('AgentraAppStack', () => {
  it('creates an HTTP API for normal routes (not a REST API)', () => {
    const { template } = makeStacks();

    // HTTP API v2 resource type
    const httpApis = template.findResources('AWS::ApiGatewayV2::Api');
    expect(Object.keys(httpApis).length).toBeGreaterThanOrEqual(1);

    // All HTTP APIs should be HTTP protocol, not WEBSOCKET
    for (const api of Object.values(httpApis)) {
      expect(
        (api as { Properties: { ProtocolType: string } }).Properties.ProtocolType,
      ).toBe('HTTP');
    }
  });

  it('keeps /chat on a REST API (v1) for response-stream support', () => {
    const { template } = makeStacks();

    // REST API v1 resource type must exist for streaming
    const restApis = template.findResources('AWS::ApiGateway::RestApi');
    expect(Object.keys(restApis).length).toBe(1);
  });

  it('registers all normal CRUD routes on the HTTP API', () => {
    const { template } = makeStacks();

    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    const routeKeys = Object.values(routes).map(
      (r) => (r as { Properties: { RouteKey: string } }).Properties.RouteKey,
    );

    expect(routeKeys).toContain('GET /health');
    expect(routeKeys).toContain('GET /threads');
    expect(routeKeys).toContain('POST /threads');
    expect(routeKeys).toContain('GET /threads/{threadId}');
    expect(routeKeys).toContain('PATCH /threads/{threadId}');
    expect(routeKeys).toContain('DELETE /threads/{threadId}');
    expect(routeKeys).toContain('GET /threads/{threadId}/messages');
  });

  it('creates two Lambda functions: one buffered and one streaming', () => {
    const { template } = makeStacks();

    const functions = template.findResources('AWS::Lambda::Function');
    const envValues = Object.values(functions)
      .map(
        (f) =>
          (
            f as {
              Properties: {
                Environment?: { Variables?: { AWS_LWA_INVOKE_MODE?: string } };
              };
            }
          ).Properties.Environment?.Variables?.AWS_LWA_INVOKE_MODE,
      )
      .filter(Boolean);

    expect(envValues).toContain('buffered');
    expect(envValues).toContain('response_stream');
  });
});
