'use client';

import type { ReactNode } from 'react';
import { SlideCommandBadge } from '@/components/slide-command-badge';
import { cn } from '@/lib/utils';

// Layout compensation: reserves space for the action bar to prevent layout shift
// when the autohiding action bar appears on hover.
const ACTION_BAR_HEIGHT = '-mb-7.5 min-h-7.5 pt-1.5';

export interface AssistantMessageViewProps {
  /** Rendered message content — MessagePrimitive.Parts in production, static JSX in Storybook */
  children: ReactNode;
  /** Rendered error display — MessageError in production, static JSX in Storybook */
  errorContent?: ReactNode;
  /** Footer slot for action bar and branch picker */
  footer?: ReactNode;
}

export function AssistantMessageView({
  children,
  errorContent,
  footer,
}: AssistantMessageViewProps) {
  return (
    <>
      <div
        data-slot="aui_assistant-message-content"
        className="wrap-break-word px-2 text-foreground leading-relaxed"
      >
        {children}
        {errorContent}
      </div>
      {footer !== undefined && (
        <div
          data-slot="aui_assistant-message-footer"
          className={cn('ml-2 flex items-center', ACTION_BAR_HEIGHT)}
        >
          {footer}
        </div>
      )}
    </>
  );
}

export interface UserMessageViewProps {
  /** Rendered message content — MessagePrimitive.Parts in production, static JSX in Storybook */
  children: ReactNode;
  /** When true, renders the SlideCommandBadge prefix */
  hasSlideCommand?: boolean;
  /** Edit button slot — UserActionBar in production */
  actionBar?: ReactNode;
  /** Branch picker slot rendered below the message bubble */
  branchPicker?: ReactNode;
}

export function UserMessageView({
  children,
  hasSlideCommand,
  actionBar,
  branchPicker,
}: UserMessageViewProps) {
  return (
    <>
      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word peer rounded-lg bg-muted px-4 py-2.5 text-foreground empty:hidden">
          {hasSlideCommand && (
            <span className="mr-1.5">
              <SlideCommandBadge />
            </span>
          )}
          {children}
        </div>
        {actionBar !== undefined && (
          <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
            {actionBar}
          </div>
        )}
      </div>
      {branchPicker}
    </>
  );
}
