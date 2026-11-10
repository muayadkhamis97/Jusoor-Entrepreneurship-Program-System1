import { type CSSProperties } from 'react';
import { Link, useLocation } from 'wouter';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { getThemeStyle } from '@workspace/program-editorial/lib/theme';
import { getDisplayBrandName, shouldShowBrandCaption, useAppLanguage } from './language';
import { getBrandingThemeTokens } from './branding-contrast';
import './public-landing.css';

export function PublicLanding({ brandName, logoUrl, primaryColor, accentColor }: {
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}) {
  const { language, toggleLanguage, t } = useAppLanguage();
  const [, navigate] = useLocation();
  const brand = getDisplayBrandName(brandName);
  const themeStyle = {
    ...getThemeStyle(),
    ...getBrandingThemeTokens(primaryColor, accentColor),
  } as CSSProperties;

  return (
    <PaperSurface grain className="editorial-landing" style={themeStyle}>
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
              {shouldShowBrandCaption(brand) && <Typography variant="label" as="span">{t('PROGRAM HUB')}</Typography>}
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
              <Typography variant="body" tone="accent">{t('PROGRAM OPERATIONS')}</Typography>
              <Typography variant="hero" id="landing-title">
                {t('Every founder.')}<br />
                <em>{t('Every next step.')}</em>
              </Typography>
              <Typography className="editorial-description">
                {t('One place for applications, founder progress, and the team behind the work.')}
              </Typography>
            </div>

            <PaperSurface variant="panel" className="editorial-entry">
              <Typography variant="body" as="h2">{t('Choose your next step')}</Typography>
              <div className="editorial-entry-actions">
                <div className="editorial-route editorial-route-apply">
                  <Typography variant="body" tone="accent">{t('FOR NEW FOUNDERS')}</Typography>
                  <Button arrow className="editorial-apply" onClick={() => navigate('/apply')}>
                    {t('Apply to a program')}
                  </Button>
                </div>
                <div className="editorial-route editorial-route-return">
                  <Typography variant="body" tone="accent">{t('RETURNING FOUNDERS & STAFF')}</Typography>
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

          <section className="editorial-journey" aria-labelledby="program-journey-title">
            <Typography variant="heading" tone="accent" as="h2" id="program-journey-title" className="editorial-journey-title">
              {t('FROM APPLICATION TO GRANTS')}
            </Typography>
            <ol className="editorial-stages">
              <li className="editorial-stage">
                <span className="editorial-stage-number" aria-hidden="true">01</span>
                <div className="editorial-stage-copy">
                  <Typography variant="body" tone="accent" as="span"><strong>{t('APPLICATIONS')}</strong></Typography>
                  <Typography variant="body">{t('Apply to join a cohort.')}</Typography>
                </div>
              </li>
              <li className="editorial-stage">
                <span className="editorial-stage-number" aria-hidden="true">02</span>
                <div className="editorial-stage-copy">
                  <Typography variant="body" tone="accent" as="span"><strong>{t('BOOTCAMP / HACKATHON')}</strong></Typography>
                  <Typography variant="body">{t('In-person bootcamp or hackathon selects businesses for incubation.')}</Typography>
                </div>
              </li>
              <li className="editorial-stage">
                <span className="editorial-stage-number" aria-hidden="true">03</span>
                <div className="editorial-stage-copy">
                  <Typography variant="body" tone="accent" as="span"><strong>{t('ONLINE INCUBATION')}</strong></Typography>
                  <Typography variant="body">{t('Live training, one-to-one mentoring, experts, and agency connections.')}</Typography>
                </div>
              </li>
              <li className="editorial-stage">
                <span className="editorial-stage-number" aria-hidden="true">04</span>
                <div className="editorial-stage-copy">
                  <Typography variant="body" tone="accent" as="span"><strong>{t('PITCH DAY')}</strong></Typography>
                  <Typography variant="body">{t('Pitch day qualifies businesses for demo day.')}</Typography>
                </div>
              </li>
              <li className="editorial-stage">
                <span className="editorial-stage-number" aria-hidden="true">05</span>
                <div className="editorial-stage-copy">
                  <Typography variant="body" tone="accent" as="span"><strong>{t('DEMO DAY & GRANTS')}</strong></Typography>
                  <Typography variant="body">{t('Judges select grant recipients at demo day.')}</Typography>
                </div>
              </li>
            </ol>
          </section>

          <footer className="editorial-foot">
            <div className="editorial-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              <Typography variant="body" as="span">{t('Founder progress is private to the applicant. Staff workspace access requires admin approval.')}</Typography>
            </div>
          </footer>
        </div>
      </main>
    </PaperSurface>
  );
}
