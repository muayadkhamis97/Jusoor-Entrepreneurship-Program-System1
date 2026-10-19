import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, useLocation } from 'wouter';
import { installUnsavedNavigationGuard } from '../unsaved-navigation';
import { useMentorBookingDraft } from '../use-mentor-booking-draft';
import type { MentorBookingProvider } from '@workspace/api-client-react';
import '../index.css';
import '../workspace.css';
import '../role-workspace.css';
import '../program-controls.css';

installUnsavedNavigationGuard();
const editorPath = window.location.pathname;
type Settings = { bookingProvider: MentorBookingProvider; googleCalendarBookingUrl: string };
const initial: Settings = { bookingProvider: 'google_calendar', googleCalendarBookingUrl: 'https://calendar.app.google/InitialSchedule' };

function Editor() {
  const [server, setServer] = useState(initial);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const draft = useMentorBookingDraft(server, pending);
  const save = () => { setPending(true); setFeedback('Saving'); };
  const saved = () => {
    const result: Settings = { bookingProvider: draft.bookingProvider, googleCalendarBookingUrl: draft.googleCalendarBookingUrl.trim() };
    setServer(result);
    draft.markSaved(result);
    setPending(false);
    setFeedback('Saved');
  };
  return <div className="role-workspace"><main className="role-main">
    <h1>Mentor booking draft fixture</h1>
    <nav><Link href={`${editorPath}/away`}>Workspace</Link> · <Link href={`${editorPath}/profile`}>Profile</Link></nav>
    <form className="role-form-grid" onSubmit={event => { event.preventDefault(); save(); }}>
      <label className="field">Booking provider<select value={draft.bookingProvider} disabled={pending} onChange={event => draft.setBookingProvider(event.target.value as MentorBookingProvider)}><option value="google_calendar">Google Calendar</option><option value="calendly">Calendly</option></select></label>
      <label className="field">Schedule URL<input type="url" value={draft.googleCalendarBookingUrl} disabled={pending} onChange={event => draft.setGoogleCalendarBookingUrl(event.target.value)} /></label>
      <button className="button" disabled={pending}>Save</button>
      <button className="button" type="button" disabled={pending} onClick={() => draft.confirmLeave()}>Discard changes</button>
    </form>
    <p role="status">{draft.isDirty ? 'Unsaved changes' : 'No unsaved changes'}</p>
    <p data-testid="save-feedback">{feedback}</p>
    <button onClick={() => setServer({ bookingProvider: 'calendly', googleCalendarBookingUrl: 'https://calendar.app.google/RemoteSchedule' })}>Simulate server refresh</button>
    <button onClick={saved} disabled={!pending}>Complete save</button>
    <button onClick={() => { setPending(false); setFeedback('Save failed'); }} disabled={!pending}>Fail save</button>
    <button onClick={() => { if (draft.confirmLeave()) setFeedback('Reconnect allowed'); }}>Reconnect account</button>
    <button onClick={() => { if (draft.confirmLeave()) setFeedback('Sign out allowed'); }}>Sign out</button>
  </main></div>;
}
function Fixture() {
  const [location] = useLocation();
  return location === editorPath ? <Editor /> : <main><h1>Other page</h1><Link href={editorPath}>Return to Settings</Link></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
