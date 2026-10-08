import * as React from "react"

import { Button } from "./button"

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, title, description, actionLabel, onAction, children, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={`flex min-h-48 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-muted/50 px-6 py-10 text-center ${className || ''}`}
      {...props}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <span aria-hidden="true" className="text-xl">+</span>
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button type="button" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {children}
    </div>
  )
)
EmptyState.displayName = "EmptyState"

export { EmptyState }
