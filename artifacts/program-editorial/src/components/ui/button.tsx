import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = accent action; secondary = bordered quiet action; text = inline link-like action; danger = destructive; pill = utility toggle. */
  variant?: "primary" | "secondary" | "text" | "danger" | "pill";
  /** sm = dense row/toolbar action (32px); md = default page action (36px). */
  size?: "sm" | "md";
  arrow?: boolean;
  /** Apply the shared action treatment to a single link or other semantic child. */
  asChild?: boolean;
}

export function buttonStyles({ variant = "primary", size = "md", className }: Pick<ButtonProps, "variant" | "size" | "className"> = {}) {
  const boxed = variant !== "text";
  return cn(
    "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans font-semibold leading-none transition-[transform,background-color,color,border-color,filter] duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none [&_svg]:shrink-0 [&_svg]:size-4",
    boxed && variant !== "pill" && (size === "sm" ? "h-8 px-2.5 text-body" : "h-9 px-3.5 text-body"),
    variant === "primary" && "rounded-md bg-accent text-accent-foreground enabled:hover:brightness-90",
    variant === "secondary" && "rounded-md border border-border bg-card text-foreground enabled:hover:bg-muted",
    variant === "danger" && "rounded-md border border-destructive/30 bg-card text-destructive enabled:hover:bg-destructive/10",
    variant === "text" && cn("bg-transparent text-primary px-1 rounded-sm enabled:hover:text-accent enabled:hover:underline underline-offset-4", size === "sm" ? "h-8 text-body" : "h-9 text-body"),
    variant === "pill" && "rounded-full border border-border bg-card/65 px-3.5 py-2 text-caption text-foreground hover:bg-card",
    className,
  );
}

/**
 * Source action, text-action, and language-pill patterns; native button behavior.
 * Children render directly inside an inline-flex row so icon + label stay on one line.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", arrow = false, asChild = false, type, className, style, children, ...props }, ref,
) {
  const Component = asChild ? Slot : "button";
  return <Component ref={ref} type={type ?? (asChild ? undefined : "button")} {...props}
    className={buttonStyles({ variant, size, className })}
    style={style}>
    <Slottable>{children}</Slottable>{arrow && <span aria-hidden="true" className="font-normal">{variant === "primary" ? "↗" : "→"}</span>}
  </Component>;
});
