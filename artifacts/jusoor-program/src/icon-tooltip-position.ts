type TooltipAnchor = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width'>;

/** Keep the description inside the viewport, including controls near an edge. */
export function getIconTooltipPosition(
  anchor: TooltipAnchor,
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
) {
  const left = Math.max(gap, Math.min(
    anchor.left + (anchor.width - tooltip.width) / 2,
    viewport.width - tooltip.width - gap,
  ));
  const above = anchor.top - tooltip.height - gap;
  const below = anchor.bottom + gap;
  const top = above >= gap ? above : Math.min(below, viewport.height - tooltip.height - gap);
  return { left, top: Math.max(gap, top) };
}
