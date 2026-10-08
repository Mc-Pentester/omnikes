import * as React from 'react';

import { Button } from './button';
import { Card } from './card';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  tone?: 'primary' | 'warning' | 'info' | 'neutral';
  icon?: 'box' | 'store' | 'search' | 'spark';
}

const toneClasses = {
  primary: 'bg-primary-soft text-primary',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-muted text-muted',
};

function EmptyIcon({ icon = 'box' }: { icon?: EmptyStateProps['icon'] }) {
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (icon === 'store') {
    return <svg {...common}><path d="M4 10v9h16v-9" /><path d="M3 10l1.5-5h15L21 10" /><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M9 19v-5h6v5" /></svg>;
  }

  if (icon === 'search') {
    return <svg {...common}><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4 4" /></svg>;
  }

  if (icon === 'spark') {
    return <svg {...common}><path d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3Z" /><path d="m19 16 .5 2.5L22 19l-2.5.5L19 22l-.5-2.5L16 19l2.5-.5L19 16Z" /></svg>;
  }

  return <svg {...common}><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /><path d="m8 6 8 4" /></svg>;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      title,
      description,
      actionLabel,
      onAction,
      secondaryActionLabel,
      onSecondaryAction,
      tone = 'primary',
      icon = 'box',
      children,
      ...props
    },
    ref
  ) => (
    <Card ref={ref} role="status" className={`p-8 sm:p-10 ${className || ''}`} {...props}>
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${toneClasses[tone]}`}>
          <EmptyIcon icon={icon} />
        </div>
        <h3 className="mt-5 text-xl font-bold text-foreground">{title}</h3>
        {description ? <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p> : null}
        {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {actionLabel && onAction ? <Button type="button" onClick={onAction}>{actionLabel}</Button> : null}
            {secondaryActionLabel && onSecondaryAction ? (
              <Button type="button" variant="outline" onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </Card>
  )
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
