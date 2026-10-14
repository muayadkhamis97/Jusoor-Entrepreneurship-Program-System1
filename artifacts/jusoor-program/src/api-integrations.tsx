import { type FormEvent, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListIntegrationApiKeysQueryKey,
  getListProgramsQueryKey,
  useCreateIntegrationApiKey,
  useListIntegrationApiKeys,
  useListPrograms,
  useRevokeIntegrationApiKey,
} from '@workspace/api-client-react';
import type { IntegrationApiKey, IntegrationApiPermission } from '@workspace/api-client-react';
import {
  AlertTriangle, BookOpen, Check, ChevronDown, ChevronUp, Clipboard, Code2,
  KeyRound, LockKeyhole, Plus, RotateCw, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { t, useAppLanguage } from './language';
import './api-integrations.css';

type DocResource = { name: string; method: string; path: string; fields: string; note?: string };
const scopeGroups: {
  id: string;
  name: string;
  arabic: string;
  resources: string;
}[] = [
  { id: 'programs_sessions', name: 'Programs & schedules', arabic: 'البرامج والجداول', resources: 'programs · sessions' },
  { id: 'applications_businesses', name: 'Applications & businesses', arabic: 'الطلبات والأعمال', resources: 'applications · businesses' },
  { id: 'courses_attendance', name: 'Courses, attendance & progress', arabic: 'الدورات والحضور والتقدم', resources: 'course-modules · attendance · learning-progress' },
  { id: 'mentoring_grants', name: 'Mentoring, pitches & grants', arabic: 'الإرشاد والعروض والمنح', resources: 'mentoring · pitches · grant-receipts' },
];
type ApiPermissionAction = 'read' | 'write';
const permissionToken = (group: string, action: ApiPermissionAction) => `${group}:${action}` as IntegrationApiPermission;
const docs: DocResource[] = [
  { name: 'Applications', method: 'POST', path: '/applications', fields: 'programId, founderName, email, phone, businessName, industry, website, summary, supportNeeds', note: 'PATCH: status (under_review | accepted | declined), reviewNotes' },
  { name: 'Businesses', method: 'POST', path: '/businesses', fields: 'programId, businessName, founderName, email, phone, industry, stage, applicationDate, needs, notes' },
  { name: 'Sessions', method: 'POST', path: '/sessions', fields: 'programId, title, type, scheduledDate, startTime, durationMinutes, facilitator, deliveryMode, location, status', note: 'Trainer assignment, Zoom links, and recording links stay managed in Jusoor.' },
  { name: 'Course modules', method: 'POST', path: '/course-modules', fields: 'programId, title, description, position, releaseAt, dueAt, isRequired, isPublished', note: 'Module structure only. Course-material files remain behind the role-gated Jusoor learning pages.' },
  { name: 'Attendance', method: 'POST', path: '/attendance', fields: '{ sessionId, records: [{ businessId, status (present | absent | excused), notes, attendedSeconds }] }', note: 'Matching session/business rows are upserted.' },
  { name: 'Learning progress', method: 'POST', path: '/learning-progress', fields: '{ applicationId, moduleId, completed }', note: 'Requires an accepted, linked participant and a released module. Progress is locked after certificate issuance.' },
  { name: 'Mentoring', method: 'POST', path: '/mentoring', fields: 'businessId, type, provider, mentorStaffId, topic, scheduledDate, status, notes' },
  { name: 'Pitches', method: 'POST', path: '/pitches', fields: 'businessId, eventType, eventDate, judges, score, grantDecision, grantAmount, feedback' },
  { name: 'Grant receipts', method: 'POST', path: '/grant-receipts', fields: 'pitchId, kind (received | reversal), amount, receivedOn, reference, notes', note: 'Receipts are immutable. Correct an entry by appending a reversal with a note.' },
];
const formatDate = (value?: string | null, locale = 'en-GB') => value
  ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

export function ApiIntegrationsPage() {
  const { language } = useAppLanguage();
  const ar = language === 'ar';
  const copy = (en: string, arabic: string) => ar ? arabic : en;
  const queryClient = useQueryClient();
  const programsQuery = useListPrograms(undefined, { query: { queryKey: getListProgramsQueryKey() } });
  const programs = programsQuery.data || [];
  const keysQuery = useListIntegrationApiKeys({ query: { queryKey: getListIntegrationApiKeysQueryKey() } });
  const createKey = useCreateIntegrationApiKey();
  const revokeKey = useRevokeIntegrationApiKey();
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [programId, setProgramId] = useState('');
  const [permissions, setPermissions] = useState<IntegrationApiPermission[]>([]);
  const [newSecret, setNewSecret] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  const [secretCanClose, setSecretCanClose] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<IntegrationApiKey | null>(null);
  const [openDocs, setOpenDocs] = useState(true);
  const [formError, setFormError] = useState('');
  const keys = keysQuery.data?.keys || [];
  const activeCount = useMemo(() => keys.filter(key => !key.revokedAt).length, [keys]);
  const locale = ar ? 'ar-JO' : 'en-GB';

  const refreshKeys = () => queryClient.invalidateQueries({ queryKey: getListIntegrationApiKeysQueryKey() });
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!label.trim() || !programId || permissions.length === 0) {
      setFormError(copy('Add a key name, choose one program, and select at least one permission.', 'أدخل اسم المفتاح واختر برنامجاً واحداً وصلاحية واحدة على الأقل.'));
      return;
    }
    createKey.mutate({ data: { label: label.trim(), programId: Number(programId), permissions } }, {
      onSuccess: result => {
        setNewSecret(result.secret);
        setSecretCopied(false);
        setSecretCanClose(false);
        setFormOpen(false);
        setLabel('');
        setProgramId('');
        setPermissions([]);
        void refreshKeys();
      },
      onError: () => setFormError(copy('The key could not be created. Please try again.', 'تعذر إنشاء المفتاح. يرجى المحاولة مجدداً.')),
    });
  };
  const confirmRevoke = () => {
    if (!pendingRevoke) return;
    revokeKey.mutate({ id: pendingRevoke.id }, {
      onSuccess: () => { setPendingRevoke(null); void refreshKeys(); },
      onError: () => setCopyFeedback(copy('Revocation failed. Try again.', 'تعذر إلغاء المفتاح. حاول مجدداً.')),
    });
  };
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(newSecret);
      setSecretCopied(true);
      setSecretCanClose(true);
    } catch {
      setSecretCopied(false);
      setSecretCanClose(true);
      setCopyFeedback(copy('Clipboard access was blocked. Select and copy the key manually.', 'تعذر الوصول إلى الحافظة. حدد المفتاح وانسخه يدوياً.'));
    }
  };
  const copyText = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(success);
      window.setTimeout(() => setCopyFeedback(''), 2200);
    } catch {
      setCopyFeedback(copy('Clipboard access was blocked.', 'تعذر الوصول إلى الحافظة.'));
    }
  };
  const requestExample = `curl -X GET "https://your-hub.example/api/v1/programs/42/resources/businesses" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;

  return <div className="api-page" dir={ar ? 'rtl' : 'ltr'}>
    <header className="api-hero">
      <div className="api-hero-copy">
        <div className="api-eyebrow"><span className="api-eyebrow-mark"><Code2 size={14} /></span>{copy('COORDINATOR TOOLS / DEVELOPER API', 'أدوات المنسق / واجهة المطورين')}</div>
        <h1>{copy('Connect the systems<br />that move your cohort.', 'اربط الأنظمة التي<br />تدفع مجموعتك للأمام.')}</h1>
        <p>{copy('Issue scoped credentials for trusted integrations. Every key belongs to one program, and every change stays auditable.', 'أنشئ بيانات اعتماد محددة للتكاملات الموثوقة. يرتبط كل مفتاح ببرنامج واحد، وتبقى كل التغييرات قابلة للتدقيق.')}</p>
      </div>
      <div className="api-hero-aside">
        <div className="api-shield"><ShieldCheck size={19} /></div>
        <div className="api-hero-aside-label">{copy('PROGRAM-BOUND ACCESS', 'وصول مرتبط بالبرنامج')}</div>
        <strong>{copy('One key.<br />One cohort.', 'مفتاح واحد.<br />مجموعة واحدة.')}</strong>
        <span>{copy('No cross-program visibility.', 'لا وصول إلى برامج أخرى.')}</span>
        <div className="api-key-count"><b>{String(activeCount).padStart(2, '0')}</b><span>{copy('ACTIVE KEYS', 'مفاتيح نشطة')}</span></div>
      </div>
    </header>

    <section className="api-security-strip" aria-label={copy('Security boundaries', 'حدود الأمان')}>
      <span><LockKeyhole size={16} />{copy('Scoped to a single existing program', 'محدد ببرنامج قائم واحد')}</span>
      <span><ShieldCheck size={16} />{copy('Secrets are shown once only', 'يظهر السر مرة واحدة فقط')}</span>
      <span><RotateCw size={16} />{copy('Revocation takes effect immediately', 'يسري الإلغاء فوراً')}</span>
    </section>

    <section className="api-keys-section">
      <div className="api-section-heading">
        <div><div className="api-eyebrow">{copy('CREDENTIALS', 'بيانات الاعتماد')}</div><h2>{copy('API keys', 'مفاتيح API')}</h2><p>{copy('Credentials for the systems you trust with this cohort.', 'بيانات اعتماد للأنظمة الموثوقة ضمن هذه المجموعة.')}</p></div>
        <button className="api-button api-button-primary" type="button" onClick={() => { setFormOpen(value => !value); setFormError(''); }} disabled={programs.length === 0} data-testid="button-create-api-key"><Plus size={16} />{copy('Create key', 'إنشاء مفتاح')}</button>
      </div>

      {formOpen && <form className="api-create-form" onSubmit={submitCreate} data-testid="form-create-api-key">
        <div className="api-form-title"><KeyRound size={18} /><div><strong>{copy('New program key', 'مفتاح برنامج جديد')}</strong><span>{copy('This credential will never reach another cohort.', 'لن يصل هذا المفتاح إلى مجموعة أخرى.')}</span></div><button type="button" className="api-icon-button" aria-label={copy('Close form', 'إغلاق النموذج')} onClick={() => setFormOpen(false)} data-testid="button-close-create-key"><X size={17} /></button></div>
        <label className="api-field"><span>{copy('Key name', 'اسم المفتاح')}</span><input autoFocus maxLength={100} value={label} onChange={event => setLabel(event.target.value)} placeholder={copy('e.g. Finance reporting', 'مثال: تقارير المالية')} data-testid="input-api-key-label" required /></label>
        <label className="api-field"><span>{copy('Program scope', 'نطاق البرنامج')}</span><select value={programId} onChange={event => setProgramId(event.target.value)} data-testid="select-api-key-program" required><option value="">{copy('Choose one existing program', 'اختر برنامجاً قائماً واحداً')}</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select><small>{copy('Program scope is fixed after creation.', 'لا يمكن تغيير نطاق البرنامج بعد الإنشاء.')}</small></label>
        <fieldset className="api-permission-fieldset" data-testid="fieldset-api-key-permissions">
          <legend>{copy('Data and actions this key can access', 'البيانات والإجراءات المسموح بها لهذا المفتاح')}</legend>
          <p>{copy('Choose read and write access separately for each area. Nothing is selected by default.', 'اختر صلاحيات القراءة والكتابة لكل مجال بشكل منفصل. لا توجد صلاحيات محددة مسبقاً.')}</p>
          <div className="api-permission-grid">{scopeGroups.map(group => <div className="api-permission-card" key={group.id}>
            <strong>{ar ? group.arabic : group.name}</strong><small>{group.resources}</small>
            <div className="api-permission-actions">{(['read', 'write'] as const).map(action => {
              const permission = permissionToken(group.id, action);
              return <label key={action}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => {
                setPermissions(current => current.includes(permission)
                  ? current.filter(item => item !== permission)
                  : [...current, permission]);
                setFormError('');
              }} data-testid={`checkbox-api-permission-${group.id}-${action}`} /><span>{action === 'read' ? copy('Read', 'قراءة') : copy('Write', 'كتابة')}</span></label>;
            })}</div>
          </div>)}</div>
        </fieldset>
        {formError && <div className="api-inline-error" role="alert" data-testid="status-create-key-error"><AlertTriangle size={15} />{formError}</div>}
        <div className="api-form-actions"><button type="button" className="api-button api-button-quiet" onClick={() => setFormOpen(false)} data-testid="button-cancel-create-key">{copy('Cancel', 'إلغاء')}</button><button className="api-button api-button-primary" type="submit" disabled={createKey.isPending || !programs.length} data-testid="button-submit-create-key">{createKey.isPending ? copy('Creating…', 'جارٍ الإنشاء…') : <><KeyRound size={15} />{copy('Create scoped key', 'إنشاء مفتاح محدد')}</>}</button></div>
      </form>}

      {programsQuery.isLoading && <div className="api-loading" aria-label={copy('Loading programs', 'جارٍ تحميل البرامج')}><i /><i /><i /></div>}
      {programsQuery.isError && <div className="api-notice api-notice-error" role="alert"><AlertTriangle size={17} />{copy('Programs could not be loaded. Refresh and try again.', 'تعذر تحميل البرامج. حدّث الصفحة وحاول مجدداً.')}<button className="api-text-button" onClick={() => void programsQuery.refetch()} data-testid="button-retry-programs">{copy('Retry', 'إعادة المحاولة')}</button></div>}
      {keysQuery.isLoading && <div className="api-key-skeleton"><i /><i /></div>}
      {keysQuery.isError && <div className="api-notice api-notice-error" role="alert"><AlertTriangle size={17} />{copy('API keys could not be loaded. Your credentials are unchanged.', 'تعذر تحميل مفاتيح API. لم تتغير بيانات اعتمادك.')}<button className="api-text-button" onClick={() => void keysQuery.refetch()} data-testid="button-retry-keys">{copy('Retry', 'إعادة المحاولة')}</button></div>}
      {!keysQuery.isLoading && !keysQuery.isError && (keys.length ? <div className="api-key-list">
        {keys.map(key => <article className={`api-key-row ${key.revokedAt ? 'is-revoked' : ''}`} key={key.id} data-testid={`card-api-key-${key.id}`}>
          <div className="api-key-icon"><KeyRound size={17} /></div>
          <div className="api-key-main"><div className="api-key-title"><strong data-testid={`text-api-key-label-${key.id}`}>{key.label}</strong><span className={`api-status ${key.revokedAt ? 'revoked' : 'active'}`} data-testid={`status-api-key-${key.id}`}><i />{key.revokedAt ? copy('Revoked', 'ملغى') : copy('Active', 'نشط')}</span></div><div className="api-key-meta"><code data-testid={`text-api-key-prefix-${key.id}`}>{key.keyPrefix}••••••••</code><span>{key.programName}</span></div></div>
          <div className="api-key-permissions" data-testid={`text-api-key-permissions-${key.id}`}>{scopeGroups.map(group => {
            const actions = (['read', 'write'] as const).filter(action => key.permissions.includes(permissionToken(group.id, action)));
            return actions.length ? <span className="api-permission-chip" key={group.id}><b>{ar ? group.arabic : group.name}</b><small>{actions.map(action => action === 'read' ? copy('Read', 'قراءة') : copy('Write', 'كتابة')).join(' + ')}</small></span> : null;
          })}</div>
          <div className="api-key-dates"><div><small>{copy('CREATED', 'تاريخ الإنشاء')}</small><span>{formatDate(key.createdAt, locale)}</span></div><div><small>{copy('LAST USED', 'آخر استخدام')}</small><span>{formatDate(key.lastUsedAt, locale)}</span></div></div>
          {!key.revokedAt && <button className="api-button api-button-revoke" type="button" onClick={() => { setPendingRevoke(key); setCopyFeedback(''); }} data-testid={`button-revoke-api-key-${key.id}`}><Trash2 size={14} />{copy('Revoke', 'إلغاء')}</button>}
          {key.revokedAt && <span className="api-revoked-date">{copy('Revoked', 'أُلغي')} {formatDate(key.revokedAt, locale)}</span>}
        </article>)}
      </div> : !keysQuery.isLoading && !keysQuery.isError && <div className="api-empty" data-testid="empty-api-keys"><span className="api-empty-icon"><KeyRound size={20} /></span><div><strong>{copy('No keys issued yet.', 'لم يتم إصدار مفاتيح بعد.')}</strong><p>{copy('Create a scoped key when a trusted system is ready to connect.', 'أنشئ مفتاحاً محدد النطاق عندما يصبح النظام الموثوق جاهزاً للاتصال.')}</p></div></div>)}
      {copyFeedback && <div className="api-toast-note" role="status" data-testid="status-api-action">{copyFeedback}</div>}
    </section>

    <section className="api-docs-section">
      <button className="api-docs-toggle" type="button" onClick={() => setOpenDocs(value => !value)} aria-expanded={openDocs} data-testid="button-toggle-api-docs">
        <span className="api-docs-icon"><BookOpen size={18} /></span><span className="api-docs-toggle-copy"><small>{copy('REFERENCE / V1', 'مرجع / الإصدار 1')}</small><strong>{copy('Developer API', 'واجهة المطورين')}</strong><em>{copy('Resources, payloads and write rules', 'الموارد والبيانات وقواعد الكتابة')}</em></span>{openDocs ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {openDocs && <div className="api-docs-body">
         <div className="api-docs-intro"><p>{copy('Each key is limited to one program and only the data groups and read/write actions selected when it is created. Permissions cannot be edited later; revoke the key and create another to change access. The program ID in each request must match the key scope.', 'يقتصر كل مفتاح على برنامج واحد ومجموعات البيانات وإجراءات القراءة والكتابة المحددة عند إنشائه. لا يمكن تعديل الصلاحيات لاحقاً؛ ألغِ المفتاح وأنشئ آخر لتغيير الوصول. يجب أن يطابق معرّف البرنامج في كل طلب نطاق المفتاح.')}</p></div>
         <div className="api-groups">{scopeGroups.map((group, index) => <div className="api-group-chip" key={group.id}><span>0{index + 1}</span><div><b>{ar ? group.arabic : group.name}</b><small>{group.resources}</small></div></div>)}</div>
        <div className="api-auth-grid"><div className="api-auth-copy"><div className="api-eyebrow">{copy('AUTHENTICATE EVERY REQUEST', 'وثّق كل طلب')}</div><h3>{copy('Bearer token, over HTTPS.', 'رمز Bearer عبر HTTPS.')}</h3><p>{copy('Send the full secret in the Authorization header. Never expose it in browser code, logs or shared documents.', 'أرسل السر كاملاً في ترويسة Authorization. لا تكشفه في كود المتصفح أو السجلات أو المستندات المشتركة.')}</p></div><div className="api-code-block"><div className="api-code-top"><span><i />{copy('REQUEST EXAMPLE', 'مثال طلب')}</span><button type="button" onClick={() => void copyText(requestExample, copy('Example copied', 'تم نسخ المثال'))} aria-label={copy('Copy request example', 'نسخ مثال الطلب')} data-testid="button-copy-api-example"><Clipboard size={14} />{copy('Copy', 'نسخ')}</button></div><pre><code>{requestExample}</code></pre></div></div>
         <div className="api-rules"><div className="api-rule"><span className="api-rule-mark">01</span><div><b>{copy('One program per key', 'برنامج واحد لكل مفتاح')}</b><p>{copy('All requests live beneath /api/v1/programs/{programId}. A key cannot read another program.', 'تتم جميع الطلبات ضمن /api/v1/programs/{programId}. لا يمكن للمفتاح قراءة برنامج آخر.')}</p></div></div><div className="api-rule"><span className="api-rule-mark">02</span><div><b>{copy('Read and write are checked separately', 'يتم التحقق من القراءة والكتابة بشكل منفصل')}</b><p>{copy('GET requires read access. POST and PATCH require write access for that resource group. Missing permissions return 403.', 'يتطلب GET صلاحية القراءة. ويتطلب POST وPATCH صلاحية الكتابة لمجموعة المورد. تعاد 403 عند غياب الصلاحية.')}</p></div></div><div className="api-rule api-rule-warning"><span className="api-rule-mark"><LockKeyhole size={14} /></span><div><b>{copy('No hard deletes. Grant receipts are a ledger.', 'لا حذف نهائياً. إيصالات المنح سجل مالي.')}</b><p>{copy('There are no DELETE routes. Grant receipts cannot be edited or deleted; append a reversal with a note to correct a receipt.', 'لا توجد مسارات DELETE. لا يمكن تعديل إيصالات المنح أو حذفها؛ أضف قيد عكس مع ملاحظة لتصحيح إيصال.')}</p></div></div></div>
        <div className="api-resource-heading"><div><div className="api-eyebrow">{copy('RESOURCE CATALOG', 'فهرس الموارد')}</div><h3>{copy('Fields accepted by each resource', 'الحقول المقبولة لكل مورد')}</h3></div><span>{copy('POST creates · GET reads · PATCH updates', 'POST إنشاء · GET قراءة · PATCH تحديث')}</span></div>
        <div className="api-resource-list">{docs.map((resource, index) => <article className="api-resource" key={resource.name} data-testid={`resource-${resource.path.slice(1)}`}><div className="api-resource-top"><span className="api-resource-index">{String(index + 1).padStart(2, '0')}</span><b>{t(resource.name)}</b><code>{resource.method}</code><code className="api-resource-path">/api/v1/programs/{'{programId}'}/resources{resource.path}</code></div><p>{resource.fields}</p>{resource.note && <small>{resource.note}</small>}</article>)}</div>
      </div>}
    </section>

    {newSecret && <div className="api-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && secretCanClose) setNewSecret(''); }}>
      <section className="api-secret-modal" role="dialog" aria-modal="true" aria-labelledby="api-secret-title">
        <div className="api-secret-mark"><KeyRound size={21} /></div><div className="api-eyebrow">{copy('CREDENTIAL CREATED', 'تم إنشاء بيانات الاعتماد')}</div><h2 id="api-secret-title">{copy('Copy your secret now.', 'انسخ السر الآن.')}</h2><p>{copy('This is the only time this secret will be shown. Store it securely before closing this window.', 'هذه هي المرة الوحيدة التي سيظهر فيها هذا السر. احفظه بأمان قبل إغلاق هذه النافذة.')}</p>
        <div className="api-secret-value"><code data-testid="text-new-api-secret">{newSecret}</code><button type="button" onClick={() => void copySecret()} className={secretCopied ? 'copied' : ''} data-testid="button-copy-new-api-secret">{secretCopied ? <Check size={16} /> : <Clipboard size={16} />}{secretCopied ? copy('Copied', 'تم النسخ') : copy('Copy secret', 'نسخ السر')}</button></div>
        <div className="api-secret-warning" role="alert"><AlertTriangle size={17} /><span><b>{copy('Keep this secret private.', 'حافظ على سرية هذا المفتاح.')}</b>{copy(' It cannot be viewed again. If lost, revoke the key and create a new one.', ' لن تتمكن من عرضه مجدداً. إذا فُقد، ألغِ المفتاح وأنشئ آخر.')}</span></div>
        <button type="button" disabled={!secretCanClose} className="api-button api-button-primary api-secret-done" onClick={() => setNewSecret('')} data-testid="button-dismiss-secret">{copy('I have saved the secret', 'حفظت السر')}</button>
      </section>
    </div>}
    {pendingRevoke && <div className="api-modal-backdrop" role="presentation"><section className="api-revoke-modal" role="alertdialog" aria-modal="true" aria-labelledby="api-revoke-title">
      <div className="api-revoke-symbol"><AlertTriangle size={21} /></div><div className="api-eyebrow">{copy('SECURITY ACTION', 'إجراء أمني')}</div><h2 id="api-revoke-title">{copy('Revoke this key?', 'إلغاء هذا المفتاح؟')}</h2><p>{copy('Any system using', 'أي نظام يستخدم')} <b>{pendingRevoke.label}</b> {copy('will immediately lose access to', 'سيفقد الوصول فوراً إلى')} <b>{pendingRevoke.programName}</b>. {copy('This cannot be undone.', 'لا يمكن التراجع عن هذا الإجراء.')}</p>
      {copyFeedback && <div className="api-inline-error" role="alert">{copyFeedback}</div>}
      <div className="api-form-actions"><button type="button" className="api-button api-button-quiet" onClick={() => setPendingRevoke(null)} disabled={revokeKey.isPending} data-testid="button-cancel-revoke-key">{copy('Keep key', 'الإبقاء على المفتاح')}</button><button type="button" className="api-button api-button-danger" onClick={confirmRevoke} disabled={revokeKey.isPending} data-testid="button-confirm-revoke-key">{revokeKey.isPending ? copy('Revoking…', 'جارٍ الإلغاء…') : <><Trash2 size={15} />{copy('Revoke permanently', 'إلغاء نهائي')}</>}</button></div>
    </section></div>}
  </div>;
}
