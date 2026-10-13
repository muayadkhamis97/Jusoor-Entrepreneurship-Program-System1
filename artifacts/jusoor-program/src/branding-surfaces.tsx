import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProgramBrandingQueryKey, useGetProgramBranding, useUpdateProgramBranding } from '@workspace/api-client-react';
import type { ProgramBrandingInput } from '@workspace/api-client-react';
import { Check, CircleAlert, Image, Palette, RotateCcw, Save } from 'lucide-react';
import { t, useAppLanguage } from './language';
import './branding-surfaces.css';

const defaults: ProgramBrandingInput = {
  brandName: 'Jusoor',
  logoUrl: null,
  primaryColor: '#28665A',
  accentColor: '#D98A46',
};

export function BrandingPage() {
  useAppLanguage();
  const client = useQueryClient();
  const query = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const update = useUpdateProgramBranding();
  const [form, setForm] = useState<ProgramBrandingInput>(defaults);
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState('');
  useEffect(() => {
    if (query.data && !initialized) {
      setForm({ ...query.data });
      setInitialized(true);
    }
  }, [query.data, initialized]);
  const change = (key: keyof ProgramBrandingInput, value: string | null) => {
    setSaved(false);
    setForm(current => ({ ...current, [key]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const brandName = form.brandName.trim();
    const logoUrl = form.logoUrl?.trim() || null;
    if (!brandName) { setValidationError('Enter a brand name.'); return; }
    if (!/^#[0-9a-f]{6}$/i.test(form.primaryColor) || !/^#[0-9a-f]{6}$/i.test(form.accentColor)) {
      setValidationError('Use a six-digit hex color, such as #28665A.');
      return;
    }
    if (logoUrl && !/^https:\/\//i.test(logoUrl)) { setValidationError('Logo URL must begin with https://.'); return; }
    setValidationError('');
    const data: ProgramBrandingInput = { brandName, logoUrl, primaryColor: form.primaryColor, accentColor: form.accentColor };
    update.mutate({ data }, {
      onSuccess: () => {
        setForm(data);
        setSaved(true);
        void client.invalidateQueries({ queryKey: getGetProgramBrandingQueryKey() });
      },
    });
  };
  const restore = () => { setForm(defaults); setSaved(false); setValidationError(''); };
  const busy = query.isLoading || update.isPending;
  if (query.isLoading) return <main className="branding-page"><div className="branding-skeleton" /><div className="branding-skeleton" /></main>;
  if (query.isError) return <main className="branding-page"><section className="branding-error"><CircleAlert /><h1>{t('Brand settings could not load.')}</h1><p>{t('Your current identity is unchanged. Try again.')}</p><button className="button button-outline" onClick={() => void query.refetch()}>{t('Retry connection')}</button></section></main>;
  const updateField = (key: 'primaryColor' | 'accentColor', value: string) => change(key, value);
  return <main className="branding-page">
    <header className="branding-heading"><div><div className="eyebrow">{t('PROGRAM IDENTITY / COORDINATOR')}</div><h1 className="app-title">{t('Branding')}</h1><p>{t('Set the name, mark and colors participants and staff see across Jusoor.')}</p></div><span className="branding-access"><Palette size={15} />{t('Coordinator controls')}</span></header>
    <div className="branding-layout">
      <form className="branding-form" onSubmit={submit}>
        <div className="branding-form-top"><div><span className="branding-step">01</span><h2>{t('Your program identity')}</h2></div><p>{t('Changes take effect across the workspace and participant learning after saving.')}</p></div>
        <label className="branding-field"><span>{t('Brand name')}</span><input value={form.brandName} onChange={event => change('brandName', event.target.value)} maxLength={80} required autoComplete="organization" data-testid="input-brand-name" /><small>{t('Shown in the platform navigation and public-facing participant surfaces.')}</small></label>
        <label className="branding-field"><span>{t('Logo URL')} <em>{t('Optional')}</em></span><div className="branding-url"><Image size={16} /><input type="url" value={form.logoUrl || ''} onChange={event => change('logoUrl', event.target.value || null)} placeholder="https://" data-testid="input-brand-logo-url" /></div><small>{t('Use a publicly accessible image URL. Leave blank to use the Jusoor lettermark.')}</small></label>
        <div className="branding-color-grid">
          {(['primaryColor', 'accentColor'] as const).map((key, index) => <label className="branding-field branding-color-field" key={key}><span>{t(index ? 'Accent color' : 'Primary color')}</span><div className="branding-color-control"><input aria-label={t(index ? 'Choose accent color' : 'Choose primary color')} type="color" value={form[key]} onChange={event => updateField(key, event.target.value)} data-testid={`input-${key}-picker`} /><input aria-label={t(index ? 'Accent color hex value' : 'Primary color hex value')} value={form[key]} onChange={event => updateField(key, event.target.value)} maxLength={7} pattern="^#[0-9A-Fa-f]{6}$" data-testid={`input-${key}`} /></div><small>{t(index ? 'Highlights, calls to action and emphasis.' : 'Navigation, links and the main program identity.')}</small></label>)}
        </div>
        {validationError && <div className="form-error" role="alert"><CircleAlert size={15} />{t(validationError)}</div>}
        {update.isError && <div className="form-error" role="alert"><CircleAlert size={15} />{t('Branding could not be saved. Check your values and try again.')}</div>}
        {saved && <div className="branding-saved" role="status"><Check size={15} />{t('Branding saved and applied.')}</div>}
        <div className="branding-actions"><button type="button" className="button button-quiet" onClick={restore} disabled={busy}><RotateCcw size={14} />{t('Restore Jusoor defaults')}</button><button type="submit" className="button button-primary" disabled={busy} data-testid="button-save-branding">{update.isPending ? t('Saving…') : <><Save size={15} />{t('Save branding')}</>}</button></div>
      </form>
      <aside className="branding-preview-wrap">
        <div className="branding-preview-label"><span>{t('LIVE PREVIEW')}</span><span>{t('Unsaved changes')}</span></div>
        <section className="branding-preview" style={{ '--preview-primary': form.primaryColor, '--preview-accent': form.accentColor } as CSSProperties} aria-label={t('Branding preview')}>
          <div className="branding-preview-nav">{form.logoUrl ? <img src={form.logoUrl} alt="" /> : <span className="branding-preview-mark">{form.brandName.slice(0, 1) || 'J'}</span>}<b>{form.brandName || t('Your brand name')}</b><span>{t('PROGRAM HUB')}</span></div>
          <div className="branding-preview-body"><span className="branding-preview-kicker">{t('YOUR COHORT / LEARNING')}</span><h3>{t('A clear path for what comes next.')}</h3><p>{t('Your program, your next step, and the people moving with you.')}</p><button type="button" tabIndex={-1}>{t('View learning path')} <Check size={13} /></button></div>
          <div className="branding-preview-swatches"><span><i />{t('Primary')}</span><span><i />{t('Accent')}</span></div>
        </section>
        <p className="branding-preview-note">{t('This preview reflects the platform shell and participant-facing learning surfaces.')}</p>
      </aside>
    </div>
  </main>;
}
