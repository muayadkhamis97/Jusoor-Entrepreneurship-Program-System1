export function installIconTooltipFallback(root: HTMLElement = document.body) {
  const actionableLabelSelector = 'button[aria-label], a[aria-label], [role="button"][aria-label]';

  function addTooltipFromAccessibleLabel(element: Element) {
    const label = element.getAttribute('aria-label')?.trim();
    if (!label || element.getAttribute('title')?.trim()) return;
    element.setAttribute('title', label);
  }

  for (const element of root.querySelectorAll(actionableLabelSelector)) {
    addTooltipFromAccessibleLabel(element);
  }

  const observer = new MutationObserver(function processMutations(records) {
    for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
        addTooltipFromAccessibleLabel(record.target);
        continue;
      }

      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
          if (node.matches(actionableLabelSelector)) addTooltipFromAccessibleLabel(node);
        for (const element of node.querySelectorAll(actionableLabelSelector)) {
          addTooltipFromAccessibleLabel(element);
        }

        let parent = node.parentElement;
        while (parent && parent !== root) {
            if (parent.matches(actionableLabelSelector)) addTooltipFromAccessibleLabel(parent);
          parent = parent.parentElement;
        }
      }
    }
  });

  observer.observe(root, {
    attributes: true,
    attributeFilter: ['aria-label'],
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
