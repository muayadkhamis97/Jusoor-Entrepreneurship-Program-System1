import { lazy, Suspense, useEffect } from 'react';
import { ClerkProvider, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { arSA } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import { useLocation } from 'wouter';
import { getDisplayBrandName, t, useAppLanguage } from './language';
import { usePublicBranding } from './public-branding';
import './workspace.css';

const FullApp = lazy(() => import('./App'));
const AuthPage = lazy(() => import('./clerk-auth-page').then(module => ({ default: module.ClerkAuthPage })));

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');

function SessionContent({ mode, onAuthenticated }: { mode: 'landing' | 'participant' | 'auth'; onAuthenticated?: () => void }) {
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (mode !== 'auth' && isLoaded && isSignedIn) onAuthenticated?.();
  }, [isLoaded, isSignedIn, mode, onAuthenticated]);

  if (mode === 'auth') {
    const signUp = location.startsWith('/sign-up');
    return <Suspense fallback={null}><AuthPage mode={signUp ? 'sign-up' : 'sign-in'} /></Suspense>;
  }
  if (!isLoaded) return mode === 'participant'
    ? <main className="auth-status-page" role="status"><p>{t('Checking your staff access…')}</p></main>
    : null;
  if (isSignedIn) return <Suspense fallback={<main className="auth-status-page" role="status"><p>{t('Checking your staff access…')}</p></main>}><FullApp sessionProvided /></Suspense>;
  if (mode === 'participant') return <Suspense fallback={null}><AuthPage mode="sign-in" participantRedirect /></Suspense>;
  return null;
}

export function PublicSessionEntry({ mode, onAuthenticated }: { mode: 'landing' | 'participant' | 'auth'; onAuthenticated?: () => void }) {
  const { language } = useAppLanguage();
  const [, setLocation] = useLocation();
  const brandingQuery = usePublicBranding();
  const branding = brandingQuery.data;
  const brandName = getDisplayBrandName(branding?.brandName);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const appearance = {
    theme: shadcn,
    cssLayerName: 'clerk',
    options: {
      logoPlacement: 'inside' as const,
      logoLinkUrl: basePath || '/',
      logoImageUrl: branding?.logoUrl || `${window.location.origin}${basePath}/logo.svg`,
      socialButtonsPlacement: 'bottom' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    variables: {
      colorPrimary: branding?.primaryColor || '#28665a',
      colorForeground: '#203744',
      colorMutedForeground: '#687c82',
      colorDanger: '#b85042',
      colorBackground: '#fcfaf5',
      colorInput: '#ffffff',
      colorInputForeground: '#203744',
      colorNeutral: '#d8d0c1',
      fontFamily: 'DM Sans, sans-serif',
      borderRadius: '0.7rem',
    },
    elements: {
      rootBox: 'w-full flex justify-center',
      cardBox: 'bg-background rounded-2xl w-[440px] max-w-full overflow-hidden border border-border',
      card: '!shadow-none !border-0 !bg-transparent !rounded-none',
      footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
      headerTitle: 'text-foreground font-semibold',
      headerSubtitle: 'text-muted-foreground',
      socialButtonsBlockButtonText: 'text-foreground font-medium',
      formFieldLabel: 'text-foreground font-medium',
      footerActionLink: 'text-primary font-semibold',
      footerActionText: 'text-muted-foreground',
      dividerText: 'text-muted-foreground',
      formFieldInput: 'bg-white text-foreground border-border',
      formButtonPrimary: 'bg-primary text-primary-foreground font-semibold',
      main: 'text-foreground',
    },
  };

  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={language === 'ar' ? arSA : {
      signIn: { start: { title: 'Welcome back', subtitle: `Sign in to access your ${brandName} workspace` } },
      signUp: { start: { title: `Create your ${brandName} account`, subtitle: 'Founders: use the email on your application' } },
    }}
    routerPush={to => setLocation(basePath && to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to)}
    routerReplace={to => setLocation(basePath && to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to, { replace: true })}
  >
    <SessionContent mode={mode} onAuthenticated={onAuthenticated} />
  </ClerkProvider>;
}
