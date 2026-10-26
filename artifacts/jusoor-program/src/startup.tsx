import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router as WouterRouter, useLocation } from 'wouter';
import { LanguageProvider, t } from './language';
import { getGetProgramBrandingQueryKey, useGetProgramBranding } from '@workspace/api-client-react';
import { PublicLanding } from './public-landing';

const PublicSessionEntry = lazy(() => import('./public-session-entry').then(module => ({ default: module.PublicSessionEntry })));
const ApplyPage = lazy(() => import('./intake-surfaces').then(module => ({ default: module.ApplyPage })));
const CertificateVerificationPage = lazy(() => import('./learning-progress').then(module => ({ default: module.CertificateVerificationPage })));
const PublicJudgingFormPage = lazy(() => import('./public-judging-form').then(module => ({ default: module.PublicJudgingFormPage })));
const FullApp = lazy(() => import('./App'));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function LoadingScreen() {
  return <main className="auth-status-page" role="status"><div className="brand-mark">J</div><p>{t('Loading…')}</p></main>;
}

function PublicLandingRoute() {
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  return <PublicLanding brandName={brandingQuery.data?.brandName} logoUrl={brandingQuery.data?.logoUrl} />;
}

function StartupRoutes() {
  const [location] = useLocation();
  const [hideLanding, setHideLanding] = useState(false);
  useEffect(() => {
    if (location !== '/') setHideLanding(false);
  }, [location]);

  if (location === '/') {
    return <>
      {!hideLanding && <PublicLandingRoute />}
      <Suspense fallback={null}><PublicSessionEntry mode="landing" onAuthenticated={() => setHideLanding(true)} /></Suspense>
    </>;
  }
  if (location.startsWith('/sign-in') || location.startsWith('/sign-up')) {
    return <Suspense fallback={<LoadingScreen />}><PublicSessionEntry mode="auth" /></Suspense>;
  }
  if (location.startsWith('/participant')) {
    return <Suspense fallback={<LoadingScreen />}><PublicSessionEntry mode="participant" /></Suspense>;
  }
  if (location === '/apply') return <Suspense fallback={<LoadingScreen />}><ApplyPage /></Suspense>;
  if (location === '/judging') return <Suspense fallback={<LoadingScreen />}><PublicJudgingFormPage /></Suspense>;
  if (location === '/verify-certificate') return <Suspense fallback={<LoadingScreen />}><CertificateVerificationPage /></Suspense>;
  return <Suspense fallback={<LoadingScreen />}><FullApp /></Suspense>;
}

export default function Startup() {
  return <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={basePath}>
        <StartupRoutes />
      </WouterRouter>
    </QueryClientProvider>
  </LanguageProvider>;
}
