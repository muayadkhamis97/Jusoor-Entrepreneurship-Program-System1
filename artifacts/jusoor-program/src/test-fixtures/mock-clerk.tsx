import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';

type MockRole = 'coordinator' | 'participant' | null;
type AuthState = { isLoaded: boolean; isSignedIn: boolean; user: { id: string; firstName: string; fullName: string; primaryEmailAddress: { emailAddress: string } } | null };

const AuthContext = createContext<AuthState>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
});

function getMockRole(): MockRole {
  const session = new URLSearchParams(window.location.search).get('testSession') || '';
  const role = session.replace(/^pending-/, '');
  return role === 'coordinator' || role === 'participant' ? role : null;
}

const initialSession = new URLSearchParams(window.location.search).get('testSession') || '';
const initialRole = getMockRole();
const initiallyPending = initialSession.startsWith('pending-');

export function ClerkProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(!initiallyPending);

  useEffect(() => {
    if (!initiallyPending) return;
    const timeout = window.setTimeout(() => setIsLoaded(true), 350);
    return () => window.clearTimeout(timeout);
  }, []);

  const value: AuthState = {
    isLoaded,
    isSignedIn: isLoaded && initialRole !== null,
    user: isLoaded && initialRole
      ? { id: `test-${initialRole}`, firstName: 'Founder', fullName: 'Founder Tester', primaryEmailAddress: { emailAddress: `${initialRole}@example.test` } }
      : null,
  };

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useUser() {
  const auth = useContext(AuthContext);
  return { isLoaded: auth.isLoaded, user: auth.user };
}

export function useClerk() {
  return {
    signOut: async ({ redirectUrl }: { redirectUrl: string }) => {
      window.location.assign(redirectUrl);
    },
    addListener: (_listener: (event: { user: AuthState['user'] }) => void) => () => {},
  };
}

export function SignIn({ path, signUpUrl, forceRedirectUrl }: { path?: string; signUpUrl?: string; forceRedirectUrl?: string }) {
  return createElement('div', {
    'data-testid': 'mock-clerk-sign-in',
    'data-path': path,
    'data-sign-up-url': signUpUrl,
    'data-force-redirect-url': forceRedirectUrl,
  });
}

export function SignUp({ path, signInUrl, forceRedirectUrl }: { path?: string; signInUrl?: string; forceRedirectUrl?: string }) {
  return createElement('div', {
    'data-testid': 'mock-clerk-sign-up',
    'data-path': path,
    'data-sign-in-url': signInUrl,
    'data-force-redirect-url': forceRedirectUrl,
  });
}
