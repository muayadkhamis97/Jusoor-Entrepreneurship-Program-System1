import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProgramBrandingQueryKey, useCreateBrandLogoUploadUrl, useGetProgramBranding, useUpdateProgramBranding } from '@workspace/api-client-react';
import type { ProgramBrandingInput } from '@workspace/api-client-react';
import { Check, CircleAlert, Image, Palette, RotateCcw, Save, Trash2 } from 'lucide-react';
import { getDisplayBrandName, isAllowedDisplayBrandName, t, useAppLanguage } from './language';
import './branding-surfaces.css';
import { getAccessibleBrandForeground, getAccessiblePanelForeground } from './branding-contrast';

type BrandingForm = Omit<ProgramBrandingInput, 'sidebarColor' | 'topbarColor'> & {
  sidebarColor: string;
  topbarColor: string;
};
type BrandingColorField = 'primaryColor' | 'accentColor' | 'sidebarColor' | 'topbarColor';

const defaults: BrandingForm = {
  brandName: 'Program Hub',
  logoUrl: null,
  primaryColor: '#28665A',
  accentColor: '#D98A46',
  sidebarColor: '#1F3445',
  topbarColor: '#2D4453',
};

export function BrandingPage() {
  useAppLanguage();
  const client = useQueryClient();
  const query = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const update = useUpdateProgramBranding();
  const createLogoUpload = useCreateBrandLogoUploadUrl();
  const [form, setForm] = useState<BrandingForm>(defaults);
  const [savedForm, setSavedForm] = useState<BrandingForm>(defaults);
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [logoUploadError, setLogoUploadError] = useState('');
  const [logoUploadMessage, setLogoUploadMessage] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  useEffect(() => {
    if (query.data && !initialized) {
      const initialForm = { ...query.data, brandName: getDisplayBrandName(query.data.brandName) };
      setForm(initialForm);
      setSavedForm(initialForm);
      setInitialized(true);
    }
  }, [query.data, initialized]);
  useEffect(() => () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
  }, [logoPreviewUrl]);
  const change = (key: keyof BrandingForm, value: string | null) => {
    setSaved(false);
    if (key === 'logoUrl') {
      setLogoPreviewUrl(null);
      setLogoUploadMessage('');
    }
    setForm(current => ({ ...current, [key]: value }));
  };
  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setLogoUploadError('Choose a JPEG, PNG, or WebP image up to 5 MB.');
      return;
    }
    setLogoUploadError('');
    setLogoUploadMessage('');
    setUploadingLogo(true);
    try {
      const signed = await createLogoUpload.mutateAsync({ data: { contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', size: file.size } });
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw new Error('Logo upload failed.');
      change('logoUrl', signed.logoUrl);
      setLogoPreviewUrl(URL.createObjectURL(file));
      setLogoUploadMessage('Logo uploaded. Save branding to apply it.');
    } catch {
      setLogoUploadError('Logo upload failed. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const brandName = form.brandName.trim();
    const logoUrl = form.logoUrl?.trim() || null;
    if (!brandName) { setValidationError('Enter a brand name.'); return; }
    if (!isAllowedDisplayBrandName(brandName)) { setValidationError('This brand name is unavailable. Choose another name.'); return; }
    if (![form.primaryColor, form.accentColor, form.sidebarColor, form.topbarColor].every(color => /^#[0-9a-f]{6}$/i.test(color))) {
      setValidationError('Use a six-digit hex color, such as #28665A.');
      return;
    }
    if (logoUrl && !/^https:\/\//i.test(logoUrl)) { setValidationError('Logo URL must begin with https://.'); return; }
    setValidationError('');
    const data: BrandingForm = { ...form, brandName, logoUrl };
    update.mutate({ data }, {
      onSuccess: () => {
        setForm(data);
        setSavedForm(data);
        setSaved(true);
        setLogoPreviewUrl(null);
        setLogoUploadMessage('');
        void client.invalidateQueries({ queryKey: getGetProgramBrandingQueryKey() });
      },
    });
  };
  const restore = () => { setForm(defaults); setSaved(false); setValidationError(''); setLogoPreviewUrl(null); setLogoUploadError(''); setLogoUploadMessage(''); };
  const hasUnsavedChanges = (Object.keys(defaults) as (keyof BrandingForm)[]).some(key => form[key] !== savedForm[key]);
  const busy = query.isLoading || update.isPending || uploadingLogo;
  if (query.isLoading) return <main className="branding-page"><div className="branding-skeleton" /><div className="branding-skeleton" /></main>;
  if (query.isError) return <main className="branding-page"><section className="branding-error"><CircleAlert /><h1>{t('Brand settings could not load.')}</h1><p>{t('Your current identity is unchanged. Try again.')}</p><button className="button button-outline" onClick={() => void query.refetch()}>{t('Retry connection')}</button></section></main>;
  const updateField = (key: BrandingColorField, value: string) => change(key, value);
  return <main className="branding-page">
    <header className="branding-heading"><div><div className="eyebrow">{t('PROGRAM IDENTITY / ADMIN')}</div><h1 className="app-title">{t('Branding')}</h1><p>{t('Set the name, mark and colors participants and staff see across the platform.')}</p></div><span className="branding-access"><Palette size={15} />{t('Admin controls')}</span></header>
    <div className="branding-layout">
      <form className="branding-form" onSubmit={submit}>
        <div className="branding-form-top"><div><span className="branding-step">01</span><h2>{t('Your program identity')}</h2></div><p>{t('Changes take effect across the workspace and participant learning after saving.')}</p></div>
        <label className="branding-field"><span>{t('Brand name')}</span><input value={form.brandName} onChange={event => change('brandName', event.target.value)} maxLength={80} required autoComplete="organization" data-testid="input-brand-name" /><small>{t('Shown in the platform navigation and public-facing participant surfaces.')}</small></label>
        <div className="branding-field">
          <label htmlFor="input-brand-logo-file"><span>{t('Upload logo')} <em>{t('Optional')}</em></span></label>
          <div className="branding-logo-upload">
            <input id="input-brand-logo-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadLogo(event)} disabled={busy} data-testid="input-brand-logo-file" />
            {uploadingLogo && <span role="status">{t('Uploading logo…')}</span>}
          </div>
          <small>{t('File requirements: JPEG, PNG, or WebP. Maximum file size: 5 MB.')}</small>
          {form.logoUrl && <div className="branding-logo-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={() => { change('logoUrl', null); setLogoUploadError(''); setLogoUploadMessage('Logo removed. Save branding to apply it.'); }} data-testid="button-remove-brand-logo"><Trash2 size={14} />{t('Remove logo')}</button></div>}
          {logoUploadError && <span className="branding-upload-error" role="alert">{t(logoUploadError)}</span>}
          {logoUploadMessage && <span className="branding-upload-success" role="status">{t(logoUploadMessage)}</span>}
        </div>
        <label className="branding-field"><span>{t('Logo URL')} <em>{t('Optional')}</em></span><div className="branding-url"><Image size={16} /><input type="text" value={form.logoUrl || ''} onChange={event => change('logoUrl', event.target.value || null)} placeholder="https://…" data-testid="input-brand-logo-url" /></div><small>{t('Use a publicly accessible HTTPS image URL instead of uploading a file.')}</small></label>
        <div className="branding-color-grid">
          {([
            ['primaryColor', 'Primary color', 'Choose primary color', 'Primary color hex value', 'Navigation, links and the main program identity.'],
            ['accentColor', 'Accent color', 'Choose accent color', 'Accent color hex value', 'Highlights, calls to action and emphasis.'],
            ['sidebarColor', 'Left navigation panel', 'Choose left navigation panel color', 'Left navigation panel hex value', 'The panel text color adjusts automatically for contrast.'],
            ['topbarColor', 'Top header panel', 'Choose top header panel color', 'Top header panel hex value', 'The panel text color adjusts automatically for contrast.'],
          ] as const).map(([key, label, pickerLabel, inputLabel, help]) => <label className="branding-field branding-color-field" key={key}><span>{t(label)}</span><div className="branding-color-control"><input aria-label={t(pickerLabel)} type="color" value={form[key]} onChange={event => updateField(key, event.target.value)} data-testid={`input-${key}-picker`} /><input aria-label={t(inputLabel)} value={form[key]} onChange={event => updateField(key, event.target.value)} maxLength={7} pattern="^#[0-9A-Fa-f]{6}$" data-testid={`input-${key}`} /></div><small>{t(help)}</small></label>)}
        </div>
        {validationError && <div className="form-error" role="alert"><CircleAlert size={15} />{t(validationError)}</div>}
        {update.isError && <div className="form-error" role="alert"><CircleAlert size={15} />{t('Branding could not be saved. Check your values and try again.')}</div>}
        {saved && <div className="branding-saved" role="status"><Check size={15} />{t('Branding saved and applied.')}</div>}
        <div className="branding-actions"><button type="button" className="button button-quiet" onClick={restore} disabled={busy}><RotateCcw size={14} />{t('Restore default settings')}</button><button type="submit" className="button button-primary" disabled={busy} data-testid="button-save-branding">{update.isPending ? t('Saving…') : <><Save size={15} />{t('Save branding')}</>}</button></div>
      </form>
      <aside className="branding-preview-wrap">
        <div className="branding-preview-label"><span>{t('LIVE PREVIEW')}</span>{hasUnsavedChanges && <span>{t('Unsaved changes')}</span>}</div>
        <section className="branding-preview" style={{
          '--preview-primary': form.primaryColor,
          '--preview-primary-foreground': `hsl(${getAccessibleBrandForeground(form.primaryColor)})`,
          '--preview-accent': form.accentColor,
          '--preview-accent-foreground': `hsl(${getAccessibleBrandForeground(form.accentColor)})`,
          '--preview-sidebar': form.sidebarColor,
          '--preview-sidebar-foreground': getAccessiblePanelForeground(form.sidebarColor),
          '--preview-topbar': form.topbarColor,
          '--preview-topbar-foreground': getAccessiblePanelForeground(form.topbarColor),
        } as CSSProperties} aria-label={t('Branding preview')}>
          <div className="branding-preview-shell">
            <aside className="branding-preview-sidebar"><div className="branding-preview-brand">{(logoPreviewUrl || form.logoUrl) ? <img src={logoPreviewUrl || form.logoUrl || ''} alt="" /> : <span className="branding-preview-mark">{form.brandName.slice(0, 1) || 'J'}</span>}<b>{form.brandName || t('Your brand name')}</b></div><span className="branding-preview-nav-item">{t('Overview')}</span><span className="branding-preview-nav-item">{t('Programs')}</span></aside>
            <div className="branding-preview-main">
              <div className="branding-preview-topbar"><b>{t('Overview')}</b><span>{t('Admin')}</span></div>
              <div className="branding-preview-body"><span className="branding-preview-kicker">{t('YOUR COHORT / LEARNING')}</span><h3>{t('A clear path for what comes next.')}</h3><p>{t('Your program, your next step, and the people moving with you.')}</p><button type="button" tabIndex={-1}>{t('View learning path')} <Check size={13} /></button></div>
            </div>
          </div>
          <div className="branding-preview-swatches"><span><i style={{ background: 'var(--preview-primary)' }} />{t('Primary')}</span><span><i style={{ background: 'var(--preview-accent)' }} />{t('Accent')}</span><span><i style={{ background: 'var(--preview-sidebar)' }} />{t('Left panel')}</span><span><i style={{ background: 'var(--preview-topbar)' }} />{t('Top panel')}</span></div>
        </section>
        <p className="branding-preview-note">{t('This preview reflects the platform shell and participant-facing learning surfaces.')}</p>
      </aside>
    </div>
  </main>;
}
