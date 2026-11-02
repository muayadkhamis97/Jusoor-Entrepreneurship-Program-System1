import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "text" | "pill";
  arrow?: boolean;
}

/** Source action, text-action, and language-pill patterns; native button behavior. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", arrow = false, type = "button", className, style, children, ...props }, ref,
) {
  return <button ref={ref} type={type} {...props}
    className={cn(
      "inline-flex max-w-full items-center gap-3 font-sans font-semibold transition-[transform,background-color,color] duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none",
      variant === "primary" && "justify-between bg-accent text-accent-foreground px-[17px] py-[15px] text-xs hover:brightness-90 enabled:hover:-translate-y-0.5 motion-reduce:enabled:hover:translate-y-0",
      variant === "text" && "bg-transparent text-primary px-0 py-1 text-xs hover:text-[color-mix(in_srgb,hsl(var(--accent))_85%,hsl(var(--foreground)))] text-start",
      variant === "pill" && "rounded-full border border-border bg-card/65 px-3.5 py-2.5 text-[11px] text-foreground enabled:hover:-translate-y-0.5 hover:bg-card motion-reduce:enabled:hover:translate-y-0",
      className,
    )}
    style={{ ...(variant === "primary" ? { borderRadius: "var(--radius) calc(var(--radius) * 14 / 3) var(--radius) calc(var(--radius) * 14 / 3)" } : {}), ...style }}>
    <span>{children}</span>{arrow && <span aria-hidden="true" className="text-lg font-normal">{variant === "primary" ? "↗" : "→"}</span>}
  </button>;
});
