import { SignIn, SignUp } from '@clerk/react';
import { useGetProgramBranding, getGetProgramBrandingQueryKey } from '@workspace/api-client-react';
import { Shield } from 'lucide-react';
import { Link } from 'wouter';
import { getDisplayBrandName, LanguageToggle, t, useAppLanguage } from './language';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function ClerkAuthPage({
  mode,
  participantRedirect = false,
}: {
  mode: 'sign-in' | 'sign-up';
  participantRedirect?: boolean;
}) {
  useAppLanguage();
  const brandingQuery = useGetProgramBranding({
    query: { queryKey: getGetProgramBrandingQueryKey() },
  });
  const branding = brandingQuery.data;
  const isSignIn = mode === 'sign-in';

  return (
    <main className="auth-page auth-form-page">
      <Link href="/" className="auth-brand">
        {branding?.logoUrl ? (
          <img className="brand-logo" src={branding.logoUrl} alt="" />
        ) : (
          <span className="brand-mark">{getDisplayBrandName(branding?.brandName).slice(0, 1)}</span>
        )}
        <span>
          <b>{getDisplayBrandName(branding?.brandName)}</b>
          <small>{t('PROGRAM HUB')}</small>
        </span>
      </Link>
      <LanguageToggle className="auth-language-toggle" />
      <div className="auth-form-content">
        <div className="eyebrow">
          {t(isSignIn ? 'PROGRAM HUB' : 'CREATE YOUR ACCOUNT')}
        </div>
        <h1 className="app-title">
          {t(isSignIn ? 'Welcome back.' : 'Your journey, in view.')}
        </h1>
        <p>
          {t(
            isSignIn
              ? 'Sign in to continue to your program workspace or founder progress.'
              : 'Use the same verified email you entered on your application. Staff accounts still require admin approval.',
          )}
        </p>
        <div className="clerk-card">
          {isSignIn ? (
            <SignIn
              routing="path"
              path={`${basePath}/sign-in`}
              signUpUrl={`${basePath}/sign-up`}
              forceRedirectUrl={participantRedirect ? `${basePath}/participant` : undefined}
            />
          ) : (
            <SignUp
              routing="path"
              path={`${basePath}/sign-up`}
              signInUrl={`${basePath}/sign-in`}
              forceRedirectUrl={`${basePath}/participant`}
            />
          )}
        </div>
        <Link href="/" className="auth-back">
          ← {t('Back to Program Hub')}
        </Link>
      </div>
      <div className="auth-form-note">
        <Shield size={15} /> Founder progress is private to the signed-in applicant.
        Staff workspace access remains admin-approved.
      </div>
    </main>
  );
}
