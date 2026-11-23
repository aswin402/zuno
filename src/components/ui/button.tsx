import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-secondary',
        ghost:
          'text-muted-foreground hover:bg-secondary hover:text-foreground',
        destructive:
          'bg-secondary text-muted-foreground hover:bg-destructive/15 hover:text-red-400',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7',
        'icon-play': 'h-9 w-9 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
