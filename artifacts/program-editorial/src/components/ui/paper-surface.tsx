import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface PaperSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "paper" | "panel";
  grain?: boolean;
}

export function PaperSurface({ variant = "paper", grain = false, className, style, ...props }: PaperSurfaceProps) {
  return <div {...props} className={cn(
    "relative isolate",
    variant === "paper" ? "bg-background text-foreground" : "border border-border bg-card text-card-foreground",
    className,
  )} style={{
    ...(grain ? { backgroundImage: "radial-gradient(color-mix(in srgb, hsl(var(--border)) 50%, transparent) .55px, transparent .55px)", backgroundSize: "7px 7px" } : {}),
    ...style,
  }} />;
}
