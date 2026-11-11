import { useEffect, useMemo, useState } from 'react';
import type {
  GoogleSheetsWorkbook,
  ProgramGoogleSheetsSheetMappings,
} from '@workspace/api-client-react';
import {
  getListProgramGoogleSheetsWorkbookTabsQueryKey,
  getListProgramGoogleSheetsWorkbooksQueryKey,
  useListProgramGoogleSheetsWorkbookTabs,
  useListProgramGoogleSheetsWorkbooks,
} from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Dialog } from '@workspace/program-editorial/components/ui/dialog';
import { AlertTriangle, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { t, useAppLanguage } from './language';

type ProgramDestination = {
  programId: number;
  programName: string;
  spreadsheetId: string | null;
  spreadsheetTitle: string | null;
  sheetMappings: ProgramGoogleSheetsSheetMappings;
  chatsEnabled: boolean;
};

type SaveInput = {
  mode: 'create' | 'existing';
  spreadsheetId?: string;
  sheetMappings: ProgramGoogleSheetsSheetMappings;
  confirmedOverwrite: boolean;
};

type Props = {
  program: ProgramDestination;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: SaveInput) => Promise<void>;
  onSaved: () => void;
};

const defaultMappings: ProgramGoogleSheetsSheetMappings = {
  applications: 'Applications',
  judgingResponses: 'Judging responses',
  businessTeam: 'Businesses and teams',
  operations: 'Programs sessions attendance',
  mentoringGrants: 'Mentor support grants',
  chats: 'Staff and participant chats',
};

const mappingFields: {
  key: keyof ProgramGoogleSheetsSheetMappings;
  english: string;
  arabic: string;
}[] = [
  { key: 'applications', english: 'Applications', arabic: 'الطلبات' },
  { key: 'judgingResponses', english: 'Judging responses', arabic: 'تقييمات الحكام' },
  { key: 'businessTeam', english: 'Businesses and teams', arabic: 'الأعمال والفِرق' },
  { key: 'operations', english: 'Program operations', arabic: 'عمليات البرنامج' },
  { key: 'mentoringGrants', english: 'Mentoring and grants', arabic: 'الإرشاد والمنح' },
  { key: 'chats', english: 'Chats', arabic: 'المحادثات' },
];

const validMappingNames = (mappings: ProgramGoogleSheetsSheetMappings) => {
  const values = mappingFields.map(({ key }) => mappings[key]);
  return values.every(value => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 100 && !/[\[\]:*?\/\\\u0000-\u001f]/u.test(trimmed);
  }) && new Set(values.map(value => value.trim().toLocaleLowerCase())).size === values.length;
};

function newTabTitle(
  key: keyof ProgramGoogleSheetsSheetMappings,
  tabTitles: string[],
  mappings: ProgramGoogleSheetsSheetMappings,
): string {
  const used = new Set(
    mappingFields.filter(field => field.key !== key)
      .map(field => mappings[field.key].trim().toLocaleLowerCase()),
  );
  const existing = new Set(tabTitles.map(title => title.toLocaleLowerCase()));
  const base = defaultMappings[key];
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase()) || existing.has(candidate.toLocaleLowerCase())) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function suggestedMappings(
  tabTitles: string[],
  current: ProgramGoogleSheetsSheetMappings,
): ProgramGoogleSheetsSheetMappings {
  const used = new Set<string>();
  const result = { ...current };
  for (const { key } of mappingFields) {
    const currentTitle = current[key].trim();
    const availableCurrent = tabTitles.find(title => title === currentTitle && !used.has(title.toLocaleLowerCase()));
    const availableOther = tabTitles.find(title => !used.has(title.toLocaleLowerCase()));
    const title = availableCurrent ?? availableOther ?? newTabTitle(key, tabTitles, result);
    result[key] = title;
    used.add(title.toLocaleLowerCase());
  }
  return result;
}

