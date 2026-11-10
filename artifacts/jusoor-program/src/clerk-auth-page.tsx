import { useEffect, useRef } from 'react';
import { SignIn, SignUp } from '@clerk/react';
import { Shield } from 'lucide-react';
import { Link } from 'wouter';
import { getDisplayBrandName, shouldShowBrandCaption, LanguageToggle, t, useAppLanguage } from './language';
import { usePublicBranding } from './public-branding';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function ClerkAuthPage({
  mode,
  participantRedirect = false,
}: {
  mode: 'sign-in' | 'sign-up';
  participantRedirect?: boolean;
}) {
  useAppLanguage();
  const brandingQuery = usePublicBranding();
  const branding = brandingQuery.data;
  const isSignIn = mode === 'sign-in';
  const clerkCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSignIn) return;

    const container = clerkCardRef.current;
    if (!container) return;

    const addPasswordAutocomplete = () => {
      container.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => {
        if (input.getAttribute('autocomplete') !== 'current-password') {
          input.setAttribute('autocomplete', 'current-password');
        }
      });
    };

    addPasswordAutocomplete();
    const observer = new MutationObserver(addPasswordAutocomplete);
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['autocomplete', 'type'],
    });

    return () => observer.disconnect();
  }, [isSignIn]);

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
          {shouldShowBrandCaption(getDisplayBrandName(branding?.brandName)) && <small>{t('PROGRAM HUB')}</small>}
        </span>
      </Link>
      <LanguageToggle className="auth-language-toggle" />
      <div className="auth-form-content">
        {!isSignIn && (
          <>
            <div className="eyebrow">{t('CREATE YOUR ACCOUNT')}</div>
            <h1 className="app-title">{t('Your journey, in view.')}</h1>
            <p>
              {t('Use the same verified email you entered on your application. Staff accounts still require admin approval.')}
            </p>
          </>
        )}
        <div className="clerk-card" ref={clerkCardRef}>
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
