import * as React from 'react';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={`animate-pulse rounded-[var(--radius-md)] bg-surface-muted ${className || ''}`}
      {...props}
    />
  ),
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
