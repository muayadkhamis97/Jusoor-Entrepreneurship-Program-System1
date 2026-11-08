import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { AccessibleDialogSurface } from '../accessible-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { installIconTooltipFallback } from '../icon-tooltip-fallback';
import '../index.css';
import '../workspace.css';

// No app, auth, API client, or real action handlers are loaded by this fixture.
let cleanup: (() => void) | undefined;
let activations = 0;
document.addEventListener('click', () => { activations += 1; });
document.addEventListener('submit', event => { event.preventDefault(); activations += 1; });

function Fixture() {
  const [dialog, setDialog] = useState(false);
  const [route, setRoute] = useState(0);
  window.iconTooltipFixture = {
    install() { cleanup = installIconTooltipFallback(); },
    cleanup() { cleanup?.(); cleanup = undefined; },
    dialog(open) { flushSync(() => setDialog(open)); },
    replaceRoute() { flushSync(() => setRoute(value => value + 1)); },
    activations: () => activations,
  };
  return (
    <TooltipProvider delayDuration={0}>
      <main className="p-8" data-dialog-focus-fallback>
        <p id="hint">Existing keyboard help</p>
        <p id="hint-two">Second description</p>
        <Button id="first" aria-label="Edit sample" aria-describedby="hint hint-two"><span>✎</span></Button>
        <Button id="second" aria-label="View sample"><span>◉</span></Button>
        <Button id="plain">Visible text only</Button>
        <Button id="native" title="Native description"><span>?</span></Button>
        <Button id="disabled" disabled aria-label="Unavailable"><span>×</span></Button>
        <Button id="aria-disabled" aria-disabled="true" aria-label="Also unavailable"><span>×</span></Button>
        <Button id="owned" aria-label="Owned tooltip" aria-describedby="owned-description"><span>?</span></Button>
        <span id="owned-description" role="tooltip">Explicit description</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button id="radix" aria-label="Radix help"><span>?</span></Button>
          </TooltipTrigger>
          <TooltipContent>Product-owned explicit help</TooltipContent>
        </Tooltip>
        <section id="route" key={route}>
          <Button id="route-control" aria-label={`Route ${route} help`}><span>→</span></Button>
        </section>
      </main>
      {dialog && (
        <AccessibleDialogSurface
          className="modal-card"
          labelledBy="fixture-dialog-title"
          describedBy="fixture-dialog-description"
          closeOnEscape={false}
          onClose={() => setDialog(false)}
        >
          <h2 id="fixture-dialog-title">Synthetic dialog</h2>
          <p id="fixture-dialog-description">No changes are saved.</p>
          <Button id="dialog-control" aria-label="Dialog help"><span>?</span></Button>
          <Button id="dialog-next" aria-label="Next dialog help"><span>→</span></Button>
        </AccessibleDialogSurface>
      )}
    </TooltipProvider>
  );
}

declare global {
  interface Window {
    iconTooltipFixture: {
      install(): void;
      cleanup(): void;
      dialog(open: boolean): void;
      replaceRoute(): void;
      activations(): number;
    };
  }
}

flushSync(() => createRoot(document.getElementById('root')!).render(<Fixture />));
window.iconTooltipFixture.install();
