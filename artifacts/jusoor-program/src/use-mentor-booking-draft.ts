import { useCallback, useEffect, useRef, useState } from 'react';
import type { MentorBookingProvider } from '@workspace/api-client-react';
import { registerLeaveCheck } from './unsaved-navigation';
import { t } from './language';

type BookingDraft = { bookingProvider: MentorBookingProvider; googleCalendarBookingUrl: string };
type SavedSettings = { bookingProvider: MentorBookingProvider; googleCalendarBookingUrl?: string | null };
const draftFrom = (saved: SavedSettings): BookingDraft => ({
  bookingProvider: saved.bookingProvider,
  googleCalendarBookingUrl: saved.googleCalendarBookingUrl || '',
});
const sameDraft = (a: BookingDraft, b: BookingDraft) =>
  a.bookingProvider === b.bookingProvider && a.googleCalendarBookingUrl.trim() === b.googleCalendarBookingUrl.trim();

export function useMentorBookingDraft(settings: SavedSettings | undefined, pending: boolean) {
  const [draft, setDraft] = useState<BookingDraft>({ bookingProvider: 'calendly', googleCalendarBookingUrl: '' });
  const [isDirty, setDirty] = useState(false);
  const draftRef = useRef(draft);
  const baseline = useRef<BookingDraft | null>(null);
  const latestServer = useRef<BookingDraft | null>(null);
  const dirtyRef = useRef(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const apply = useCallback((next: BookingDraft, saved = false) => {
    if (saved) baseline.current = next;
    draftRef.current = next;
    dirtyRef.current = Boolean(baseline.current && !sameDraft(next, baseline.current));
    setDraft(next);
    setDirty(dirtyRef.current);
  }, []);
  useEffect(() => {
    if (!settings) return;
    const next = draftFrom(settings);
    latestServer.current = next;
    if (!dirtyRef.current && !pendingRef.current) apply(next, true);
  }, [settings?.bookingProvider, settings?.googleCalendarBookingUrl, apply]);

  const discardChanges = useCallback(() => {
    if (latestServer.current) apply(latestServer.current, true);
  }, [apply]);
  const confirmLeave = useCallback(() => {
    if (pendingRef.current) {
      window.alert(t('Wait for the booking save to finish before leaving.'));
      return false;
    }
    if (!dirtyRef.current) return true;
    if (!window.confirm(`${t('Discard unsaved changes?')}\n${t('Your changes have not been saved. Leave this editor and discard them?')}`)) return false;
    discardChanges();
    return true;
  }, [discardChanges]);
  useEffect(() => registerLeaveCheck(confirmLeave), [confirmLeave]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !pendingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const markSaved = useCallback((saved: SavedSettings) => {
    const next = draftFrom(saved);
    latestServer.current = next;
    apply(next, true);
  }, [apply]);
  return {
    ...draft, isDirty, confirmLeave, discardChanges, markSaved,
    setBookingProvider: (bookingProvider: MentorBookingProvider) => apply({ ...draftRef.current, bookingProvider }),
    setGoogleCalendarBookingUrl: (googleCalendarBookingUrl: string) => apply({ ...draftRef.current, googleCalendarBookingUrl }),
  };
}
