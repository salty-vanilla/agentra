import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
        <div className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
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
