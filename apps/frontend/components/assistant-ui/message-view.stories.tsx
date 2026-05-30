import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertTriangleIcon, BanIcon, XCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { messageFixtures } from '@/mocks/fixtures/messages';
import { AssistantMessageView, UserMessageView } from './message-view';

const meta = {
  title: 'Components/MessageView',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

export const AssistantShortMessage: StoryObj = {
  render: () => (
    <AssistantMessageView>
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        {messageFixtures.shortText}
      </p>
    </AssistantMessageView>
  ),
};

export const AssistantLongMarkdown: StoryObj = {
  render: () => (
    <AssistantMessageView>
      <div className="aui-md">
        <h1 className="aui-md-h1 mb-2 font-semibold text-base first:mt-0 last:mb-0">
          Analysis Result
        </h1>
        <h2 className="aui-md-h2 mt-3 mb-1.5 font-semibold text-sm first:mt-0 last:mb-0">
          Key Findings
        </h2>
        <ul className="aui-md-ul my-2 ml-4 list-disc marker:text-muted-foreground [&>li]:mt-1">
          <li className="aui-md-li leading-normal">
            Finding one: performance improvements in the rendering pipeline
          </li>
          <li className="aui-md-li leading-normal">
            Finding two: memory usage reduced by extracting shared utilities
          </li>
          <li className="aui-md-li leading-normal">
            Finding three: test coverage increased to 82%
          </li>
        </ul>
        <h2 className="aui-md-h2 mt-3 mb-1.5 font-semibold text-sm first:mt-0 last:mb-0">
          Recommendations
        </h2>
        <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
          Consider adopting the new component patterns to align with the Storybook-driven
          approach.
        </p>
        <h2 className="aui-md-h2 mt-3 mb-1.5 font-semibold text-sm first:mt-0 last:mb-0">
          Summary
        </h2>
        <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
          The overall assessment shows three areas of improvement that can be addressed
          incrementally without disrupting production behavior.
        </p>
      </div>
    </AssistantMessageView>
  ),
};

export const AssistantWithCodeBlock: StoryObj = {
  render: () => (
    <AssistantMessageView>
      <div className="aui-md">
        <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
          Here is an example function:
        </p>
        <div className="aui-code-header-root mt-2.5 flex items-center justify-between rounded-t-lg border border-border/50 border-b-0 bg-muted/50 px-3 py-1.5 text-xs">
          <span className="aui-code-header-language font-medium text-muted-foreground lowercase">
            {messageFixtures.codeBlockLang}
          </span>
        </div>
        <pre className="aui-md-pre overflow-x-auto rounded-t-none rounded-b-lg border border-border/50 border-t-0 bg-muted/30 p-3 text-xs leading-relaxed">
          <code>{messageFixtures.codeBlockCode}</code>
        </pre>
      </div>
    </AssistantMessageView>
  ),
};

export const AssistantError: StoryObj = {
  render: () => (
    <AssistantMessageView
      errorContent={
        <div className="aui-message-error-root mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5">
          <span className="aui-message-error-message line-clamp-2">
            {messageFixtures.errorText}
          </span>
        </div>
      }
    >
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        I ran into a problem while generating the response.
      </p>
    </AssistantMessageView>
  ),
};

export const UserMessage: StoryObj = {
  render: () => (
    <UserMessageView>
      <span>{messageFixtures.userShort}</span>
    </UserMessageView>
  ),
};

export const UserMessageWithSlide: StoryObj = {
  render: () => (
    <UserMessageView hasSlideCommand>
      <span>{messageFixtures.userWithSlideText}</span>
    </UserMessageView>
  ),
};

export const MobileWidth: StoryObj = {
  decorators: [
    (Story) => (
      <div style={{ width: '320px' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <AssistantMessageView>
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        {messageFixtures.shortText}
      </p>
    </AssistantMessageView>
  ),
};

export const AssistantWithPersistedError: StoryObj = {
  render: () => (
    <AssistantMessageView
      errorContent={
        <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <XCircleIcon className="size-4 shrink-0 text-destructive" />
            <span className="font-medium text-destructive">生成に失敗しました</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-auto px-2 py-0.5 text-destructive text-xs hover:bg-destructive/10"
              disabled
            >
              再送信
            </Button>
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer text-muted-foreground text-xs">
              詳細
            </summary>
            <p className="mt-1 whitespace-pre-wrap break-all text-muted-foreground text-xs">
              {messageFixtures.errorText}
            </p>
          </details>
        </div>
      }
    >
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        {messageFixtures.shortText}
      </p>
    </AssistantMessageView>
  ),
};

export const AssistantWithLongPersistedError: StoryObj = {
  render: () => (
    <AssistantMessageView
      errorContent={
        <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <XCircleIcon className="size-4 shrink-0 text-destructive" />
            <span className="font-medium text-destructive">生成に失敗しました</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-auto px-2 py-0.5 text-destructive text-xs hover:bg-destructive/10"
              disabled
            >
              再送信
            </Button>
          </div>
          <details open className="mt-1">
            <summary className="cursor-pointer text-muted-foreground text-xs">
              詳細
            </summary>
            <p className="mt-1 whitespace-pre-wrap break-all text-muted-foreground text-xs">
              Error: AgentCore invocation failed after 3 retries.{'\n'}
              Caused by: ThrottlingException: Rate limit exceeded for model
              claude-3-5-sonnet.{'\n'}
              Stack trace at BedrockAgentRuntime.invokeAgent (/app/dist/runtime.js:42:18)
              {'\n'}
              at AgentHandler.handle (/app/dist/handler.js:87:12)
            </p>
          </details>
        </div>
      }
    >
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        {messageFixtures.shortText}
      </p>
    </AssistantMessageView>
  ),
};

export const AssistantCancelled: StoryObj = {
  render: () => (
    <AssistantMessageView
      errorContent={
        <div className="mt-2 flex items-center gap-2 rounded-md border border-muted-foreground/20 bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          <BanIcon className="size-4 shrink-0" />
          生成がキャンセルされました
        </div>
      }
    >
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        (partial content before cancel...)
      </p>
    </AssistantMessageView>
  ),
};

export const AssistantWithToolFailureWarning: StoryObj = {
  render: () => (
    <AssistantMessageView>
      <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
        <AlertTriangleIcon className="size-4 shrink-0" />
        一部の処理が失敗しました。回答が不完全な場合があります
      </div>
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        {messageFixtures.shortText}
      </p>
    </AssistantMessageView>
  ),
};

export const AssistantWithErrorAndToolFailure: StoryObj = {
  render: () => (
    <AssistantMessageView
      errorContent={
        <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <XCircleIcon className="size-4 shrink-0 text-destructive" />
            <span className="font-medium text-destructive">生成に失敗しました</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-auto px-2 py-0.5 text-destructive text-xs hover:bg-destructive/10"
              disabled
            >
              再送信
            </Button>
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer text-muted-foreground text-xs">
              詳細
            </summary>
            <p className="mt-1 whitespace-pre-wrap break-all text-muted-foreground text-xs">
              {messageFixtures.errorText}
            </p>
          </details>
        </div>
      }
    >
      <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
        <AlertTriangleIcon className="size-4 shrink-0" />
        一部の処理が失敗しました。回答が不完全な場合があります
      </div>
      <p className="aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0">
        {messageFixtures.shortText}
      </p>
    </AssistantMessageView>
  ),
};
