import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: "h1" | "h2" | "h3" | "p" | "span";
  variant?: "hero" | "heading" | "body" | "label";
  tone?: "default" | "accent";
}

export function Typography({ as, variant = "body", tone = "default", className, lang, dir, ...props }: TypographyProps) {
  const Tag = as ?? (variant === "hero" ? "h1" : variant === "heading" ? "h2" : "p");
  return <Tag lang={lang} dir={dir ?? (lang?.toLowerCase().startsWith("ar") ? "rtl" : undefined)} {...props} className={cn(
    "m-0 [overflow-wrap:anywhere] [&:lang(ar)]:font-sans [&:lang(ar)]:tracking-normal [&:lang(ar)]:normal-case [&:lang(ar)]:not-italic [&:lang(ar)_em]:not-italic",
    variant === "hero" && "font-sans font-medium text-[clamp(2.75rem,5vw,5.5rem)] leading-[1.12] tracking-[-.025em] [&_em]:font-medium [&_em]:text-accent [&:lang(ar)]:leading-[1.6]",
    variant === "heading" && "font-sans font-semibold text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.3] tracking-[-.015em] [&:lang(ar)]:leading-[1.6]",
    variant === "body" && "max-w-[65ch] font-sans text-base leading-[1.75] text-muted-foreground [&:lang(ar)]:leading-[1.85]",
    variant === "label" && "font-mono text-[11px] leading-[1.55] font-medium tracking-[.08em] uppercase text-muted-foreground [&:lang(ar)]:leading-[1.75]",
    tone === "accent" && (variant === "label" ? "text-[color-mix(in_srgb,hsl(var(--accent))_85%,hsl(var(--foreground)))]" : "text-accent"),
    className,
  )} />;
}
