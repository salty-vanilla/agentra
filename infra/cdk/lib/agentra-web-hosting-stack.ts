import { CfnOutput, CfnParameter, Fn, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnApp, CfnBranch } from 'aws-cdk-lib/aws-amplify';
import type { Construct } from 'constructs';
import type { AgentraAppStack } from './agentra-app-stack.js';
import type { AgentraDataAuthStack } from './agentra-data-auth-stack.js';

export interface AgentraWebHostingStackProps extends StackProps {
  appStack: AgentraAppStack;
  dataAuthStack: AgentraDataAuthStack;
  stage: string;
}

const AMPLIFY_BUILD_SPEC = [
  'version: 1',
  'applications:',
  '  - appRoot: apps/frontend',
  '    frontend:',
  '      phases:',
  '        preBuild:',
  '          commands:',
  '            - corepack enable',
  '            - pnpm install --frozen-lockfile',
  '        build:',
  '          commands:',
  '            - pnpm --filter @agentra/shared build',
  '            - pnpm --filter @agentra/frontend build',
  '      artifacts:',
  '        baseDirectory: out',
  '        files:',
  "          - '**/*'",
  '      cache:',
  '        paths:',
  '          - ../../node_modules/**/*',
  '          - ../../.pnpm-store/**/*',
].join('\n');

export class AgentraWebHostingStack extends Stack {
  constructor(scope: Construct, id: string, props: AgentraWebHostingStackProps) {
    super(scope, id, props);

    const repositoryUrl = new CfnParameter(this, 'AmplifyRepositoryUrl', {
      type: 'String',
      description: 'GitHub repository URL in format: https://github.com/<owner>/<repo>',
      default: 'https://github.com/owner/repo',
    });

    const branchName = new CfnParameter(this, 'AmplifyBranchName', {
      type: 'String',
      description: 'Git branch connected to Amplify Hosting',
      default: 'main',
    });

    const githubAccessToken = new CfnParameter(this, 'AmplifyGithubAccessToken', {
      type: 'String',
      noEcho: true,
      description:
        'GitHub personal access token used by Amplify to connect the repository',
    });

    const amplifyApp = new CfnApp(this, 'WebApp', {
      name: `agentra-web-${props.stage}`,
      description: 'Agentra frontend hosting managed by AWS Amplify',
      repository: repositoryUrl.valueAsString,
      accessToken: githubAccessToken.valueAsString,
      platform: 'WEB',
      enableBranchAutoDeletion: true,
      buildSpec: AMPLIFY_BUILD_SPEC,
    });

    const mainBranch = new CfnBranch(this, 'WebMainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: branchName.valueAsString,
      stage: props.stage === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT',
      enableAutoBuild: true,
      environmentVariables: [
        {
          name: 'AMPLIFY_MONOREPO_APP_ROOT',
          value: 'apps/frontend',
        },
        {
          name: 'NEXT_PUBLIC_API_BASE_URL',
          value: props.appStack.apiEndpoint,
        },
        {
          name: 'NEXT_PUBLIC_STREAMING_API_BASE_URL',
          value: props.appStack.streamingApiEndpoint,
        },
        {
          name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID',
          value: props.dataAuthStack.userPool.userPoolId,
        },
        {
          name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID',
          value: props.dataAuthStack.userPoolClient.userPoolClientId,
        },
        {
          name: 'NEXT_PUBLIC_COGNITO_DOMAIN',
          value: props.dataAuthStack.cognitoDomain,
        },
        {
          name: 'NEXT_PUBLIC_APP_URL',
          value: Fn.join('', [
            'https://',
            branchName.valueAsString,
            '.',
            amplifyApp.attrDefaultDomain,
          ]),
        },
      ],
    });

    mainBranch.node.addDependency(amplifyApp);

    new CfnOutput(this, 'AmplifyAppId', { value: amplifyApp.attrAppId });
    new CfnOutput(this, 'AmplifyDefaultDomain', { value: amplifyApp.attrDefaultDomain });
    new CfnOutput(this, 'AmplifyMainBranchName', { value: mainBranch.attrBranchName });
    new CfnOutput(this, 'AmplifyMainBranchUrl', {
      value: Fn.join('', [
        'https://',
        branchName.valueAsString,
        '.',
        amplifyApp.attrDefaultDomain,
      ]),
    });
  }
}
