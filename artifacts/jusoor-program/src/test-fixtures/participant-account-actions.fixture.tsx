import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../language';
import { ParticipantAccountActions } from '../participant-account-actions';
import '../index.css';

function ParticipantAccountActionsFixture() {
  const [signedIn, setSignedIn] = useState(true);
  const [failNext, setFailNext] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState('');

  const signOut = async ({ redirectUrl }: { redirectUrl: string }) => {
    if (failNext) {
      setFailNext(false);
      throw new Error('Synthetic sign-out failure');
    }
    setRedirectTarget(redirectUrl);
    setSignedIn(false);
  };

  return (
    <main className="participant-wrap">
      <h1>Participant account actions</h1>
      {signedIn ? (
        <ParticipantAccountActions signOut={signOut} />
      ) : (
        <section aria-label="Signed-out fixture">
          <p role="status">Signed out</p>
          <button type="button" onClick={() => setSignedIn(true)}>Restore synthetic session</button>
        </section>
      )}
      <button type="button" onClick={() => setFailNext(true)}>Fail the next sign-out</button>
      {redirectTarget && <output data-testid="participant-redirect-target">{redirectTarget}</output>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <ParticipantAccountActionsFixture />
  </LanguageProvider>,
);
