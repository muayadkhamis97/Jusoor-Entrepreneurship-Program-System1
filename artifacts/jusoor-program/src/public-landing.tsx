import { Link, useLocation } from 'wouter';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { getThemeStyle } from '@workspace/program-editorial/lib/theme';
import { getDisplayBrandName, useAppLanguage } from './language';
import './public-landing.css';

export function PublicLanding({ brandName, logoUrl }: { brandName?: string | null; logoUrl?: string | null }) {
  const { language, toggleLanguage, t } = useAppLanguage();
  const [, navigate] = useLocation();
  const brand = getDisplayBrandName(brandName);

  return (
    <PaperSurface grain className="editorial-landing" style={getThemeStyle()}>
      <main lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <header className="editorial-top">
          <Link href="/" className="editorial-brand" aria-label={brand}>
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <span className="editorial-mark" aria-hidden="true">{brand.slice(0, 1)}</span>
            )}
            <span className="editorial-brand-name">
              <b>{brand}</b>
              <Typography variant="label" as="span">{t('PROGRAM HUB')}</Typography>
            </span>
          </Link>
          <Button
            variant="pill"
            onClick={toggleLanguage}
            aria-label={language === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}
          >
            <span aria-hidden="true">文 · </span>{language === 'ar' ? 'English' : 'العربية'}
          </Button>
        </header>

        <div className="editorial-content">
          <section className="editorial-hero" aria-labelledby="landing-title">
            <div className="editorial-hero-copy">
              <Typography variant="label" tone="accent">{t('PROGRAM OPERATIONS')}</Typography>
              <Typography variant="hero" id="landing-title">
                {t('Every founder.')}<br />
                <em>{t('Every next step.')}</em>
              </Typography>
              <Typography className="editorial-description">
                {t('One place for applications, founder progress, and the team behind the work.')}
              </Typography>
            </div>

            <PaperSurface variant="panel" className="editorial-entry">
              <Typography variant="label">{t('Choose your next step')}</Typography>
              <div className="editorial-entry-actions">
                <div className="editorial-route editorial-route-apply">
                  <Typography variant="label">{t('FOR NEW FOUNDERS')}</Typography>
                  <Button arrow className="editorial-apply" onClick={() => navigate('/apply')}>
                    {t('Apply to a program')}
                  </Button>
                </div>
                <div className="editorial-route editorial-route-return">
                  <Typography variant="label">{t('RETURNING FOUNDERS & STAFF')}</Typography>
                  <Link href="/participant" className="editorial-text-link">
                    {t('Already applied? Sign in to track progress')} <span aria-hidden="true">→</span>
                  </Link>
                  <Link href="/sign-in" className="editorial-text-link">
                    {t('Program team sign in')} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </PaperSurface>
          </section>

          <ol className="editorial-stages">
            <li><span className="editorial-stage-number" aria-hidden="true">01</span><Typography variant="label">{t('OUTREACH')}</Typography></li>
            <li><span className="editorial-stage-number" aria-hidden="true">02</span><Typography variant="label">{t('INCUBATION')}</Typography></li>
            <li><span className="editorial-stage-number" aria-hidden="true">03</span><Typography variant="label">{t('GRANTS')}</Typography></li>
          </ol>

          <footer className="editorial-foot">
            <div className="editorial-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{t('Founder progress is private to the applicant. Staff workspace access requires admin approval.')}</span>
            </div>
          </footer>
        </div>
      </main>
    </PaperSurface>
  );
}
