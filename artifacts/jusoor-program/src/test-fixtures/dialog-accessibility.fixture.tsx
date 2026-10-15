import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Router as WouterRouter, useLocation } from 'wouter';
import { AccessibleDialogSurface, UnsavedChangesDialog } from '../accessible-dialog';
import { LanguageProvider, LanguageToggle, t, useAppLanguage } from '../language';
import { getStaffNavigationItems, MobileStaffNavigation } from '../mobile-staff-navigation';
import '../index.css';
import '../workspace.css';

const fixtureLocationHook = (): [string, (path: string) => void] => {
  const [path, setPath] = useState('/sessions');
  return [path, setPath];
};

function DialogAccessibilityFixture() {
  const { language } = useAppLanguage();
  const [currentPath] = useLocation();
  const [staffRole, setStaffRole] = useState<'coordinator' | 'staff'>('coordinator');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [dirtyOpen, setDirtyOpen] = useState(false);
  const [discardDirty, setDiscardDirty] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretCanClose, setSecretCanClose] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [removableDialogOpen, setRemovableDialogOpen] = useState(false);
  const [removableTriggerVisible, setRemovableTriggerVisible] = useState(true);
  const [noOpenerDialogOpen, setNoOpenerDialogOpen] = useState(false);
  const [courseDiscardPrompt, setCourseDiscardPrompt] = useState(false);
  const [value, setValue] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [dirtyValue, setDirtyValue] = useState('');
  const [showError, setShowError] = useState(false);
  const [courseError, setCourseError] = useState(false);
  const [quizError, setQuizError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const requestDirtyClose = () => {
    if (dirtyValue) setDiscardDirty(true);
    else setDirtyOpen(false);
  };
  const requestCourseClose = () => {
    if (courseTitle) setCourseDiscardPrompt(true);
    else setCourseOpen(false);
  };

  return (
    <main data-testid="dialog-focus-fallback">
      <LanguageToggle />
      <span data-testid="language-state">{language}</span>
      <p data-testid="localized-copy">{t('Choose your cohort')}</p>
      <div aria-label="Staff role">
        <button type="button" data-testid="role-coordinator" onClick={() => setStaffRole('coordinator')}>Admin menu</button>
        <button type="button" data-testid="role-staff" onClick={() => setStaffRole('staff')}>Program staff menu</button>
      </div>
      <button type="button" id="open-application-review" onClick={() => setReviewOpen(true)}>
        Open application review
      </button>
      <button type="button" id="open-sample-form" onClick={() => { setShowError(false); setFormOpen(true); }}>
        Open sample form
      </button>
      <button type="button" id="open-course-content" onClick={() => { setCourseError(false); setCourseOpen(true); }}>
        Open course content
      </button>
      <button type="button" id="open-quiz-editor" onClick={() => { setQuizError(false); setQuizOpen(true); }}>
        Open quiz editor
      </button>
      <button type="button" id="open-confirmation" onClick={() => setConfirmOpen(true)}>
        Open confirmation
      </button>
      {confirmed && <p role="status">Synthetic record removed</p>}
      <button type="button" id="open-dirty-editor" onClick={() => { setDirtyValue(''); setDirtyOpen(true); }}>Open dirty editor</button>
      <button type="button" id="open-synthetic-secret" onClick={() => { setSecretCanClose(false); setSecretOpen(true); }}>Open one-time key</button>
      <button type="button" id="open-synthetic-revoke" onClick={() => { setRevokePending(false); setRevokeOpen(true); }}>Open key revocation</button>
      {removableTriggerVisible && <button type="button" id="open-removable-trigger" onClick={() => setRemovableDialogOpen(true)}>Open removable-trigger dialog</button>}
      <button type="button" id="open-no-opener" onClick={event => { event.currentTarget.blur(); setNoOpenerDialogOpen(true); }}>Open dialog without a focused opener</button>

      {reviewOpen && (
        <AccessibleDialogSurface
          className="modal-card"
          labelledBy="fixture-review-title"
          describedBy="fixture-review-description"
          initialFocusSelector="#fixture-review-title"
          onClose={() => setReviewOpen(false)}
          testId="fixture-application-review"
        >
          <h2 id="fixture-review-title" tabIndex={-1}>Application review</h2>
          <p id="fixture-review-description">Synthetic applicant and venture details.</p>
          <button type="button" aria-label="Close review" onClick={() => setReviewOpen(false)}>×</button>
        </AccessibleDialogSurface>
      )}

      {formOpen && (
        <AccessibleDialogSurface
          className="modal-card"
          labelledBy="fixture-form-title"
          describedBy="fixture-form-description"
          initialFocusSelector="#fixture-form-input"
          onClose={() => setFormOpen(false)}
          testId="fixture-form-dialog"
        >
          <div className="modal-head">
            <div>
              <h1 id="fixture-form-title" className="app-title">Edit sample record</h1>
              <p id="fixture-form-description">Update this sample record.</p>
            </div>
            <button type="button" aria-label="Close sample form" onClick={() => setFormOpen(false)}>×</button>
          </div>
          <form className="modal-form" onSubmit={event => { event.preventDefault(); setShowError(true); }}>
            <label>
              Record name
              <input id="fixture-form-input" data-dialog-autofocus value={value} onChange={event => setValue(event.target.value)} />
            </label>
            {showError && <p id="fixture-form-error" role="alert">The record could not be saved. Try again.</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="submit">Save record</button>
            </div>
          </form>
        </AccessibleDialogSurface>
      )}

      {courseOpen && (
        <AccessibleDialogSurface
          className="modal-card"
          labelledBy="fixture-course-title"
          initialFocusSelector="#fixture-course-input"
          onClose={requestCourseClose}
          closeOnEscape={!courseTitle}
          closeOnOutsideInteraction={!courseTitle}
          onDismissAttempt={() => { if (courseTitle) setCourseDiscardPrompt(true); }}
          testId="fixture-course-dialog"
        >
          <div className="modal-head">
            <h1 id="fixture-course-title" className="app-title">Edit course content</h1>
            <button type="button" aria-label="Close course form" onClick={requestCourseClose}>×</button>
          </div>
          <form className="modal-form" onSubmit={event => { event.preventDefault(); setCourseError(true); }}>
            <label>Course title<input id="fixture-course-input" value={courseTitle} onChange={event => setCourseTitle(event.target.value)} /></label>
            {courseError && <p role="alert">Course content could not be saved.</p>}
            <div className="modal-actions"><button type="button" onClick={requestCourseClose}>Cancel</button><button type="submit">Save course</button></div>
          </form>
        </AccessibleDialogSurface>
      )}
      {courseDiscardPrompt && <UnsavedChangesDialog onKeepEditing={() => setCourseDiscardPrompt(false)} onDiscard={() => { setCourseDiscardPrompt(false); setCourseOpen(false); }} />}

      {quizOpen && (
        <AccessibleDialogSurface
          className="modal-card"
          labelledBy="fixture-quiz-title"
          initialFocusSelector="#fixture-quiz-input"
          onClose={() => setQuizOpen(false)}
          testId="fixture-quiz-dialog"
        >
          <div className="modal-head">
            <h1 id="fixture-quiz-title" className="app-title">Create a quiz</h1>
            <button type="button" aria-label="Close quiz editor" onClick={() => setQuizOpen(false)}>×</button>
          </div>
          <form className="modal-form" onSubmit={event => { event.preventDefault(); setQuizError(true); }}>
            <label>Quiz title<input id="fixture-quiz-input" value={quizTitle} onChange={event => setQuizTitle(event.target.value)} /></label>
            {quizError && <p role="alert">Add a quiz title.</p>}
            <div className="modal-actions"><button type="button" onClick={() => setQuizOpen(false)}>Cancel</button><button type="submit">Save quiz</button></div>
          </form>
        </AccessibleDialogSurface>
      )}

      {confirmOpen && (
        <AccessibleDialogSurface
          className="confirm-card"
          role="alertdialog"
          labelledBy="fixture-confirm-title"
          describedBy="fixture-confirm-description"
          initialFocusSelector="#fixture-confirm-cancel"
          onClose={() => setConfirmOpen(false)}
          closeOnOutsideInteraction={false}
          testId="fixture-confirm-dialog"
        >
          <h2 id="fixture-confirm-title">Confirm removal</h2>
          <p id="fixture-confirm-description">This is a synthetic confirmation only.</p>
          <div className="modal-actions">
            <button id="fixture-confirm-cancel" data-dialog-autofocus onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button onClick={() => { setConfirmOpen(false); setConfirmed(true); }}>Remove</button>
          </div>
        </AccessibleDialogSurface>
      )}

      {dirtyOpen && <AccessibleDialogSurface
        className="modal-card"
        labelledBy="fixture-dirty-title"
        initialFocusSelector="#fixture-dirty-input"
        onClose={requestDirtyClose}
        closeOnEscape={!dirtyValue}
        closeOnOutsideInteraction={!dirtyValue}
        onDismissAttempt={() => { if (dirtyValue) setDiscardDirty(true); }}
        testId="fixture-dirty-dialog"
      >
        <h2 id="fixture-dirty-title">Edit a synthetic draft</h2>
        <label>Draft value<input id="fixture-dirty-input" value={dirtyValue} onChange={event => setDirtyValue(event.target.value)} /></label>
        <button type="button" onClick={requestDirtyClose}>Cancel</button>
      </AccessibleDialogSurface>}
      {discardDirty && <UnsavedChangesDialog onKeepEditing={() => setDiscardDirty(false)} onDiscard={() => { setDiscardDirty(false); setDirtyOpen(false); }} />}

      {secretOpen && <AccessibleDialogSurface
        className="modal-card"
        labelledBy="fixture-secret-title"
        describedBy="fixture-secret-description"
        initialFocusSelector="#button-copy-synthetic-secret"
        onClose={() => setSecretOpen(false)}
        closeOnEscape={secretCanClose}
        closeOnOutsideInteraction={secretCanClose}
        testId="fixture-secret-dialog"
      >
        <h2 id="fixture-secret-title">One-time program key</h2>
        <p id="fixture-secret-description">Synthetic secret used only to test acknowledgement behavior.</p>
        <code>SYNTHETIC-NOT-A-REAL-KEY</code>
        <button id="button-copy-synthetic-secret" onClick={() => setSecretCanClose(true)}>Copy synthetic key</button>
        <button disabled={!secretCanClose} onClick={() => setSecretOpen(false)}>I saved the key</button>
      </AccessibleDialogSurface>}

      {revokeOpen && <AccessibleDialogSurface
        className="confirm-card"
        role="alertdialog"
        labelledBy="fixture-revoke-title"
        describedBy="fixture-revoke-description"
        initialFocusSelector="#button-cancel-synthetic-revoke"
        onClose={() => { if (!revokePending) setRevokeOpen(false); }}
        closeOnOutsideInteraction={false}
        closeOnEscape={!revokePending}
        testId="fixture-revoke-dialog"
      >
        <h2 id="fixture-revoke-title">Revoke synthetic key?</h2>
        <p id="fixture-revoke-description">This is a local confirmation fixture.</p>
        <button id="button-cancel-synthetic-revoke" disabled={revokePending} onClick={() => setRevokeOpen(false)}>Keep key</button>
        <button disabled={revokePending} onClick={() => setRevokePending(true)}>Start synthetic revoke</button>
        {revokePending && <button onClick={() => { setRevokePending(false); setRevokeOpen(false); }}>Finish synthetic revoke</button>}
      </AccessibleDialogSurface>}

      {removableDialogOpen && <AccessibleDialogSurface
        className="modal-card"
        labelledBy="fixture-removable-title"
        initialFocusSelector="#button-remove-trigger"
        onClose={() => setRemovableDialogOpen(false)}
        testId="fixture-removable-dialog"
      >
        <h2 id="fixture-removable-title">Trigger removal test</h2>
        <button id="button-remove-trigger" onClick={() => setRemovableTriggerVisible(false)}>Remove opener from page</button>
        <button onClick={() => setRemovableDialogOpen(false)}>Close test dialog</button>
      </AccessibleDialogSurface>}
      {noOpenerDialogOpen && <AccessibleDialogSurface
        className="modal-card"
        labelledBy="fixture-no-opener-title"
        initialFocusSelector="#button-close-no-opener"
        onClose={() => setNoOpenerDialogOpen(false)}
        testId="fixture-no-opener-dialog"
      >
        <h2 id="fixture-no-opener-title">No opener test</h2>
        <button id="button-close-no-opener" onClick={() => setNoOpenerDialogOpen(false)}>Close no-opener dialog</button>
      </AccessibleDialogSurface>}

      <MobileStaffNavigation items={getStaffNavigationItems(staffRole)} currentPath={currentPath} onSignOut={() => undefined} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <WouterRouter hook={fixtureLocationHook}>
      <DialogAccessibilityFixture />
    </WouterRouter>
  </LanguageProvider>,
);