export function GoogleSheetsSetupDialog({ program, open, saving, onOpenChange, onSave, onSaved }: Props) {
  const { language } = useAppLanguage();
  const ar = language === 'ar';
  const copy = (english: string, arabic: string) => ar ? arabic : t(english);
  const [mode, setMode] = useState<'create' | 'existing'>(program.spreadsheetId ? 'existing' : 'create');
  const [search, setSearch] = useState('');
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [workbookItems, setWorkbookItems] = useState<GoogleSheetsWorkbook[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState(program.spreadsheetId ?? '');
  const [mappings, setMappings] = useState<ProgramGoogleSheetsSheetMappings>(program.sheetMappings ?? defaultMappings);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workbooksQuery = useListProgramGoogleSheetsWorkbooks(program.programId, {
    q: search.trim() || undefined,
    pageToken,
  }, {
    query: {
      queryKey: getListProgramGoogleSheetsWorkbooksQueryKey(program.programId, {
        q: search.trim() || undefined,
        pageToken,
      }),
      enabled: open && mode === 'existing',
    },
  });
  const tabsQuery = useListProgramGoogleSheetsWorkbookTabs(program.programId, spreadsheetId, {
    query: {
      queryKey: getListProgramGoogleSheetsWorkbookTabsQueryKey(program.programId, spreadsheetId),
      enabled: open && mode === 'existing' && Boolean(spreadsheetId),
    },
  });

  const workbooks = useMemo(() => {
    const items = workbookItems;
    if (program.spreadsheetId && !items.some(item => item.spreadsheetId === program.spreadsheetId)
      && program.spreadsheetTitle) {
      const current: GoogleSheetsWorkbook = {
        spreadsheetId: program.spreadsheetId,
        title: program.spreadsheetTitle,
        url: `https://docs.google.com/spreadsheets/d/${program.spreadsheetId}/edit`,
        modifiedAt: null,
      };
      return [current, ...items];
    }
    return items;
  }, [program.spreadsheetId, program.spreadsheetTitle, workbookItems]);

  const tabTitles = useMemo(() => (tabsQuery.data ?? []).map(tab => tab.title), [tabsQuery.data]);

  useEffect(() => {
    if (!open || !tabsQuery.data) return;
    setMappings(current => suggestedMappings(tabTitles, current));
    setConfirmedOverwrite(false);
  }, [open, spreadsheetId, tabsQuery.data, tabTitles]);

  useEffect(() => {
    const items = workbooksQuery.data?.items;
    if (!items) return;
    setWorkbookItems(current => {
      const combined = pageToken ? [...current, ...items] : items;
      return [...new Map(combined.map(item => [item.spreadsheetId, item])).values()];
    });
  }, [pageToken, workbooksQuery.data?.items]);

  const changeMapping = (key: keyof ProgramGoogleSheetsSheetMappings, value: string) => {
    setMappings(current => ({ ...current, [key]: value }));
    setConfirmedOverwrite(false);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!validMappingNames(mappings)) {
      setError(copy('Use six different tab names, each up to 100 characters.', 'استخدم ستة أسماء مختلفة للتبويبات، بحد أقصى 100 حرف لكل اسم.'));
      return;
    }
    if (mode === 'existing' && (!spreadsheetId || !tabsQuery.data || !confirmedOverwrite)) {
      setError(copy('Select an accessible spreadsheet and confirm replacing values in the selected tabs.', 'اختر جدول بيانات متاحاً وأكّد استبدال القيم في التبويبات المحددة.'));
      return;
    }
    try {
      await onSave({
        mode,
        ...(mode === 'existing' ? { spreadsheetId } : {}),
        sheetMappings: Object.fromEntries(
          Object.entries(mappings).map(([key, value]) => [key, value.trim()]),
        ) as ProgramGoogleSheetsSheetMappings,
        confirmedOverwrite,
      });
      onSaved();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message
        ? submitError.message
        : copy('The spreadsheet destination could not be saved. No platform data was changed.', 'تعذر حفظ وجهة جدول البيانات. لم تتغير بيانات المنصة.'));
    }
  };

  const selectedWorkbook = workbooks.find(workbook => workbook.spreadsheetId === spreadsheetId);
  const canSubmit = !saving
    && validMappingNames(mappings)
    && (mode === 'create' || (Boolean(spreadsheetId) && Boolean(tabsQuery.data) && confirmedOverwrite));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={copy('PROGRAM DESTINATION', 'وجهة البرنامج')}
      title={copy(`Set up ${program.programName}`, `إعداد ${program.programName}`)}
      description={copy('Choose where this program sends data and assign each category to a worksheet tab.', 'اختر وجهة بيانات البرنامج وحدد تبويباً لكل فئة.')}
    >
      <form className="gs-setup-form" onSubmit={handleSubmit} dir={ar ? 'rtl' : 'ltr'}>
        <fieldset className="gs-setup-mode">
          <legend>{copy('Workbook', 'جدول البيانات')}</legend>
          <label className={`gs-setup-mode-option ${mode === 'create' ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name={`gs-workbook-mode-${program.programId}`}
              value="create"
              checked={mode === 'create'}
              onChange={() => {
                setMode('create');
                setConfirmedOverwrite(false);
                setError(null);
              }}
            />
            <FileSpreadsheet size={16} aria-hidden="true" />
            <span>{copy('Create a new workbook', 'إنشاء جدول بيانات جديد')}</span>
          </label>
          <label className={`gs-setup-mode-option ${mode === 'existing' ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name={`gs-workbook-mode-${program.programId}`}
              value="existing"
              checked={mode === 'existing'}
              onChange={() => {
                setMode('existing');
                setConfirmedOverwrite(false);
                setError(null);
              }}
            />
            <FileSpreadsheet size={16} aria-hidden="true" />
            <span>{copy('Use an existing spreadsheet', 'استخدام جدول بيانات موجود')}</span>
          </label>
        </fieldset>

        {mode === 'existing' && (
          <div className="gs-setup-workbook">
            <label className="gs-setup-label" htmlFor={`gs-workbook-search-${program.programId}`}>{copy('Find a spreadsheet', 'البحث عن جدول بيانات')}</label>
            <input
              id={`gs-workbook-search-${program.programId}`}
              className="gs-setup-input"
              type="search"
              value={search}
              onChange={event => {
                setSearch(event.currentTarget.value);
                setPageToken(undefined);
                setWorkbookItems([]);
              }}
              placeholder={copy('Search by spreadsheet name', 'ابحث باسم جدول البيانات')}
            />
            {workbooksQuery.isLoading
              ? <p className="gs-setup-status"><LoaderCircle size={14} className="gs-setup-spinner" aria-hidden="true" />{copy('Loading spreadsheets…', 'جارٍ تحميل جداول البيانات…')}</p>
              : workbooksQuery.isError
                ? <div className="gs-setup-error" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{copy('Google Drive could not list spreadsheets. Check the connected Google account and retry.', 'تعذر تحميل جداول البيانات من Google Drive. تحقق من حساب Google المتصل ثم أعد المحاولة.')}</span>
                  <Button type="button" variant="text" onClick={() => void workbooksQuery.refetch()}>{copy('Retry', 'إعادة المحاولة')}</Button>
                </div>
                : (
                  <select
                    className="gs-setup-input"
                    value={spreadsheetId}
                    onChange={event => {
                      setSpreadsheetId(event.currentTarget.value);
                      setConfirmedOverwrite(false);
                      setError(null);
                    }}
                    aria-label={copy('Select spreadsheet', 'اختيار جدول البيانات')}
                  >
                    <option value="">{copy('Choose a spreadsheet', 'اختر جدول بيانات')}</option>
                    {workbooks.map(workbook => (
                      <option key={workbook.spreadsheetId} value={workbook.spreadsheetId}>{workbook.title}</option>
                    ))}
                  </select>
                )}
            {workbooksQuery.data?.nextPageToken && (
              <Button
                type="button"
                variant="text"
                disabled={workbooksQuery.isFetching}
                onClick={() => setPageToken(workbooksQuery.data?.nextPageToken ?? undefined)}
              >
                {workbooksQuery.isFetching
                  ? copy('Loading more…', 'جارٍ تحميل المزيد…')
                  : copy('Load more spreadsheets', 'تحميل المزيد من جداول البيانات')}
              </Button>
            )}
            {selectedWorkbook && <p className="gs-setup-hint">{selectedWorkbook.title}</p>}
          </div>
        )}

        <fieldset className="gs-setup-mappings">
          <legend>{copy('Worksheet tabs for each data category', 'تبويبات بيانات كل فئة')}</legend>
          {mode === 'existing' && !spreadsheetId && (
            <p className="gs-setup-hint">{copy('Choose a spreadsheet first to load its tabs.', 'اختر جدول بيانات أولاً لعرض تبويباته.')}</p>
          )}
          {mode === 'existing' && tabsQuery.isLoading && spreadsheetId && (
            <p className="gs-setup-status"><LoaderCircle size={14} className="gs-setup-spinner" aria-hidden="true" />{copy('Loading worksheet tabs…', 'جارٍ تحميل التبويبات…')}</p>
          )}
          {mode === 'existing' && tabsQuery.isError && spreadsheetId && (
            <div className="gs-setup-error" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{copy('This spreadsheet is not accessible to the connected Sheets account. Choose another file or verify the Google connection.', 'لا يستطيع حساب Sheets المتصل الوصول إلى هذا الملف. اختر ملفاً آخر أو تحقق من اتصال Google.')}</span>
              <Button type="button" variant="text" onClick={() => void tabsQuery.refetch()}>{copy('Retry', 'إعادة المحاولة')}</Button>
            </div>
          )}
          {mappingFields.map(({ key, english, arabic }) => {
            const existingTitle = tabTitles.find(title => title === mappings[key]);
            const usedByOther = new Set(
              mappingFields.filter(field => field.key !== key && tabTitles.includes(mappings[field.key]))
                .map(field => mappings[field.key]),
            );
            const showCustomName = mode === 'create' || (spreadsheetId && tabsQuery.data && !existingTitle);
            return (
              <div className="gs-setup-mapping" key={key}>
                <label className="gs-setup-label" htmlFor={`gs-tab-${program.programId}-${key}`}>{copy(english, arabic)}</label>
                {mode === 'existing' && tabsQuery.data && (
                  <select
                    id={`gs-tab-${program.programId}-${key}`}
                    className="gs-setup-input"
                    value={existingTitle ? mappings[key] : '__new__'}
                    onChange={event => {
                      if (event.currentTarget.value === '__new__') {
                        changeMapping(key, newTabTitle(key, tabTitles, mappings));
                      } else {
                        changeMapping(key, event.currentTarget.value);
                      }
                    }}
                  >
                    {tabTitles.filter(title => !usedByOther.has(title) || title === existingTitle).map(title => (
                      <option value={title} key={title}>{title}</option>
                    ))}
                    <option value="__new__">{copy('Create a new tab…', 'إنشاء تبويب جديد…')}</option>
                  </select>
                )}
                {showCustomName && (
                  <input
                    id={mode === 'create' ? `gs-tab-${program.programId}-${key}` : undefined}
                    className="gs-setup-input"
                    type="text"
                    maxLength={100}
                    value={mappings[key]}
                    onChange={event => changeMapping(key, event.currentTarget.value)}
                    aria-label={copy(`${english} tab name`, `اسم تبويب ${arabic}`)}
                  />
                )}
              </div>
            );
          })}
        </fieldset>

        {mode === 'existing' && spreadsheetId && (
          <div className="gs-setup-overwrite">
            <AlertTriangle size={16} aria-hidden="true" />
            <div>
              <strong>{copy('Selected tabs are managed by this sync.', 'ستتم إدارة التبويبات المحددة عبر هذه المزامنة.')}</strong>
              <p>{copy('Values in the data columns of these tabs will be cleared and replaced with program records. Data in the platform is not deleted.', 'سيتم مسح القيم في أعمدة البيانات بهذه التبويبات واستبدالها بسجلات البرنامج. لن تُحذف بيانات المنصة.')}</p>
              {program.chatsEnabled && <p>{copy('Chat export is enabled. Workbook readers may see private messages under the existing Google sharing settings.', 'تصدير المحادثات مفعّل. قد يتمكن قراء جدول البيانات من الاطلاع على الرسائل الخاصة وفق إعدادات مشاركة Google.')}</p>}
              <label className="gs-setup-confirm">
                <input
                  type="checkbox"
                  checked={confirmedOverwrite}
                  onChange={event => setConfirmedOverwrite(event.currentTarget.checked)}
                />
                <span>{copy('I understand and want to replace values in these tabs.', 'أفهم ذلك وأوافق على استبدال القيم في هذه التبويبات.')}</span>
              </label>
            </div>
          </div>
        )}

        {!validMappingNames(mappings) && (
          <p className="gs-setup-hint" role="status">{copy('Tab names must be unique and cannot contain / \\ ? * : [ ].', 'يجب أن تكون أسماء التبويبات فريدة ولا تحتوي على / \\ ? * : [ ].')}</p>
        )}
        {error && <div className="gs-setup-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{error}</div>}
        <div className="gs-setup-actions">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>{copy('Cancel', 'إلغاء')}</Button>
          <Button type="submit" disabled={!canSubmit} data-testid={`button-save-google-sheets-destination-${program.programId}`}>
            {saving ? copy('Saving destination…', 'جارٍ حفظ الوجهة…') : copy('Save destination and sync', 'حفظ الوجهة ومزامنة البيانات')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
