import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: "h1" | "h2" | "h3" | "p" | "span";
  variant?: "hero" | "heading" | "body" | "label";
  tone?: "default" | "accent";
}

export function Typography({ as, variant = "body", tone = "default", className, lang, ...props }: TypographyProps) {
  const Tag = as ?? (variant === "hero" ? "h1" : variant === "heading" ? "h2" : "p");
  return <Tag lang={lang} {...props} className={cn(
    "m-0",
    variant === "hero" && "font-serif font-semibold text-[clamp(3.625rem,8.1vw,7rem)] leading-[.87] tracking-[-.075em] [&_em]:font-medium [&_em]:text-accent",
    variant === "heading" && "font-serif font-semibold text-[30px] leading-[1.04] tracking-[-.04em]",
    variant === "body" && "font-sans text-[15px] leading-[1.75] text-muted-foreground",
    variant === "label" && "font-mono text-[10px] font-medium tracking-[.13em] uppercase text-muted-foreground",
    tone === "accent" && (variant === "label" ? "text-[color-mix(in_srgb,hsl(var(--accent))_85%,hsl(var(--foreground)))]" : "text-accent"),
    lang?.startsWith("ar") && "tracking-normal",
    className,
  )} />;
}
