import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProgramGoogleSheetsStatusesQueryKey,
  type ProgramGoogleSheetsExportCategories,
  useCreateProgramGoogleSheetsConnection,
  useGetProgramGoogleSheetsStatuses,
  useRetryProgramGoogleSheetsSync,
  useUpdateProgramGoogleSheetsCategories,
} from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { Rule } from '@workspace/program-editorial/components/ui/rule';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { getThemeStyle } from '@workspace/program-editorial/lib/theme';
import { AlertTriangle, Check, ExternalLink, FileSpreadsheet, LockKeyhole, RotateCw } from 'lucide-react';
import { t, useAppLanguage } from './language';
import './google-sheets.css';

type SheetStatus = 'not_connected' | 'syncing' | 'connected' | 'needs_attention';
type ActionFeedback = { kind: 'error' | 'success'; message: string };

const statusCopy: Record<SheetStatus, [string, string]> = {
  not_connected: ['Not connected', 'غير متصل'],
  syncing: ['Syncing', 'جارٍ المزامنة'],
  connected: ['Connected', 'متصل'],
  needs_attention: ['Needs attention', 'يتطلب المتابعة'],
};

const formatDate = (value: string | null, locale: string) => value
  ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  : null;

export function GoogleSheetsPage() {
  const { language } = useAppLanguage();
  const ar = language === 'ar';
  const copy = (english: string, arabic: string) => ar ? arabic : t(english);
  const locale = ar ? 'ar-JO' : 'en-GB';
  const queryClient = useQueryClient();
  const queryKey = getGetProgramGoogleSheetsStatusesQueryKey();
  const statusesQuery = useGetProgramGoogleSheetsStatuses({
    query: { queryKey, refetchInterval: 15_000, refetchOnWindowFocus: true },
  });
  const createConnection = useCreateProgramGoogleSheetsConnection();
  const retrySync = useRetryProgramGoogleSheetsSync();
  const updateCategories = useUpdateProgramGoogleSheetsCategories();
  const [feedback, setFeedback] = useState<Record<number, ActionFeedback>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<number, ProgramGoogleSheetsExportCategories>>({});
  const statuses = statusesQuery.data ?? [];

  const connect = (programId: number) => {
    setFeedback(current => {
      const next = { ...current };
      delete next[programId];
      return next;
    });
    createConnection.mutate({ programId }, {
      onSuccess: () => {
        setFeedback(current => ({
          ...current,
          [programId]: { kind: 'success', message: copy('Workbook refresh queued. Enabled categories are updating.', 'تمت جدولة تحديث جدول البيانات. يجري تحديث الفئات المفعّلة.') },
        }));
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: error => setFeedback(current => ({
        ...current,
        [programId]: {
          kind: 'error',
          message: error instanceof Error && error.message
            ? error.message
            : copy('The workbook connection could not be confirmed. Check Google Drive before trying again.', 'تعذّر تأكيد اتصال جدول البيانات. تحقق من Google Drive قبل المحاولة مرة أخرى.'),
        },
      })),
    });
  };

  const retry = (programId: number) => {
    setFeedback(current => {
      const next = { ...current };
      delete next[programId];
      return next;
    });
    retrySync.mutate({ programId }, {
      onSuccess: () => {
        setFeedback(current => ({
          ...current,
          [programId]: { kind: 'success', message: copy('A retry for failed synchronization has been queued.', 'تمت جدولة إعادة محاولة مزامنة البيانات التي تعذرت.') },
        }));
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: error => setFeedback(current => ({
        ...current,
        [programId]: {
          kind: 'error',
          message: error instanceof Error && error.message
            ? error.message
            : copy('The synchronization retry could not be queued. The sheet status is unchanged.', 'تعذّرت جدولة إعادة محاولة المزامنة. لم تتغير حالة جدول البيانات.'),
        },
      })),
    });
  };

  const changeCategory = (programId: number, current: ProgramGoogleSheetsExportCategories, key: keyof ProgramGoogleSheetsExportCategories, value: boolean) => {
    setCategoryDrafts(drafts => ({
      ...drafts,
      [programId]: { ...(drafts[programId] ?? current), [key]: value },
    }));
    setFeedback(currentFeedback => {
      const next = { ...currentFeedback };
      delete next[programId];
      return next;
    });
  };

  const saveCategories = (programId: number, categories: ProgramGoogleSheetsExportCategories) => {
    updateCategories.mutate({ programId, data: { exportCategories: categories } }, {
      onSuccess: () => {
        setCategoryDrafts(drafts => {
          const next = { ...drafts };
          delete next[programId];
          return next;
        });
        setFeedback(current => ({
          ...current,
          [programId]: { kind: 'success', message: copy('Export choices saved. The selected data is being refreshed.', 'تم حفظ خيارات التصدير. يجري تحديث البيانات المحددة.') },
        }));
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: error => setFeedback(current => ({
        ...current,
        [programId]: {
          kind: 'error',
          message: error instanceof Error && error.message
            ? error.message
            : copy('Export choices could not be saved. Your previous settings are unchanged.', 'تعذر حفظ خيارات التصدير. لم تتغير الإعدادات السابقة.'),
        },
      })),
    });
  };

  return (
    <PaperSurface className="gs-page" style={getThemeStyle()} dir={ar ? 'rtl' : 'ltr'} data-testid="page-google-sheets">
      <header className="gs-hero">
        <div className="gs-hero-copy">
          <div className="gs-eyebrow"><span className="gs-eyebrow-mark"><FileSpreadsheet size={15} aria-hidden="true" /></span>{copy('PROGRAM TOOLS / GOOGLE SHEETS', 'أدوات البرنامج / جداول بيانات Google')}</div>
          <Typography as="h1" variant="hero" className="gs-title">{copy('Program data, kept in sync.', 'بيانات البرنامج، متزامنة باستمرار.')}</Typography>
          <Typography className="gs-intro">{copy('Create one workbook per program and keep selected program records synchronized.', 'أنشئ جدول بيانات واحداً لكل برنامج وحافظ على مزامنة سجلاته المحددة.')}</Typography>
        </div>
        <aside className="gs-ownership" aria-label={copy('Account and sharing information', 'معلومات الحساب والمشاركة')} data-testid="note-google-sheets-ownership">
          <span className="gs-ownership-icon"><LockKeyhole size={17} aria-hidden="true" /></span>
          <Typography as="h2" variant="label" className="gs-ownership-label">{copy('ACCOUNT & ACCESS', 'الحساب والوصول')}</Typography>
          <Typography className="gs-ownership-copy">{copy('The project-level connected Google account owns each sheet. Google sharing settings control who can open it.', 'يمتلك كل جدول بيانات حساب Google المتصل على مستوى المشروع. وتحدد إعدادات المشاركة في Google من يمكنه فتحه.')}</Typography>
        </aside>
      </header>

      <section className="gs-data-note" aria-label={copy('Synchronized data', 'البيانات التي تتم مزامنتها')} data-testid="note-google-sheets-data">
        <div className="gs-data-note-mark"><Check size={15} aria-hidden="true" /></div>
          <p>{copy('Choose which categories are included for each program below. Data syncs one way; changes in Sheets do not update the platform. These choices do not change Google sharing permissions.', 'اختر الفئات التي تريد تضمينها لكل برنامج أدناه. تتم المزامنة باتجاه واحد؛ ولا تؤدي التغييرات في Sheets إلى تحديث المنصة. لا تغيّر هذه الخيارات أذونات المشاركة في Google.')}</p>
          <p>{copy('When chat export is on, private one-to-one conversations and business/team chats are included. Anyone who can open the workbook under its Google sharing settings can read those messages. Turning a category off removes its existing workbook data on the next successful sync. Sign-in credentials and private meeting links are never exported.', 'عند تفعيل تصدير المحادثات، تُضمّن المحادثات الخاصة بين شخصين ومحادثات الأعمال والفِرق. يمكن لأي شخص يستطيع فتح جدول البيانات وفق إعدادات المشاركة في Google قراءة هذه الرسائل. يؤدي إيقاف فئة إلى حذف بياناتها الحالية من جدول البيانات عند نجاح المزامنة التالية. لا يتم تصدير بيانات اعتماد تسجيل الدخول أو روابط الاجتماعات الخاصة.')}</p>
      </section>

      <section className="gs-program-section" aria-labelledby="gs-programs-title">
        <div className="gs-section-heading">
          <div>
            <Typography as="p" variant="label" tone="accent">{copy('DESTINATIONS', 'وجهات البيانات')}</Typography>
            <Typography as="h2" variant="heading" id="gs-programs-title">{copy('Program workbooks', 'جداول بيانات البرامج')}</Typography>
            <Typography className="gs-section-description">{copy('Only programs available to your account are listed here.', 'تظهر هنا البرامج المتاحة لحسابك فقط.')}</Typography>
          </div>
          <span className="gs-program-count" data-testid="text-google-sheets-program-count">{statusesQuery.isLoading ? '—' : String(statuses.length).padStart(2, '0')} {copy('PROGRAMS', 'برامج')}</span>
        </div>
        <Rule className="gs-section-rule" />

        {statusesQuery.isLoading && (
          <div className="gs-skeleton-list" aria-label={copy('Loading program sheet statuses', 'جارٍ تحميل حالات جداول بيانات البرامج')} aria-busy="true" data-testid="loading-google-sheets-statuses">
            <span /><span /><span />
          </div>
        )}
        {statusesQuery.isError && (
          <div className="gs-state gs-state-error" role="alert" data-testid="error-google-sheets-statuses">
            <AlertTriangle size={18} aria-hidden="true" />
            <div><strong>{copy('Program sheet statuses could not be loaded.', 'تعذّر تحميل حالات جداول بيانات البرامج.')}</strong><p>{copy('Your program access is unchanged. Check your connection and retry.', 'لم تتغير صلاحيات الوصول إلى برامجك. تحقق من اتصالك ثم أعد المحاولة.')}</p></div>
            <Button variant="pill" onClick={() => void statusesQuery.refetch()} data-testid="button-retry-google-sheets-statuses">{copy('Retry loading', 'إعادة تحميل الحالات')}</Button>
          </div>
        )}
        {!statusesQuery.isLoading && !statusesQuery.isError && statuses.length === 0 && (
          <div className="gs-state gs-state-empty" data-testid="empty-google-sheets-programs">
            <span className="gs-empty-icon"><FileSpreadsheet size={22} aria-hidden="true" /></span>
            <Typography as="h3" variant="heading">{copy('No programs available', 'لا توجد برامج متاحة')}</Typography>
            <Typography>{copy('When a program is available to your account, its Google Sheets connection will appear here.', 'سيظهر اتصال جداول بيانات Google هنا عند توفر برنامج لحسابك.')}</Typography>
          </div>
        )}
        {!statusesQuery.isLoading && !statusesQuery.isError && statuses.length > 0 && (
          <div className="gs-program-list" data-testid="list-google-sheets-programs">
            {statuses.map(program => {
              const status = program.status as SheetStatus;
              const [statusEnglish, statusArabic] = statusCopy[status];
              const isCreating = createConnection.isPending && createConnection.variables?.programId === program.programId;
              const isRetrying = retrySync.isPending && retrySync.variables?.programId === program.programId;
              const createdAt = formatDate(program.connectedAt, locale);
              const syncedAt = formatDate(program.lastSyncedAt, locale);
              const actionFeedback = feedback[program.programId];
              const categories = categoryDrafts[program.programId] ?? program.exportCategories;
              const categoriesDirty = Boolean(categoryDrafts[program.programId]);
              const isSavingCategories = updateCategories.isPending && updateCategories.variables?.programId === program.programId;

              return (
                <article className="gs-program-card" key={program.programId} data-testid={`card-google-sheets-program-${program.programId}`}>
                  <div className="gs-program-card-top">
                    <div className="gs-program-identity">
                      <span className="gs-program-icon"><FileSpreadsheet size={18} aria-hidden="true" /></span>
                      <div className="gs-program-name-wrap">
                        <Typography as="h3" variant="heading" className="gs-program-name" data-testid={`text-google-sheets-program-name-${program.programId}`}>{program.programName}</Typography>
                        <span className={`gs-status gs-status-${status}`} data-testid={`status-google-sheets-program-${program.programId}`} aria-label={copy(`Connection status: ${statusEnglish}`, `حالة الاتصال: ${statusArabic}`)}>
                          <i aria-hidden="true" />{copy(statusEnglish, statusArabic)}
                        </span>
                      </div>
                    </div>
                    <div className="gs-card-action">
                      {status === 'not_connected' && (
                        <Button onClick={() => connect(program.programId)} disabled={createConnection.isPending || retrySync.isPending} data-testid={`button-connect-google-sheets-${program.programId}`}>
                          {isCreating ? copy('Creating workbook…', 'جارٍ إنشاء جدول البيانات…') : copy('Connect Google Sheets', 'ربط جداول بيانات Google')}
                        </Button>
                      )}
                      {status !== 'not_connected' && (
                        <Button variant="text" onClick={() => connect(program.programId)} disabled={createConnection.isPending || retrySync.isPending} data-testid={`button-sync-all-google-sheets-${program.programId}`}>
                          <RotateCw size={14} aria-hidden="true" />{isCreating ? copy('Queueing refresh…', 'جارٍ جدولة التحديث…') : copy('Refresh enabled data', 'تحديث البيانات المفعّلة')}
                        </Button>
                      )}
                      {status === 'needs_attention' && (
                        <Button onClick={() => retry(program.programId)} disabled={retrySync.isPending || createConnection.isPending} data-testid={`button-retry-google-sheets-sync-${program.programId}`}>
                          <RotateCw size={14} aria-hidden="true" />{isRetrying ? copy('Queuing retry…', 'جارٍ جدولة إعادة المحاولة…') : copy('Retry failed sync', 'إعادة محاولة المزامنة المتعذرة')}
                        </Button>
                      )}
                      {status === 'syncing' && <span className="gs-syncing-note" role="status" aria-live="polite" data-testid={`status-google-sheets-syncing-${program.programId}`}>{copy('Initial sync is in progress.', 'المزامنة الأولية قيد التنفيذ.')}</span>}
                      {program.spreadsheetUrl && (
                        <a className="gs-sheet-link" href={program.spreadsheetUrl} target="_blank" rel="noreferrer" data-testid={`link-google-sheets-spreadsheet-${program.programId}`}>
                          <span>{copy('Open spreadsheet', 'فتح جدول البيانات')}</span><ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>

                  <Rule className="gs-card-rule" />
                  <div className="gs-program-details">
                    <div className="gs-sheet-destination">
                      <span className="gs-detail-label">{copy('SPREADSHEET', 'جدول البيانات')}</span>
                      {program.spreadsheetTitle
                        ? <strong data-testid={`text-google-sheets-title-${program.programId}`}>{program.spreadsheetTitle}</strong>
                        : <span className="gs-detail-muted" data-testid={`text-google-sheets-unavailable-${program.programId}`}>{copy(status === 'not_connected' ? 'No workbook created yet' : 'Spreadsheet link not available', status === 'not_connected' ? 'لم يتم إنشاء جدول بيانات بعد' : 'رابط جدول البيانات غير متاح')}</span>}
                      {createdAt && <span className="gs-detail-meta">{copy('Connected', 'تم الاتصال')} · {createdAt}</span>}
                    </div>
                    <div className="gs-sync-metrics">
                      <div><span className="gs-detail-label">{copy('PENDING', 'قيد الانتظار')}</span><strong data-testid={`text-google-sheets-pending-${program.programId}`}>{program.pendingCount}</strong></div>
                      <div><span className="gs-detail-label">{copy('FAILED', 'متعذرة')}</span><strong className={program.failedCount > 0 ? 'gs-failed-count' : ''} data-testid={`text-google-sheets-failed-${program.programId}`}>{program.failedCount}</strong></div>
                      <div className="gs-last-sync"><span className="gs-detail-label">{copy('LAST SYNC', 'آخر مزامنة')}</span><strong data-testid={`text-google-sheets-last-synced-${program.programId}`}>{syncedAt ?? copy('Not synced yet', 'لم تتم المزامنة بعد')}</strong></div>
                    </div>
                  </div>

                  <fieldset className="gs-categories" data-testid={`fieldset-google-sheets-categories-${program.programId}`}>
                    <legend>{copy('Data included in this workbook', 'البيانات المُدرجة في جدول البيانات')}</legend>
                    <div className="gs-category-options">
                      {([
                        ['businessTeam', 'Business and team records', 'سجلات الأعمال والفِرق'],
                        ['operations', 'Program operations', 'عمليات البرنامج'],
                        ['mentoringGrants', 'Mentoring and grants', 'الإرشاد والمنح'],
                        ['chats', 'Chats, including private conversations', 'المحادثات، بما فيها الخاصة'],
                      ] as const).map(([key, english, arabic]) => (
                        <label className="gs-category-option" key={key}>
                          <input
                            type="checkbox"
                            checked={categories[key]}
                            disabled={status === 'not_connected' || isSavingCategories}
                            onChange={event => changeCategory(program.programId, categories, key, event.currentTarget.checked)}
                            data-testid={`checkbox-google-sheets-category-${key}-${program.programId}`}
                          />
                          <span>{copy(english, arabic)}</span>
                        </label>
                      ))}
                    </div>
                    {categories.chats && <p className="gs-category-warning" data-testid={`warning-google-sheets-private-chat-${program.programId}`}>
                      {copy('Private conversations are included. Workbook readers can read these messages under the existing Google sharing settings.', 'تُضمّن المحادثات الخاصة. يمكن لقراء جدول البيانات الاطلاع على هذه الرسائل وفق إعدادات المشاركة الحالية في Google.')}
                    </p>}
                    {status === 'not_connected'
                      ? <p className="gs-category-hint">{copy('Connect a workbook before changing its export categories.', 'اربط جدول بيانات قبل تغيير فئات التصدير.')}</p>
                      : <Button
                        variant="text"
                        onClick={() => saveCategories(program.programId, categories)}
                        disabled={!categoriesDirty || isSavingCategories}
                        data-testid={`button-save-google-sheets-categories-${program.programId}`}
                      >
                        {isSavingCategories ? copy('Saving choices…', 'جارٍ حفظ الخيارات…') : copy('Save export choices', 'حفظ خيارات التصدير')}
                      </Button>}
                  </fieldset>

                  {program.status === 'needs_attention' && (
                    <div className="gs-program-error" role="alert" data-testid={`error-google-sheets-program-${program.programId}`}>
                      <AlertTriangle size={15} aria-hidden="true" />
                      <div><strong>{copy('Synchronization needs attention.', 'تحتاج المزامنة إلى المتابعة.')}</strong>{program.lastError && <p>{program.lastError}</p>}
                        {program.failedCount > 0 && <span>{copy(`${program.failedCount} failed item(s) are available for a retry.`, `عدد العناصر التي تعذرت مزامنتها: ${program.failedCount}. يمكن إعادة المحاولة.`)}</span>}
                      </div>
                    </div>
                  )}
                  {actionFeedback && <div className={`gs-action-feedback gs-action-${actionFeedback.kind}`} role={actionFeedback.kind === 'error' ? 'alert' : 'status'} aria-live={actionFeedback.kind === 'error' ? 'assertive' : 'polite'} data-testid={`status-google-sheets-action-${program.programId}`}>{actionFeedback.kind === 'error' ? <AlertTriangle size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{actionFeedback.message}</div>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </PaperSurface>
  );
}
