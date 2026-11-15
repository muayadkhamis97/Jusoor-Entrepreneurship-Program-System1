import { t } from './language';
import { registerLeaveCheck } from './unsaved-navigation';

const dirtyWorkbookIds = new Set<string>();
let unregisterLeaveCheck: (() => void) | undefined;
let beforeUnloadHandler: ((event: BeforeUnloadEvent) => void) | undefined;

function confirmWorkbookExit() {
  return dirtyWorkbookIds.size === 0 || window.confirm(t('You have unsaved workbook text. Leave without saving?'));
}

function syncWorkbookExitGuards() {
  if (typeof window === 'undefined') return;
  if (dirtyWorkbookIds.size > 0) {
    if (!unregisterLeaveCheck) unregisterLeaveCheck = registerLeaveCheck(confirmWorkbookExit);
    if (!beforeUnloadHandler) {
      beforeUnloadHandler = event => {
        if (dirtyWorkbookIds.size === 0) return;
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', beforeUnloadHandler);
    }
    return;
  }

  unregisterLeaveCheck?.();
  unregisterLeaveCheck = undefined;
  if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
  beforeUnloadHandler = undefined;
}

export function setParticipantWorkbookDirty(workbookId: string, isDirty: boolean) {
  if (isDirty) dirtyWorkbookIds.add(workbookId);
  else dirtyWorkbookIds.delete(workbookId);
  syncWorkbookExitGuards();
}
