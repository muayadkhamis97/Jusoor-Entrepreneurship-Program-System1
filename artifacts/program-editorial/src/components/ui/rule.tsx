import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Rule({ orientation = "horizontal", tone = "neutral", className, ...props }:
  HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical"; tone?: "neutral" | "accent" }) {
  return <div {...props} role="separator" aria-orientation={orientation} className={cn(
    orientation === "horizontal" ? "w-full border-t" : "min-h-8 self-stretch border-s",
    tone === "accent" ? "border-accent" : "border-border", className,
  )} />;
}
