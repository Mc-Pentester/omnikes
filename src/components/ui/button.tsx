import * as React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px"

    const variants = {
      default: "bg-primary text-white shadow-sm hover:bg-primary-hover",
      destructive: "bg-danger text-white shadow-sm hover:opacity-90",
      outline: "border border-border bg-surface text-foreground shadow-sm hover:bg-surface-muted",
      secondary: "bg-surface-muted text-foreground hover:bg-border",
      ghost: "text-muted hover:bg-surface-muted hover:text-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    }

    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-[var(--radius-sm)] px-3 text-sm",
      lg: "h-11 rounded-[var(--radius-md)] px-6",
      icon: "h-10 w-10",
    }

    return (
      <button
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className || ''}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
