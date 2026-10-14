import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Router as WouterRouter, useLocation } from 'wouter';
import { AccessibleDialogSurface } from '../accessible-dialog';
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
  const [value, setValue] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [showError, setShowError] = useState(false);
  const [courseError, setCourseError] = useState(false);
  const [quizError, setQuizError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <main>
      <LanguageToggle />
      <span data-testid="language-state">{language}</span>
      <p data-testid="localized-copy">{t('Choose your cohort')}</p>
      <div aria-label="Staff role">
        <button type="button" data-testid="role-coordinator" onClick={() => setStaffRole('coordinator')}>Coordinator menu</button>
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
      {confirmed && <p role="status">Confirmation dismissed</p>}

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
          onClose={() => setCourseOpen(false)}
          testId="fixture-course-dialog"
        >
          <div className="modal-head">
            <h1 id="fixture-course-title" className="app-title">Edit course content</h1>
            <button type="button" aria-label="Close course form" onClick={() => setCourseOpen(false)}>×</button>
          </div>
          <form className="modal-form" onSubmit={event => { event.preventDefault(); setCourseError(true); }}>
            <label>Course title<input id="fixture-course-input" value={courseTitle} onChange={event => setCourseTitle(event.target.value)} /></label>
            {courseError && <p role="alert">Course content could not be saved.</p>}
            <div className="modal-actions"><button type="button" onClick={() => setCourseOpen(false)}>Cancel</button><button type="submit">Save course</button></div>
          </form>
        </AccessibleDialogSurface>
      )}

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
          onClose={() => { setConfirmOpen(false); setConfirmed(true); }}
          closeOnOutsideInteraction={false}
          testId="fixture-confirm-dialog"
        >
          <h2 id="fixture-confirm-title">Confirm removal</h2>
          <p id="fixture-confirm-description">This is a synthetic confirmation only.</p>
          <div className="modal-actions">
            <button id="fixture-confirm-cancel" data-dialog-autofocus onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button onClick={() => setConfirmOpen(false)}>Remove</button>
          </div>
        </AccessibleDialogSurface>
      )}

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
