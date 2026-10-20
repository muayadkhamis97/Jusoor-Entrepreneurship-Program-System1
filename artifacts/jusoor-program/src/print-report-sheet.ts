export function printReportSheet(bodyClass: string): void {
  document.body.classList.add(bodyClass);
  const cleanup = () => {
    document.body.classList.remove(bodyClass);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}
