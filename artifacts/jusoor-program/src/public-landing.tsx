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
  return <PaperSurface grain className="editorial-landing" style={getThemeStyle()}>
    <main lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="editorial-top">
        <Link href="/" className="editorial-brand" aria-label={brand}>
          {logoUrl ? <img src={logoUrl} alt="" /> : <span className="editorial-mark" aria-hidden="true">{brand.slice(0, 1)}</span>}
          <span><b>{brand}</b><Typography variant="label" as="span">{t('PROGRAM HUB')}</Typography></span>
        </Link>
        <Button variant="pill" onClick={toggleLanguage} aria-label={language === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}>
          <span aria-hidden="true">文 · </span>{language === 'ar' ? 'English' : 'العربية'}
        </Button>
      </header>
      <div className="editorial-content">
        <section className="editorial-hero" aria-labelledby="landing-title">
          <div className="editorial-ornament" aria-hidden="true"><i /><i /></div>
          <Typography variant="hero" id="landing-title">{t('Good work,')}<br /><em>{t('moving forward.')}</em></Typography>
          <Typography className="editorial-description">{t('A private workspace for the team supporting founders from outreach and incubation to pitch day and grants.')}</Typography>
          <Typography variant="label" className="editorial-sequence">{t('OUTREACH')}<i aria-hidden="true" />{t('INCUBATION')}<i aria-hidden="true" />{t('GRANTS')}</Typography>
        </section>
        <section className="editorial-entry" aria-label={t('Choose your next step')}>
          <div className="editorial-intro">
            <Typography variant="label" tone="accent">01 — {t('PROGRAM OPERATIONS')}</Typography>
            <Typography variant="heading">{t('Every founder.')}<br />{t('Every next step.')}</Typography>
            <Typography>{t('One place for applications, founder progress, and the team behind the work.')}</Typography>
          </div>
          <div className="editorial-route">
            <Typography variant="label">{t('FOR NEW FOUNDERS')}</Typography>
            <Button arrow className="editorial-apply" onClick={() => navigate('/apply')}>{t('Apply to a program')}</Button>
          </div>
          <div className="editorial-route">
            <Typography variant="label">{t('RETURNING FOUNDERS & STAFF')}</Typography>
            <Link href="/participant" className="editorial-text-link">{t('Already applied? Sign in to track progress')} <span aria-hidden="true">→</span></Link>
            <Link href="/sign-in" className="editorial-text-link">{t('Program team sign in')} <span aria-hidden="true">→</span></Link>
          </div>
        </section>
        <footer className="editorial-foot">
          <div className="editorial-privacy"><ShieldCheck size={16} aria-hidden="true" /><span>{t('Founder progress is private to the applicant. Staff workspace access requires admin approval.')}</span></div>
          <Typography variant="label">{t('A PRIVATE SPACE FOR')}<br />{t('FOUNDERS & STAFF')}</Typography>
        </footer>
      </div>
    </main>
  </PaperSurface>;
}
