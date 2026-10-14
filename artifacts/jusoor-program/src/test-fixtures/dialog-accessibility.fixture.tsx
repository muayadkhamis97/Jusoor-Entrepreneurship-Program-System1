import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BookOpen, CalendarDays, LayoutDashboard, Users } from 'lucide-react';
import { Router as WouterRouter } from 'wouter';
import { AccessibleDialogSurface } from '../accessible-dialog';
import { LanguageProvider, LanguageToggle, t, useAppLanguage } from '../language';
import { MobileStaffNavigation, type StaffNavigationItem } from '../mobile-staff-navigation';
import '../workspace.css';

const fixtureLocationHook = (): [string, (path: string) => void] => ['/sessions', () => undefined];
const navigationItems: StaffNavigationItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/businesses', label: 'Businesses', icon: Users },
  { href: '/programs', label: 'Programs', icon: Activity },
  { href: '/sessions', label: 'Sessions', icon: CalendarDays },
  { href: '/courses', label: 'Learning', icon: BookOpen },
  { href: '/communications', label: 'Communications', icon: Activity },
];

function DialogAccessibilityFixture() {
  const { language } = useAppLanguage();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [value, setValue] = useState('');
  const [showError, setShowError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <main>
      <LanguageToggle />
      <span data-testid="language-state">{language}</span>
      <p data-testid="localized-copy">{t('Choose your cohort')}</p>
      <button type="button" id="open-application-review" onClick={() => setReviewOpen(true)}>
        Open application review
      </button>
      <button type="button" id="open-sample-form" onClick={() => { setShowError(false); setFormOpen(true); }}>
        Open sample form
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

      <MobileStaffNavigation items={navigationItems} currentPath="/sessions" onSignOut={() => undefined} />
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
