import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMentorBookingStatusQueryKey,
  getGetProgramGoogleSheetsStatusesQueryKey,
  getGetZoomStatusQueryKey,
  useDisconnectProgramGoogleSheets,
  useDisconnectStaffGoogleCalendar,
  useDisconnectZoom,
  useGetMentorBookingStatus,
  useGetProgramGoogleSheetsStatuses,
  useGetZoomStatus,
} from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Dialog } from '@workspace/program-editorial/components/ui/dialog';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { Rule } from '@workspace/program-editorial/components/ui/rule';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { CalendarDays, CheckCircle2, ExternalLink, FileSpreadsheet, RotateCw, Unplug, Video } from 'lucide-react';
import { useAppLanguage } from './language';
import './integration-settings.css';

type DisconnectTarget =
  | { kind: 'calendar'; id: number; label: string }
  | { kind: 'sheets'; id: number; label: string }
  | { kind: 'zoom'; id: 0; label: string };

type Feedback = { tone: 'success' | 'error'; message: string };

export function IntegrationSettings() {
  const { language } = useAppLanguage();
  const ar = language === 'ar';
  const copy = (english: string, arabic: string) => ar ? arabic : english;
  const queryClient = useQueryClient();
  const calendarKey = getGetMentorBookingStatusQueryKey();
  const sheetsKey = getGetProgramGoogleSheetsStatusesQueryKey();
  const zoomKey = getGetZoomStatusQueryKey();
  const calendars = useGetMentorBookingStatus({
    query: { queryKey: calendarKey, refetchOnWindowFocus: true, refetchInterval: 60_000 },
  });
  const sheets = useGetProgramGoogleSheetsStatuses({ query: { queryKey: sheetsKey, refetchOnWindowFocus: true } });
  const zoom = useGetZoomStatus({ query: { queryKey: zoomKey, refetchOnWindowFocus: true } });
  const disconnectCalendar = useDisconnectStaffGoogleCalendar();
  const disconnectSheets = useDisconnectProgramGoogleSheets();
  const disconnectZoom = useDisconnectZoom();
  const [target, setTarget] = useState<DisconnectTarget | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [actionError, setActionError] = useState('');
  const busy = disconnectCalendar.isPending || disconnectSheets.isPending || disconnectZoom.isPending;
  const locale = ar ? 'ar-JO' : 'en-GB';

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: calendarKey }),
      queryClient.invalidateQueries({ queryKey: sheetsKey }),
      queryClient.invalidateQueries({ queryKey: zoomKey }),
    ]);
  };

  const confirmDisconnect = () => {
    if (!target) return;
    setActionError('');
    setFeedback(null);
    const onSuccess = (message: string) => {
      setTarget(null);
      setFeedback({ tone: 'success', message });
      void refresh();
    };
    const onError = () => setActionError(copy(
      'The integration could not be disconnected. Its current connection is unchanged.',
      'تعذّر قطع الاتصال. لم يتغير الاتصال الحالي.',
    ));

    if (target.kind === 'calendar') {
      disconnectCalendar.mutate({ id: target.id }, {
        onSuccess: () => onSuccess(copy('Google Calendar was disconnected. Existing meeting reports are kept.', 'تم قطع اتصال تقويم Google. ستبقى تقارير الاجتماعات السابقة محفوظة.')),
        onError,
      });
    } else if (target.kind === 'sheets') {
      disconnectSheets.mutate({ programId: target.id }, {
        onSuccess: () => onSuccess(copy('The workbook was unlinked. The Google file and platform records were kept.', 'تم إلغاء ربط جدول البيانات. بقي ملف Google وسجلات المنصة كما هي.')),
        onError,
      });
    } else {
      disconnectZoom.mutate({ data: {} }, {
        onSuccess: () => onSuccess(copy('Zoom was disconnected. Existing meeting links and recordings remain.', 'تم قطع اتصال Zoom. ستبقى روابط الاجتماعات والتسجيلات الحالية.')),
        onError,
      });
    }
  };

  const errorState = (name: string, retry: () => void) => (
    <div className="integration-settings-state" role="alert">
      <Typography>{copy(`${name} status could not be loaded.`, `تعذّر تحميل حالة ${name}.`)}</Typography>
      <Button variant="pill" onClick={retry}><RotateCw size={15} aria-hidden="true" />{copy('Retry', 'إعادة المحاولة')}</Button>
    </div>
  );

  const disconnectDescription = target?.kind === 'calendar'
    ? copy(
      'This removes the mentor’s saved Google authorization and appointment-schedule link. Past meeting records and reports remain.',
      'سيؤدي ذلك إلى إزالة تفويض Google المحفوظ ورابط جدول المواعيد للمرشد. ستبقى سجلات الاجتماعات والتقارير السابقة.',
    )
    : target?.kind === 'sheets'
      ? copy(
        'This stops future synchronization to the program workbook. It does not delete the Google file or platform records. Pending items stay queued until a workbook is connected again.',
        'سيوقف ذلك المزامنة المستقبلية إلى جدول بيانات البرنامج. لن يحذف ملف Google أو سجلات المنصة. تبقى العناصر المعلقة في قائمة الانتظار حتى ربط جدول بيانات مجدداً.',
      )
      : copy(
        'This removes the shared Zoom authorization. Existing meeting links and recordings remain, but creating or updating Zoom meetings will stop until it is connected again.',
        'سيؤدي ذلك إلى إزالة تفويض Zoom المشترك. ستبقى روابط الاجتماعات والتسجيلات الحالية، لكن سيتوقف إنشاء اجتماعات Zoom أو تحديثها حتى إعادة الاتصال.',
      );

  return (
    <PaperSurface variant="panel" className="integration-settings" dir={ar ? 'rtl' : 'ltr'} data-testid="section-integration-settings">
      <header className="integration-settings-header">
        <div>
          <Typography as="p" variant="label" tone="accent">{copy('ADMIN SETTINGS / CONNECTIONS', 'إعدادات المسؤول / الاتصالات')}</Typography>
          <Typography as="h2" variant="heading">{copy('Connected integrations', 'التكاملات المتصلة')}</Typography>
          <Typography>{copy('Review active connections and disconnect an account when access should end. Only administrators can make these changes.', 'راجع الاتصالات النشطة وافصل الحساب عند انتهاء الحاجة إليه. يمكن للمسؤولين فقط إجراء هذه التغييرات.')}</Typography>
        </div>
        <span className="integration-settings-lock"><Unplug size={18} aria-hidden="true" /></span>
      </header>
      <Rule className="integration-settings-rule" />

      {feedback && <Typography className={`integration-settings-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.message}</Typography>}

      <section className="integration-settings-provider" aria-labelledby="integration-calendar-title">
        <div className="integration-settings-provider-heading">
          <span className="integration-settings-icon"><CalendarDays size={18} aria-hidden="true" /></span>
          <div>
            <Typography as="h3" variant="heading" id="integration-calendar-title">{copy('Google Calendar', 'تقويم Google')}</Typography>
            <Typography>{copy('Mentor-owned accounts. Disconnecting one does not affect other mentors.', 'حسابات يملكها المرشدون. قطع اتصال حساب لا يؤثر في المرشدين الآخرين.')}</Typography>
          </div>
        </div>
        {calendars.isLoading && <Typography className="integration-settings-muted" role="status">{copy('Loading mentor connections…', 'جارٍ تحميل اتصالات المرشدين…')}</Typography>}
        {calendars.isError && errorState('Google Calendar', () => void calendars.refetch())}
        {!calendars.isLoading && !calendars.isError && calendars.data?.filter(mentor => mentor.googleCalendarConnected).length === 0 && (
          <Typography className="integration-settings-muted" data-testid="empty-google-calendar-connections">{copy('No mentor Google Calendar accounts are connected.', 'لا توجد حسابات تقويم Google متصلة للمرشدين.')}</Typography>
        )}
        {!calendars.isLoading && !calendars.isError && calendars.data?.filter(mentor => mentor.googleCalendarConnected).map(mentor => (
          <article className="integration-settings-row" key={mentor.staffId} data-testid={`integration-google-calendar-${mentor.staffId}`}>
            <div className="integration-settings-details">
              <strong>{mentor.email}</strong>
              <span><CheckCircle2 size={14} aria-hidden="true" />{copy('Connected', 'متصل')}</span>
              <div
                className={`integration-settings-calendar-sync${mentor.googleCalendarSyncNeedsReauthorization || mentor.googleCalendarSyncConsecutiveFailures >= 3 || mentor.googleCalendarSyncSkipCount >= 3 ? ' is-warning' : ''}`}
                role="status"
                data-testid={`google-calendar-sync-status-${mentor.staffId}`}
              >
                <strong>
                  {mentor.googleCalendarSyncNeedsReauthorization
                    ? copy('Reconnect required', 'يلزم إعادة الاتصال')
                    : mentor.googleCalendarSyncConsecutiveFailures >= 3
                      ? copy('Repeated sync failures', 'إخفاقات متكررة في المزامنة')
                      : mentor.googleCalendarSyncConsecutiveFailures > 0
                        ? copy('Sync retrying', 'إعادة محاولة المزامنة')
                        : mentor.googleCalendarSyncSkipCount >= 3
                          ? copy('Repeated sync skips', 'تخطي المزامنة بشكل متكرر')
                          : mentor.googleCalendarSyncLastSuccessAt
                            ? copy('Calendar sync is current', 'مزامنة التقويم حديثة')
                            : copy('First sync is pending', 'المزامنة الأولى معلقة')}
                </strong>
                <span>
                  {mentor.googleCalendarSyncNeedsReauthorization
                    ? copy(
                      'Ask the mentor to reconnect Google Calendar. Meeting history may be out of date.',
                      'اطلب من المرشد إعادة ربط تقويم Google. قد يكون سجل الاجتماعات قديماً.',
                    )
                    : mentor.googleCalendarSyncConsecutiveFailures > 0
                      ? copy(
                        `The last ${mentor.googleCalendarSyncConsecutiveFailures} sync attempt${mentor.googleCalendarSyncConsecutiveFailures === 1 ? '' : 's'} failed. Retries will continue.`,
                        `فشلت آخر ${mentor.googleCalendarSyncConsecutiveFailures} محاولة مزامنة. ستستمر إعادة المحاولة.`,
                      )
                      : mentor.googleCalendarSyncSkipCount >= 3
                        ? copy(
                          `Sync for ${mentor.email} was skipped ${mentor.googleCalendarSyncSkipCount} times because another sync held the lock. Google Calendar did not fail; booking data may be out of date.`,
                          `تم تخطي مزامنة ${mentor.email} ${mentor.googleCalendarSyncSkipCount} مرات لأن مزامنة أخرى كانت تستخدم القفل. لم يحدث إخفاق في تقويم Google، وقد تكون بيانات الحجوزات قديمة.`,
                        )
                        : mentor.googleCalendarSyncLastSuccessAt
                          ? copy(
                            `Last successful sync: ${new Date(mentor.googleCalendarSyncLastSuccessAt).toLocaleString(locale)}`,
                            `آخر مزامنة ناجحة: ${new Date(mentor.googleCalendarSyncLastSuccessAt).toLocaleString(locale)}`,
                          )
                          : copy('No successful sync has completed yet.', 'لم تكتمل أي مزامنة ناجحة بعد.')}
                </span>
                {mentor.googleCalendarSyncSkipCount >= 3 && mentor.googleCalendarSyncLastSkippedAt && (
                  <small>
                    {copy('Latest skipped attempt', 'أحدث محاولة تم تخطيها')}: {new Date(mentor.googleCalendarSyncLastSkippedAt).toLocaleString(locale)}
                  </small>
                )}
                {mentor.googleCalendarSyncLastFailureAt && mentor.googleCalendarSyncConsecutiveFailures > 0 && (
                  <small>
                    {copy('Latest failed attempt', 'أحدث محاولة فاشلة')}: {new Date(mentor.googleCalendarSyncLastFailureAt).toLocaleString(locale)}
                  </small>
                )}
                {mentor.googleCalendarSyncLastSuccessAt && mentor.googleCalendarSyncConsecutiveFailures > 0 && (
                  <small>
                    {copy('Last successful sync', 'آخر مزامنة ناجحة')}: {new Date(mentor.googleCalendarSyncLastSuccessAt).toLocaleString(locale)}
                  </small>
                )}
                {mentor.googleCalendarSyncLastSuccessAt && mentor.googleCalendarSyncConsecutiveFailures === 0 && (
                  <small>
                    {copy('Last successful sync', 'آخر مزامنة ناجحة')}: {new Date(mentor.googleCalendarSyncLastSuccessAt).toLocaleString(locale)}
                  </small>
                )}
                {mentor.programs?.length ? (
                  <small>
                    {copy('Programs', 'البرامج')}: {mentor.programs.map(program => program.programName).join(', ')}
                  </small>
                ) : null}
              </div>
            </div>
            <Button variant="pill" className="integration-settings-disconnect" onClick={() => { setActionError(''); setTarget({ kind: 'calendar', id: mentor.staffId, label: mentor.email }); }} disabled={busy} data-testid={`button-disconnect-google-calendar-${mentor.staffId}`}>{copy('Disconnect', 'قطع الاتصال')}</Button>
          </article>
        ))}
      </section>

      <Rule className="integration-settings-rule" />
      <section className="integration-settings-provider" aria-labelledby="integration-sheets-title">
        <div className="integration-settings-provider-heading">
          <span className="integration-settings-icon"><FileSpreadsheet size={18} aria-hidden="true" /></span>
          <div>
            <Typography as="h3" variant="heading" id="integration-sheets-title">{copy('Google Sheets', 'جداول بيانات Google')}</Typography>
            <Typography>{copy('One workbook per program. Disconnecting unlinks the workbook but leaves the external file intact.', 'جدول بيانات واحد لكل برنامج. يؤدي قطع الاتصال إلى إلغاء الربط مع بقاء الملف الخارجي دون تغيير.')}</Typography>
          </div>
        </div>
        {sheets.isLoading && <Typography className="integration-settings-muted" role="status">{copy('Loading program workbooks…', 'جارٍ تحميل جداول بيانات البرامج…')}</Typography>}
        {sheets.isError && errorState('Google Sheets', () => void sheets.refetch())}
        {!sheets.isLoading && !sheets.isError && sheets.data?.filter(program => program.spreadsheetId).length === 0 && (
          <Typography className="integration-settings-muted" data-testid="empty-google-sheets-connections">{copy('No program workbooks are connected.', 'لا توجد جداول بيانات برامج متصلة.')}</Typography>
        )}
        {!sheets.isLoading && !sheets.isError && sheets.data?.filter(program => program.spreadsheetId).map(program => (
          <article className="integration-settings-row" key={program.programId} data-testid={`integration-google-sheets-${program.programId}`}>
            <div className="integration-settings-details">
              <strong>{program.programName}</strong>
              <span><CheckCircle2 size={14} aria-hidden="true" />{program.spreadsheetTitle || copy('Connected', 'متصل')}</span>
            </div>
            <div className="integration-settings-actions">
              {program.spreadsheetUrl && <a href={program.spreadsheetUrl} target="_blank" rel="noreferrer" className="integration-settings-link">{copy('Open workbook', 'فتح جدول البيانات')}<ExternalLink size={14} aria-hidden="true" /></a>}
              <Button variant="pill" className="integration-settings-disconnect" onClick={() => { setActionError(''); setTarget({ kind: 'sheets', id: program.programId, label: program.programName }); }} disabled={busy} data-testid={`button-disconnect-google-sheets-${program.programId}`}>{copy('Disconnect', 'قطع الاتصال')}</Button>
            </div>
          </article>
        ))}
      </section>

      <Rule className="integration-settings-rule" />
      <section className="integration-settings-provider" aria-labelledby="integration-zoom-title">
        <div className="integration-settings-provider-heading">
          <span className="integration-settings-icon"><Video size={18} aria-hidden="true" /></span>
          <div>
            <Typography as="h3" variant="heading" id="integration-zoom-title">{copy('Zoom', 'Zoom')}</Typography>
            <Typography>{copy('Shared account used for creating and updating session meetings.', 'حساب مشترك لإنشاء اجتماعات الجلسات وتحديثها.')}</Typography>
          </div>
        </div>
        {zoom.isLoading && <Typography className="integration-settings-muted" role="status">{copy('Loading Zoom connection…', 'جارٍ تحميل اتصال Zoom…')}</Typography>}
        {zoom.isError && errorState('Zoom', () => void zoom.refetch())}
        {!zoom.isLoading && !zoom.isError && !zoom.data?.connected && (
          <Typography className="integration-settings-muted" data-testid="empty-zoom-connection">{copy('Zoom is not connected.', 'Zoom غير متصل.')}</Typography>
        )}
        {!zoom.isLoading && !zoom.isError && zoom.data?.connected && (
          <article className="integration-settings-row" data-testid="integration-zoom">
            <div className="integration-settings-details">
              <strong>{copy('Shared Zoom account', 'حساب Zoom مشترك')}</strong>
              <span><CheckCircle2 size={14} aria-hidden="true" />{zoom.data.connectedBy ? copy(`Connected by ${zoom.data.connectedBy}`, `تم الربط بواسطة ${zoom.data.connectedBy}`) : copy('Connected', 'متصل')}</span>
            </div>
            <Button variant="pill" className="integration-settings-disconnect" onClick={() => { setActionError(''); setTarget({ kind: 'zoom', id: 0, label: 'Zoom' }); }} disabled={busy} data-testid="button-disconnect-zoom">{copy('Disconnect', 'قطع الاتصال')}</Button>
          </article>
        )}
      </section>

      <Dialog
        open={Boolean(target)}
        onOpenChange={open => { if (!open && !busy) { setTarget(null); setActionError(''); } }}
        eyebrow={copy('ADMIN ACTION / DISCONNECT', 'إجراء المسؤول / قطع الاتصال')}
        title={copy(`Disconnect ${target?.label ?? 'integration'}?`, `هل تريد قطع اتصال ${target?.label ?? 'التكامل'}؟`)}
        description={disconnectDescription}
      >
        {actionError && <Typography className="integration-settings-feedback is-error" role="alert">{actionError}</Typography>}
        <div className="integration-settings-dialog-actions">
          <Button variant="pill" onClick={() => { setTarget(null); setActionError(''); }} disabled={busy}>{copy('Keep connected', 'الإبقاء على الاتصال')}</Button>
          <Button variant="pill" className="integration-settings-disconnect" onClick={confirmDisconnect} disabled={busy} data-testid="button-confirm-integration-disconnect">
            {busy ? copy('Disconnecting…', 'جارٍ قطع الاتصال…') : copy('Confirm disconnect', 'تأكيد قطع الاتصال')}
          </Button>
        </div>
      </Dialog>
    </PaperSurface>
  );
}
