import { forwardRef } from 'react';
import {
  Button as EditorialButton,
  buttonStyles,
  type ButtonProps as EditorialButtonProps,
} from '@workspace/program-editorial/components/ui/button';
import { cn } from '@/lib/utils';

/** Compatibility names for existing Radix/calendar callers; visuals belong to the design system. */
type LegacyVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type LegacySize = 'default' | 'sm' | 'lg' | 'icon';
export interface ButtonProps extends Omit<EditorialButtonProps, 'variant' | 'size'> {
  variant?: LegacyVariant | null;
  size?: LegacySize | null;
}

const variants: Record<LegacyVariant, NonNullable<EditorialButtonProps['variant']>> = {
  default: 'primary',
  destructive: 'danger',
  outline: 'secondary',
  secondary: 'secondary',
  ghost: 'text',
  link: 'text',
};

function sharedOptions({ variant, size, className }: Pick<ButtonProps, 'variant' | 'size' | 'className'>) {
  return {
    variant: variants[variant ?? 'default'],
    size: size === 'sm' ? 'sm' as const : 'md' as const,
    className: cn(size === 'icon' && 'w-9 px-0', className),
  };
}

export function buttonVariants(options: Pick<ButtonProps, 'variant' | 'size' | 'className'> = {}) {
  return buttonStyles(sharedOptions(options));
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, ...props }, ref,
) {
  return <EditorialButton ref={ref} {...sharedOptions({ variant, size, className })} {...props} />;
});
