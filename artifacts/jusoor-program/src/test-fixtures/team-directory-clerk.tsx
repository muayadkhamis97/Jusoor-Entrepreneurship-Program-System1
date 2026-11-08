// No fake signed-in session: only the standalone Shell's sign-out dependency.
// AuthenticatedWorkspace and all production guards remain untouched.
export * from '@clerk/react';
export const useClerk = () => ({ signOut: async () => {} });
