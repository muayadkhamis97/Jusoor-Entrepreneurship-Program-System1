import { createRoot } from 'react-dom/client';

import Startup from './startup';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import './system-redesign.css';
import { installUnsavedNavigationGuard } from './unsaved-navigation';
import { installIconTooltipFallback } from './icon-tooltip-fallback';

installUnsavedNavigationGuard();
const removeIconTooltips = installIconTooltipFallback();
if (import.meta.hot) import.meta.hot.dispose(removeIconTooltips);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <Startup />
  </ErrorBoundary>,
);
