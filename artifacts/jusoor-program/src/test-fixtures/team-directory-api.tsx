// Resolved ONLY by the browser test's Vite plugin. Production never imports this.
export * from '@workspace/api-client-react';
import { fixtureDate, participants, programName, staff } from './team-directory-data';

const query = <T,>(data: T) => ({
  data, isLoading: false, isError: false,
  refetch: async () => { throw new Error('Directory fixture must not refetch.'); },
});

export const useListStaff = () => query(staff);
export const useListParticipantInvitations = () => query(participants);
export const useListPrograms = () => query([
  { id: 41, name: programName, status: 'active', createdAt: fixtureDate },
  { id: 42, name: 'برنامج جسور لدعم رواد الأعمال والمشروعات المجتمعية', status: 'active', createdAt: fixtureDate },
]);
export const useListBusinesses = () => query([]);
export const useGetProgramBranding = () => query({ brandName: 'Program Hub' });

// Every mutation is inert: no fetch, cache write, provider, or persisted change.
// Resend reports a local uncertain result so the real feedback UI is exercised.
type Callbacks = { onError?: (error: Error) => void; onSettled?: () => void };
const inert = () => ({
  isPending: false,
  mutate: (_input: unknown, callbacks?: Callbacks) => {
    callbacks?.onError?.(new Error('Synthetic uncertain delivery; no email attempted.'));
    callbacks?.onSettled?.();
  },
});
export const useCreateStaff = inert;
export const useCreateParticipantInvitation = inert;
export const useRetryStaffInvitationEmail = inert;
export const useResendStaffInvitationEmail = inert;
export const useResendParticipantInvitation = inert;
export const useUpdateStaff = inert;
export const useDeleteStaff = inert;
