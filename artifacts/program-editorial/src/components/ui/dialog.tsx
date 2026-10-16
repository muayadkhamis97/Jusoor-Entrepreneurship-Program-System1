import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { Typography } from "./typography";
import { PaperSurface } from "./paper-surface";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow?: string;
  description?: string;
  children?: ReactNode;
}

/** Controlled source dialog, adapted to native dialog for modal focus/Escape behavior. */
export function Dialog({ open, onOpenChange, title, eyebrow, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    className="fixed m-auto max-h-[calc(100dvh-44px)] w-[420px] max-w-[calc(100vw-44px)] overflow-y-auto border-0 bg-transparent p-0 text-foreground backdrop:bg-foreground/45"
    style={{ boxShadow: "0 20px 70px color-mix(in srgb,hsl(var(--foreground)) 20%,transparent)" }}
    onCancel={event => { event.preventDefault(); onOpenChange(false); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node => node.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onClose={() => { if (open) onOpenChange(false); }}
    onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onOpenChange(false);
    }}>
    <PaperSurface variant="panel" className="p-[31px]">
      <Button variant="text" aria-label="Close dialog" className="absolute end-3 top-1 min-h-10 min-w-10 justify-center text-2xl text-foreground" onClick={() => onOpenChange(false)}>×</Button>
      {eyebrow && <Typography variant="label" tone="accent" className="mb-3 pe-7">{eyebrow}</Typography>}
      <Typography as="h2" variant="heading" id={titleId} className="pe-6">{title}</Typography>
      {description && <Typography id={descriptionId} className="mt-3 text-[13px] leading-relaxed">{description}</Typography>}
      {children && <div className="mt-6">{children}</div>}
    </PaperSurface>
  </dialog>;
}
