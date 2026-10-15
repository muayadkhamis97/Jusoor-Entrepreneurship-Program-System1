import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { currentLanguage, t, useAppLanguage } from "./language";
import { AccessibleDialogSurface, UnsavedChangesDialog } from "./accessible-dialog";
import { useProgramSelection } from "./program-selection";
import { CSVLink } from "react-csv";
import {
  useGetProgramAnalytics,
  useGetProgramSessionInteractionAnalytics,
  useGetSessionAttendanceRegister,
  useSaveSessionAttendance,
  useQueueZoomAttendanceSync,
  useResolveZoomAttendanceParticipant,
  useListProgramImpactKpis,
  useListPrograms,
  useCreateProgramImpactKpi,
  useUpdateProgramImpactKpi,
  useDeleteProgramImpactKpi,
  useSaveProgramImpactKpiValues,
  getGetProgramAnalyticsQueryKey,
  getGetSessionAttendanceRegisterQueryKey,
  getListProgramImpactKpisQueryKey,
} from "@workspace/api-client-react";
import type { ImpactKpi } from "@workspace/api-client-react";
import {
  Activity, BarChart3, CalendarDays, Check, ChevronDown,
  ClipboardCheck, Download, FileText, Moon, Printer, RefreshCw, Sun, Target,
  Users, X, CircleAlert, Plus, Pencil, Trash2,
} from "lucide-react";
import { downloadProgramAnalyticsCsv } from "./program-analytics-export";
import type { ProgramAnalyticsCsvRow } from "./program-analytics-export";
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import "./analytics.css";
import "./attendance-reports.css";

const INTERVALS = [
  { label: "5 minutes", ms: 5 * 60 * 1000 },
  { label: "15 minutes", ms: 15 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
];
const COLORS = { teal: "#267d70", coral: "#d4795b", gold: "#b59a5d", slate: "#65818a" };
const STAGE_LABELS: Record<string, string> = {
  application: "Applications", bootcamp: "Bootcamp", incubator: "Online incubation",
  pitch: "Pitch day", demo_day: "Demo day", grant_awarded: "Grant awarded",
  alumni: "Alumni", declined: "Declined",
};
const fmt = (value: number) => new Intl.NumberFormat(currentLanguage() === "ar" ? "ar-JO" : "en-US").format(value);
const dateLabel = (value: string) => {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(currentLanguage() === "ar" ? "ar-JO" : "en", { month: "short", day: "numeric", year: "numeric" });
};
const trendPeriodLabel = (start: string, end: string) => start === end
  ? dateLabel(start)
  : `${dateLabel(start)} – ${dateLabel(end)}`;
const signed = (value: number | null, suffix = "") => value == null
  ? "—"
  : `${value > 0 ? "+" : ""}${fmt(value)}${suffix}`;
function ExportButton({ rows, filename, label = t("Export chart data as CSV") }: { rows: Array<Record<string, unknown>>; filename: string; label?: string }) {
  return rows.length
    ? <CSVLink className="ana-icon-btn print-hide" aria-label={label} title={label} data={rows} filename={filename}><Download size={15} /></CSVLink>
    : <button className="ana-icon-btn print-hide" aria-label={label} title={t("No data to export")} disabled><Download size={15} /></button>;
}

type AttendanceState = Record<number, { status: "present" | "absent" | "excused" | null; notes: string }>;
type KpiForm = { name: string; description: string; unit: string; targetValue: string; direction: "increase_is_good" | "decrease_is_good" };

export function ProgramAnalyticsPage() {
  useAppLanguage();
  const queryClient = useQueryClient();
  const now = new Date();
  const initialFrom = new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(today);
  const [interactionPeriod, setInteractionPeriod] = useState<"weekly" | "monthly">("weekly");
  const [interactionType, setInteractionType] = useState<"all" | "poll" | "survey">("all");
  const [interactionThreshold, setInteractionThreshold] = useState(30);
  const programsQuery = useListPrograms();
  const programOptions = programsQuery.data || [];
  const [selectedProgramId, setSelectedProgramId] = useProgramSelection(programOptions);
  const programChoice = selectedProgramId?.toString() ?? "";
  const queryParams = useMemo(() => ({
    ...(programChoice ? { programId: Number(programChoice) } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }), [programChoice, from, to]);
  const interactionQueryParams = useMemo(() => ({
    ...queryParams,
    period: interactionPeriod,
    activityType: interactionType,
    responseRateThreshold: interactionThreshold,
  }), [queryParams, interactionPeriod, interactionType, interactionThreshold]);
  const analyticsQuery = useGetProgramAnalytics(queryParams);
  const interactionAnalyticsQuery = useGetProgramSessionInteractionAnalytics(interactionQueryParams);
  const data = analyticsQuery.data;
  const selectedProgram = programChoice ? Number(programChoice) : data?.selectedProgramId ?? undefined;
  const kpiQuery = useListProgramImpactKpis({ programId: selectedProgram ?? 0 }, {
    query: { enabled: !!selectedProgram, queryKey: getListProgramImpactKpisQueryKey({ programId: selectedProgram ?? 0 }) },
  });
  const [isDark, setIsDark] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalMs, setIntervalMs] = useState(INTERVALS[0].ms);
  const [refreshMenu, setRefreshMenu] = useState(false);
  const refreshRef = useRef<HTMLDivElement>(null);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [participantMatches, setParticipantMatches] = useState<Record<number, string>>({});
  const [kpiEditor, setKpiEditor] = useState<ImpactKpi | null | "new">(null);
  const [kpiDirty, setKpiDirty] = useState(false);
  const [valueEditor, setValueEditor] = useState<ImpactKpi | null>(null);
  const [valueDirty, setValueDirty] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<"attendance" | "kpi" | "value" | null>(null);
  const [deleteKpi, setDeleteKpi] = useState<ImpactKpi | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState("Program progress report");
  const [reportParts, setReportParts] = useState({ summary: true, stages: true, attendance: true, engagement: true, impact: true });
  const saveAttendance = useSaveSessionAttendance();
  const queueAttendanceSync = useQueueZoomAttendanceSync();
  const resolveAttendanceParticipant = useResolveZoomAttendanceParticipant();
  const createKpi = useCreateProgramImpactKpi();
  const updateKpi = useUpdateProgramImpactKpi();
  const removeKpi = useDeleteProgramImpactKpi();
  const saveKpiValues = useSaveProgramImpactKpiValues();
  const registerQuery = useGetSessionAttendanceRegister(activeSession ?? 0, {
    query: {
      enabled: activeSession !== null,
      queryKey: getGetSessionAttendanceRegisterQueryKey(activeSession ?? 0),
      refetchInterval: (query) => ["queued", "syncing"].includes(query.state.data?.zoomSync?.status ?? "") ? 5_000 : false,
    },
  });
  const attendanceDirty = Boolean(registerQuery.data?.roster.some((person) => {
    const draft = attendance[person.businessId];
    return draft && (draft.status !== person.status || draft.notes !== (person.notes ?? ""));
  }) || Object.values(participantMatches).some(Boolean));
  const attendancePending = saveAttendance.isPending || resolveAttendanceParticipant.isPending || queueAttendanceSync.isPending;
  const requestAttendanceClose = () => {
    if (attendancePending) return;
    if (attendanceDirty) setDiscardTarget("attendance");
    else setActiveSession(null);
  };
  const closeKpiEditor = () => { setKpiDirty(false); setKpiEditor(null); };
  const requestKpiClose = () => {
    if (createKpi.isPending || updateKpi.isPending) return;
    if (kpiDirty) setDiscardTarget("kpi");
    else closeKpiEditor();
  };
  const closeValueEditor = () => { setValueDirty(false); setValueEditor(null); };
  const requestValueClose = () => {
    if (saveKpiValues.isPending) return;
    if (valueDirty) setDiscardTarget("value");
    else closeValueEditor();
  };
  useEffect(() => { setKpiDirty(false); }, [kpiEditor]);
  useEffect(() => { setValueDirty(false); }, [valueEditor]);
  const loading = analyticsQuery.isLoading || analyticsQuery.isFetching;
  const error = analyticsQuery.isError;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    return () => document.documentElement.classList.remove("dark");
  }, [isDark]);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (refreshRef.current && !refreshRef.current.contains(event.target as Node)) setRefreshMenu(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void analyticsQuery.refetch();
      void interactionAnalyticsQuery.refetch();
      if (selectedProgram) void kpiQuery.refetch();
    }, Math.max(intervalMs, 5 * 60 * 1000));
    return () => window.clearInterval(timer);
  }, [autoRefresh, intervalMs, analyticsQuery.refetch, interactionAnalyticsQuery.refetch, kpiQuery.refetch, selectedProgram]);
  useEffect(() => {
    if (registerQuery.data) {
      const next: AttendanceState = {};
      registerQuery.data.roster.forEach((person) => { next[person.businessId] = { status: person.status, notes: person.notes ?? "" }; });
      setAttendance(next);
    }
  }, [registerQuery.data]);

  const stageRows = data?.stageCounts ?? [];
  const trendRows = data?.attendanceTrend ?? [];
  const hasAttendanceData = trendRows.some((row) => row.present !== null || row.absent !== null || row.excused !== null);
  const engagementRows = data?.engagement ?? [];
  const sessions = data?.sessions ?? [];
  const kpis = kpiQuery.data ?? [];
  const refreshedAt = analyticsQuery.dataUpdatedAt ? new Date(analyticsQuery.dataUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const chartGrid = isDark ? "rgba(255,255,255,.1)" : "#e5e0d5";
  const chartTicks = isDark ? "#b2c3c0" : "#687873";

  const invalidateKpis = () => {
    if (selectedProgram) void queryClient.invalidateQueries({ queryKey: getListProgramImpactKpisQueryKey({ programId: selectedProgram }) });
  };
  const invalidateAnalytics = () => void queryClient.invalidateQueries({ queryKey: getGetProgramAnalyticsQueryKey(queryParams) });
  function patchAttendance(businessId: number, patch: Partial<AttendanceState[number]>) {
    setAttendance((current) => ({ ...current, [businessId]: { status: current[businessId]?.status ?? null, notes: current[businessId]?.notes ?? "", ...patch } }));
  }
  function saveRegister() {
    if (activeSession === null || !registerQuery.data) return;
    saveAttendance.mutate({ sessionId: activeSession, data: { records: registerQuery.data.roster.map((person) => ({
      businessId: person.businessId, status: attendance[person.businessId]?.status ?? null,
      notes: attendance[person.businessId]?.notes.trim() || null,
    })) } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetSessionAttendanceRegisterQueryKey(activeSession) });
        invalidateAnalytics();
        setActiveSession(null);
      },
    });
  }
  function queueAttendanceRefresh() {
    if (activeSession === null) return;
    queueAttendanceSync.mutate({ sessionId: activeSession }, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetSessionAttendanceRegisterQueryKey(activeSession) }),
    });
  }
  function resolveAttendee(participantId: number, ignore: boolean) {
    if (activeSession === null) return;
    const selectedBusinessId = participantMatches[participantId];
    if (!ignore && !selectedBusinessId) return;
    resolveAttendanceParticipant.mutate({
      participantId,
      data: { businessId: ignore ? null : Number(selectedBusinessId), ignore },
    }, {
      onSuccess: () => {
        setParticipantMatches((current) => {
          const next = { ...current };
          delete next[participantId];
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: getGetSessionAttendanceRegisterQueryKey(activeSession) });
        invalidateAnalytics();
      },
    });
  }
  const refresh = () => {
    void analyticsQuery.refetch();
    void interactionAnalyticsQuery.refetch();
    if (selectedProgram) void kpiQuery.refetch();
  };
  function commitKpi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProgram) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || null,
      unit: String(form.get("unit") ?? "").trim(),
      targetValue: String(form.get("targetValue") ?? "").trim() ? Number(form.get("targetValue")) : null,
      direction: String(form.get("direction")) as KpiForm["direction"],
    };
    if (kpiEditor === "new") {
      createKpi.mutate({ data: { ...payload, programId: selectedProgram } }, { onSuccess: () => { invalidateKpis(); closeKpiEditor(); } });
    } else if (kpiEditor) {
      updateKpi.mutate({ id: kpiEditor.id, data: payload }, { onSuccess: () => { invalidateKpis(); closeKpiEditor(); } });
    }
  }
  function commitValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valueEditor) return;
    const form = new FormData(event.currentTarget);
    saveKpiValues.mutate({ id: valueEditor.id, data: { values: [{
      businessId: Number(form.get("businessId")), value: Number(form.get("value")),
      periodEnd: String(form.get("periodEnd")), notes: String(form.get("notes") ?? "").trim() || null,
    }] } }, { onSuccess: () => { invalidateKpis(); closeValueEditor(); } });
  }

  const summary = data?.summary;
  const metrics = [
    { title: "Active businesses", value: summary ? fmt(summary.activeBusinesses) : "—", hint: summary ? `${fmt(summary.businesses)} enrolled businesses` : "No program data", icon: Users, hue: "teal" },
    { title: "Attendance", value: summary?.attendanceRate == null ? "—" : `${summary.attendanceRate.toFixed(1)}%`, hint: summary?.attendanceRate == null ? "No attendance marks in range" : `${fmt(summary.present)} present of ${fmt(summary.attendanceMarks)} marks`, icon: ClipboardCheck, hue: "coral" },
    { title: "Assignment completion", value: summary?.assignmentCompletionRate == null ? "—" : `${summary.assignmentCompletionRate.toFixed(1)}%`, hint: summary?.assignmentCompletionRate == null ? "No assignment records in range" : `${fmt(summary.submissions)} of ${fmt(summary.assignments)} submissions`, icon: FileText, hue: "gold" },
    { title: "Grants awarded", value: summary ? fmt(summary.grantsAwarded) : "—", hint: summary ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(summary.grantAmount)} total` : "No program data", icon: Target, hue: "slate" },
  ];

  function exportReportSpreadsheet() {
    const rows: ProgramAnalyticsCsvRow[] = [];
    const unavailable = currentLanguage() === "ar" ? "غير متاح" : "Unavailable";
    const add = (section: string, item: string, detail: string, value: string | number | null) => {
      rows.push({ section: t(section), item: t(item), detail, value: value ?? unavailable });
    };
    if (reportParts.summary && summary) {
      [
        ["Applications", summary.applications],
        ["Accepted applications", summary.acceptedApplications],
        ["Active businesses", summary.activeBusinesses],
        ["Enrolled businesses", summary.businesses],
        ["Attendance rate (%)", summary.attendanceRate],
        ["Present marks", summary.present],
        ["Total attendance marks", summary.attendanceMarks],
        ["Assignment completion rate (%)", summary.assignmentCompletionRate],
        ["Assignments submitted", summary.submissions],
        ["Assignments available", summary.assignments],
        ["Sessions in range", summary.sessionsInRange],
        ["Completed support", summary.completedSupport],
        ["Unanswered questions", summary.unansweredQuestions],
        ["Grants awarded", summary.grantsAwarded],
        ["Grant amount (USD)", summary.grantAmount],
      ].forEach(([item, value]) => add("Program summary", String(item), "", value as number | null));
    }
    if (reportParts.stages) {
      stageRows.forEach((row) => add("Founder stage distribution", STAGE_LABELS[row.stage] ?? row.stage, "", row.count));
    }
    if (reportParts.attendance) {
      trendRows.forEach((row) => {
        const values = [
          ["Present", row.present],
          ["Absent", row.absent],
          ["Excused", row.excused],
        ] as const;
        values.forEach(([item, value]) => add("Attendance trend", item, row.period, value));
      });
      sessions.forEach((session) => {
        add("Session attendance", session.title, dateLabel(session.scheduledDate), session.present);
        add("Session attendance", session.title, `${dateLabel(session.scheduledDate)} · ${t("Attendance marks")}`, session.attendanceMarks);
      });
    }
    if (reportParts.engagement) {
      engagementRows.forEach((person) => {
        add("Founder engagement", person.businessName, `${t("Current stage")}: ${t(STAGE_LABELS[person.stage] ?? person.stage)} · ${t("Attendance rate (%)")}`, person.attendanceRate);
        add("Founder engagement", person.businessName, t("Assignments submitted / available"), `${person.assignmentsSubmitted} / ${person.assignmentsAvailable}`);
      });
    }
    if (reportParts.impact) {
      kpis.forEach((kpi) => {
        kpi.values.forEach((value) => {
          add("Impact indicators and business outcomes", value.businessName, `${kpi.name} (${kpi.unit}) · ${dateLabel(value.periodEnd)}`, value.value);
          if (value.notes) add("Impact indicator notes", value.businessName, `${kpi.name} · ${dateLabel(value.periodEnd)}`, value.notes);
        });
        if (kpi.targetValue !== null) add("Impact indicator targets", kpi.name, kpi.unit, kpi.targetValue);
      });
    }

    const programName = selectedProgram
      ? data?.programs.find((program) => program.id === selectedProgram)?.name ?? t("Selected program")
      : t("All programs");
    const locale = currentLanguage() === "ar" ? "ar-JO" : "en-GB";
    downloadProgramAnalyticsCsv({
      title: reportTitle.trim() || t("Program progress report"),
      scope: programName,
      from: from ? dateLabel(from) : t("Start"),
      through: to ? dateLabel(to) : t("Today"),
      generatedAt: new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    }, rows, currentLanguage() === "ar" ? "ar" : "en");
    setReportOpen(false);
  }

  return <section className="analytics-page">
    <div className="analytics-wrap">
      <header className="analytics-heading">
        <div>
          <div className="ana-eyebrow"><span className="ana-kicker-dot" />{t("PROGRAM INTELLIGENCE")} <span className="ana-slash">/</span> {t("ADMIN VIEW")}</div>
          <h1>{t("Progress, with")} <em>{t("proof.")}</em></h1>
          <p>{t("Track each founder’s journey, capture attendance and turn program activity into evidence.")}</p>
          <div className="ana-refresh-meta">{refreshedAt ? <>{t("Updated")} {refreshedAt}</> : t("Live from program records")} <span>·</span> {t("Filters apply across this view")}</div>
        </div>
        <div className="ana-header-tools print-hide">
          <div className="ana-split-wrap" ref={refreshRef}>
            <div className="ana-split">
              <button onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? "ana-spinning" : ""} /> {t("Refresh")}</button>
              <button aria-label={t("Refresh settings")} onClick={() => setRefreshMenu((open) => !open)}><ChevronDown size={14} /></button>
            </div>
            {refreshMenu && <div className="ana-refresh-pop">
              <label className="ana-switchline">{t("Auto-refresh")} <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /><span className="ana-switch" /></label>
              <div className="ana-pop-label">{t("INTERVAL")}</div>
              {INTERVALS.map((option) => <button key={option.ms} className="ana-interval" onClick={() => { setIntervalMs(option.ms); setRefreshMenu(false); }}>{option.label}{intervalMs === option.ms && <Check size={14} />}</button>)}
              <small>{t("Automatic refresh is off by default. Minimum interval: 5 minutes.")}</small>
            </div>}
          </div>
          <button className="ana-tool" onClick={() => setReportOpen(true)} aria-label={t("Configure report")}><FileText size={16} /><span>{t("Report")}</span></button>
          <button className="ana-tool" onClick={() => window.print()} aria-label={t("Print or save PDF")}><Printer size={16} /></button>
          <button className="ana-tool" onClick={() => setIsDark((dark) => !dark)} aria-label={t("Toggle dark mode")}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>

      <section className="ana-filters print-hide">
        <div className="ana-filter-title"><CalendarDays size={16} /><span>{t("FILTER SCOPE")}</span></div>
        <label className="ana-field"><span>{t("Program / cohort")}</span><select value={programChoice} onChange={(e) => setSelectedProgramId(e.target.value ? Number(e.target.value) : null)}><option value="">{t("All programs")}</option>{programOptions.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
        <label className="ana-field"><span>{t("From")}</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="ana-field"><span>{t("Through")}</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="ana-range-caption"><span className="ana-range-pulse" />{data ? `${dateLabel(data.from)} — ${dateLabel(data.to)}` : t("Loading date range")}</div>
      </section>

      {error ? <section className="ana-state ana-error"><CircleAlert size={23} /><h2>{t("Analytics could not load")}</h2><p>{t("The program records are temporarily unavailable. Your filters are preserved.")}</p><button className="ana-button primary" onClick={refresh}><RefreshCw size={14} /> {t("Try again")}</button></section> :
      !loading && data && data.programs.length === 0 ? <section className="ana-state"><BarChart3 size={25} /><h2>{t("No programs to report yet")}</h2><p>{t("Analytics will appear when a program has been created and founder activity is recorded.")}</p></section> : <>
        <div className="ana-section-heading">
          <div><span className="ana-eyebrow">{t("AT A GLANCE")}</span><h2>{t("Program pulse")}</h2></div>
          <span className="ana-context">{selectedProgram ? data?.programs.find((p) => p.id === selectedProgram)?.name : t("All programs")} <i /> {from && to ? `${dateLabel(from)} — ${dateLabel(to)}` : t("All dates")}</span>
        </div>
        <section className="ana-metrics">
          {metrics.map(({ title, value, hint, icon: Icon, hue }) => <article key={title} className={`ana-metric ana-${hue}`}>
            <div className="ana-metric-top"><span>{title}</span><span className="ana-metric-icon"><Icon size={17} /></span></div>
            <strong>{loading ? <span className="ana-skeleton" /> : value}</strong><small>{loading ? "Updating records…" : hint}</small>
          </article>)}
        </section>

        <section className="ana-chart-grid">
          <article className="ana-panel ana-panel-stage">
            <div className="ana-panel-head"><div><span className="ana-eyebrow">{t('FOUNDER JOURNEY')}</span><h3>{t('Stage distribution')}</h3><p>{t('Businesses grouped by their current recorded stage.')}</p></div><ExportButton rows={stageRows.map((r) => ({ stage: t(STAGE_LABELS[r.stage] ?? r.stage), businesses: r.count }))} filename="stage-distribution.csv" /></div>
            {loading ? <div className="ana-chart-skeleton" /> : stageRows.length ? <div className="ana-stage-list">{stageRows.map((row, index) => {
              const maximum = Math.max(...stageRows.map((item) => item.count), 1);
              return <div className="ana-stage-row" key={row.stage}><span className="ana-stage-index">0{index + 1}</span><span className="ana-stage-name">{t(STAGE_LABELS[row.stage] ?? row.stage)}</span><span className="ana-stage-bar"><i style={{ width: `${Math.max(3, row.count / maximum * 100)}%` }} /></span><b>{fmt(row.count)}</b></div>;
            })}</div> : <div className="ana-inline-empty"><Activity size={18} /><span>{t('No stage records for this program.')}</span></div>}
            <div className="ana-panel-foot">{t('Source: current business stage records')}</div>
          </article>
          <article className="ana-panel ana-panel-trend">
            <div className="ana-panel-head"><div><span className="ana-eyebrow">{t('ATTENDANCE RECORDS')}</span><h3>{t('Participation over time')}</h3><p>{t('Recorded present, absent and excused marks by period.')}</p></div><ExportButton rows={trendRows.map((row) => ({ period: row.period, present: row.present, absent: row.absent, excused: row.excused }))} filename="attendance-trend.csv" /></div>
            {loading ? <div className="ana-chart-skeleton" /> : hasAttendanceData ? <div className="ana-chart"><ResponsiveContainer width="100%" height={230} debounce={0}><AreaChart data={trendRows} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 5" stroke={chartGrid} vertical={false} /><XAxis dataKey="period" tick={{ fontSize: 11, fill: chartTicks }} stroke={chartGrid} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: chartTicks }} stroke="transparent" axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip isAnimationActive={false} contentStyle={{ borderRadius: 8, borderColor: chartGrid, background: isDark ? "#1c302d" : "#fffdf7", color: isDark ? "#e8eee9" : "#283a36", fontSize: 12 }} />
                <Area type="monotone" dataKey="present" name={t('Present')} stackId="attendance" stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={.22} strokeWidth={2.3} isAnimationActive={false} />
                <Area type="monotone" dataKey="absent" name={t('Absent')} stackId="attendance" stroke={COLORS.coral} fill={COLORS.coral} fillOpacity={.18} strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="excused" name={t('Excused')} stackId="attendance" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={.16} strokeWidth={1.8} isAnimationActive={false} />
             </AreaChart></ResponsiveContainer><div className="ana-legend"><span><i className="legend-present" />{t('Present')}</span><span><i className="legend-absent" />{t('Absent')}</span><span><i className="legend-excused" />{t('Excused')}</span></div></div> : <div className="ana-inline-empty"><Activity size={18} /><span>{t('No attendance data in this date range.')}</span></div>}
             <div className="ana-panel-foot">{t('Missing attendance is not counted as absent.')}</div>
          </article>
        </section>

        <section className="ana-panel ana-engagement">
          <div className="ana-panel-head ana-engagement-head"><div><span className="ana-eyebrow">{t('FOUNDER-LEVEL SIGNALS')}</span><h3>{t('Engagement & progress')}</h3><p>{t('Activity captured inside the selected date window.')}</p></div>
            <div className="ana-eng-summary"><b>{loading ? "—" : fmt(engagementRows.length)}</b><span>{t('business records')}</span></div>
            <ExportButton rows={engagementRows.map((person) => ({ business: person.businessName, stage: STAGE_LABELS[person.stage] ?? person.stage, sessionsAttended: person.sessionsAttended, sessionsMarked: person.sessionsMarked, attendanceRate: person.attendanceRate == null ? "No marks" : `${person.attendanceRate.toFixed(1)}%`, assignmentsSubmitted: person.assignmentsSubmitted, assignmentsAvailable: person.assignmentsAvailable, questionsAsked: person.questionsAsked, supportEngagements: person.supportEngagements, lastActivityAt: person.lastActivityAt ?? "No recorded activity" }))} filename="founder-engagement.csv" />
          </div>
           {loading ? <div className="ana-table-skeleton"><i /><i /><i /><i /></div> : engagementRows.length ? <div className="ana-table-scroll"><table className="ana-table"><thead><tr><th>{t('Business')}</th><th>{t('Current stage')}</th><th>{t('Sessions')}</th><th>{t('Attendance')}</th><th>{t('Assignments')}</th><th>{t('Questions')}</th><th>{t('Support')}</th><th>{t('Last activity')}</th></tr></thead><tbody>{engagementRows.map((person) => <tr key={person.businessId}>
            <td><span className="ana-business"><i>{person.businessName.slice(0, 1).toUpperCase()}</i><b>{person.businessName}</b></span></td>
             <td><span className="ana-stage-chip">{t(STAGE_LABELS[person.stage] ?? person.stage)}</span></td><td>{fmt(person.sessionsAttended)} <span className="ana-table-muted">/ {fmt(person.sessionsMarked)} {t('marked')}</span></td>
             <td>{person.attendanceRate == null ? <span className="ana-missing">{t('No marks')}</span> : <span className="ana-rate"><i style={{ "--rate-width": `${Math.max(0, Math.min(person.attendanceRate, 100))}%` } as React.CSSProperties} />{person.attendanceRate.toFixed(0)}%</span>}</td>
             <td>{fmt(person.assignmentsSubmitted)} <span className="ana-table-muted">/ {fmt(person.assignmentsAvailable)}</span></td><td>{fmt(person.questionsAsked)}</td><td>{fmt(person.supportEngagements)}</td><td>{person.lastActivityAt ? dateLabel(person.lastActivityAt.slice(0, 10)) : <span className="ana-missing">{t('No recent activity')}</span>}</td>
           </tr>)}</tbody></table></div> : <div className="ana-inline-empty"><Users size={18} /><span>{t('No founder activity records match these filters.')}</span></div>}
           <div className="ana-panel-foot">{t('A dash means the source contains no record for that metric; it is not treated as zero performance.')}</div>
        </section>

        <section className="ana-panel ana-interactions">
          <div className="ana-panel-head ana-interactions-head">
            <div><span className="ana-eyebrow">{t("LIVE SESSION ACTIVITIES")}</span><h3>{t("Poll & survey participation")}</h3><p>{t("Compare weekly or monthly response counts and rates across programs and the selected date range.")}</p></div>
            <div className="ana-interaction-tools print-hide">
              <label>{t("Activity type")}<select value={interactionType} onChange={(event) => setInteractionType(event.target.value as typeof interactionType)}>
                <option value="all">{t("Polls & surveys")}</option><option value="poll">{t("Polls")}</option><option value="survey">{t("Surveys")}</option>
              </select></label>
              <label>{t("Period")}<select value={interactionPeriod} onChange={(event) => setInteractionPeriod(event.target.value as typeof interactionPeriod)}>
                <option value="weekly">{t("Weekly")}</option><option value="monthly">{t("Monthly")}</option>
              </select></label>
              <label>{t("Flag below")}<select data-testid="select-response-rate-threshold" aria-label={t("Flag activities below this response rate")} value={interactionThreshold} onChange={(event) => setInteractionThreshold(Number(event.target.value))}>
                {[20, 30, 40, 50].map((threshold) => <option key={threshold} value={threshold}>{threshold}%</option>)}
              </select></label>
              <ExportButton rows={(interactionAnalyticsQuery.data?.trend ?? []).map((period) => ({
                period: trendPeriodLabel(period.periodStart, period.periodEnd),
                activities: period.activityCount,
                responses: period.responseCount ?? "Unavailable",
                eligibleOpportunities: period.eligibleOpportunities ?? "Unavailable",
                responseRate: period.responseRate == null ? "Unavailable" : `${period.responseRate.toFixed(1)}%`,
                responseChange: period.responseCountChange == null ? "Unavailable" : signed(period.responseCountChange),
                responseRateChange: period.responseRateChange == null ? "Unavailable" : signed(period.responseRateChange, " pp"),
              }))} filename={`poll-survey-trend-${interactionPeriod}.csv`} label={t("Export trend CSV")} />
              <ExportButton rows={(interactionAnalyticsQuery.data?.activities ?? []).map((activity) => ({
                program: activity.programName,
                session: activity.sessionTitle,
                sessionDate: activity.sessionDate,
                activity: activity.activityTitle,
                type: activity.type,
                status: activity.status,
                responses: activity.status === "draft" || activity.eligibleBusinesses === 0 ? "Unavailable" : activity.responseCount,
                eligibleBusinesses: activity.eligibleBusinesses || "Unavailable",
                responseRate: activity.responseRate == null ? "Unavailable" : `${activity.responseRate.toFixed(1)}%`,
                needsFollowUp: activity.needsFollowUp ? "Yes" : "No",
              }))} filename="poll-survey-participation.csv" label={t("Export activity CSV")} />
            </div>
          </div>
          {interactionAnalyticsQuery.isLoading ? <div className="ana-table-skeleton"><i /><i /><i /></div> :
            interactionAnalyticsQuery.isError ? <div className="ana-inline-empty ana-interaction-error"><CircleAlert size={18} /><span>{t("Poll and survey participation could not load.")}</span><button type="button" onClick={() => void interactionAnalyticsQuery.refetch()}>{t("Retry")}</button></div> :
              <>
                {interactionAnalyticsQuery.data?.trend.some((point) => point.activityCount > 0) ? <>
                  <div className="ana-interaction-chart" role="img" aria-label={t("Responses and response rate by reporting period")}>
                    <ResponsiveContainer width="100%" height={235}>
                      <ComposedChart data={interactionAnalyticsQuery.data.trend} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 5" vertical={false} stroke={chartGrid} />
                        <XAxis dataKey="periodStart" tickFormatter={(value: string) => dateLabel(value).replace(/,\s*\d{4}$/, "")} tick={{ fill: chartTicks, fontSize: 8 }} axisLine={false} tickLine={false} minTickGap={20} />
                        <YAxis yAxisId="responses" allowDecimals={false} tick={{ fill: chartTicks, fontSize: 8 }} axisLine={false} tickLine={false} width={34} />
                        <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: chartTicks, fontSize: 8 }} axisLine={false} tickLine={false} width={42} />
                        <Tooltip labelFormatter={(value) => {
                          const point = interactionAnalyticsQuery.data?.trend.find((row) => row.periodStart === value);
                          return point ? trendPeriodLabel(point.periodStart, point.periodEnd) : String(value);
                        }} formatter={(value, name) => [
                          value == null ? t("Unavailable") : name === t("Response rate") ? `${Number(value).toFixed(1)}%` : fmt(Number(value)),
                          name,
                        ]} />
                        <Bar yAxisId="responses" dataKey="responseCount" name={t("Responses")} fill={COLORS.teal} radius={[3, 3, 0, 0]} maxBarSize={24} />
                        <Line yAxisId="rate" dataKey="responseRate" name={t("Response rate")} type="monotone" stroke={COLORS.coral} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="ana-legend"><span><i />{t("Responses")}</span><span><i className="legend-absent" />{t("Response rate")}</span></div>
                  </div>
                  <div className="ana-table-scroll ana-interaction-trend-table"><table className="ana-table"><thead><tr><th>{t("Reporting period")}</th><th>{t("Activities")}</th><th>{t("Responses")}</th><th>{t("Change")}</th><th>{t("Response rate")}</th><th>{t("Rate change")}</th></tr></thead><tbody>{interactionAnalyticsQuery.data.trend.map((point) => <tr key={point.periodStart}>
                    <td>{trendPeriodLabel(point.periodStart, point.periodEnd)}</td>
                    <td>{point.activityCount ? fmt(point.activityCount) : <span className="ana-missing">{t("No eligible activities")}</span>}</td>
                    <td>{point.responseCount == null ? <span className="ana-missing">{t("Unavailable")}</span> : fmt(point.responseCount)}</td>
                    <td>{signed(point.responseCountChange)}</td>
                    <td>{point.responseRate == null ? <span className="ana-missing">{t("Unavailable")}</span> : `${point.responseRate.toFixed(1)}%`}</td>
                    <td>{signed(point.responseRateChange, " pp")}</td>
                  </tr>)}</tbody></table></div>
                </> : <div className="ana-inline-empty"><Activity size={18} /><span>{t("No opened polls or surveys with eligible businesses match this period.")}</span></div>}
                {interactionAnalyticsQuery.data?.activities.length ? <div className="ana-table-scroll"><table className="ana-table ana-interactions-table"><thead><tr><th>{t("Program / cohort")}</th><th>{t("Session")}</th><th>{t("Activity")}</th><th>{t("Responses")}</th><th>{t("Response rate")}</th></tr></thead><tbody>{interactionAnalyticsQuery.data.activities.map((activity) => <tr key={activity.activityId} data-testid={`row-session-activity-${activity.activityId}`}>
                <td><b>{activity.programName}</b></td>
                <td><span className="ana-interaction-session">{activity.sessionTitle}</span><small>{dateLabel(activity.sessionDate)}</small></td>
                <td><span className={`ana-interaction-kind ana-kind-${activity.type}`}>{t(activity.type)}</span><span className="ana-interaction-title">{activity.activityTitle}</span><small>{t(activity.status)}</small></td>
                <td>{activity.status === "draft" || activity.eligibleBusinesses === 0 ? <span className="ana-missing">{t(activity.status === "draft" ? "Not opened" : "No eligible businesses")}</span> : <><b>{fmt(activity.responseCount)}</b><span className="ana-table-muted"> / {fmt(activity.eligibleBusinesses)}</span></>}</td>
                <td>{activity.responseRate == null ? <span className="ana-missing">{t(activity.status === "draft" ? "Not opened" : "Unavailable")}</span> : <><span className="ana-rate"><i style={{ "--rate-width": `${Math.max(0, Math.min(activity.responseRate, 100))}%` } as React.CSSProperties} />{activity.responseRate.toFixed(1)}%</span>{activity.needsFollowUp ? <span className="ana-follow-up-flag" data-testid={`status-low-response-${activity.activityId}`}><CircleAlert size={12} />{t("Needs follow-up")}</span> : null}</>}</td>
              </tr>)}</tbody></table></div> : null}
              </>}
          <div className="ana-panel-foot">{t("Activities below")} {interactionThreshold}% {t("are flagged for follow-up. Only open or closed activities with an available rate can be flagged.")} {t("Rates are weighted by accepted-business activity opportunities. Draft activities and periods without eligible businesses are excluded from the trend, not counted as zero. This view contains aggregate counts only; survey answers remain available only in authorized session reviews.")}</div>
        </section>

        <section className="ana-lower-grid">
          <article className="ana-panel ana-session-panel">
            <div className="ana-panel-head"><div><span className="ana-eyebrow">{t('COLLECTION DESK')}</span><h3>{t('Session attendance')}</h3><p>{t('Select a session to mark present, absent, excused or unmarked.')}</p></div><span className="ana-count-tag">{fmt(sessions.length)} {t('sessions')}</span></div>
            {loading ? <div className="ana-sessions-loading"><i /><i /><i /></div> : sessions.length ? <div className="ana-session-list">{sessions.map((session) => <div className="ana-session" key={session.id}>
              <div className="ana-date-tile"><b>{session.scheduledDate.slice(8, 10)}</b><span>{new Date(`${session.scheduledDate}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: "short" })}</span></div>
              <div className="ana-session-copy"><b>{session.title}</b><span>{dateLabel(session.scheduledDate)} <i /> {t(session.status)}</span><small>{session.attendanceMarks ? `${fmt(session.present)} ${t('present')} · ${fmt(session.attendanceMarks)} ${t('marked')}` : t("No attendance recorded")}</small></div>
              <button className="ana-button subtle" onClick={() => setActiveSession(session.id)}><ClipboardCheck size={14} /> {t('Register')}</button>
            </div>)}</div> : <div className="ana-inline-empty"><CalendarDays size={18} /><span>{t('No sessions are recorded in this date range.')}</span></div>}
          </article>
          <article className="ana-panel ana-kpi-panel">
            <div className="ana-panel-head"><div><span className="ana-eyebrow">{t('OUTCOME MEASUREMENT')}</span><h3>{t('Impact indicators')}</h3><p>{t('Admin-defined KPIs and business-level observations.')}</p></div><button className="ana-icon-btn print-hide" onClick={() => setKpiEditor("new")} disabled={!selectedProgram} title={!selectedProgram ? t("Choose a program to manage KPIs") : t("Create impact KPI")} aria-label={t("Create impact KPI")}><Plus size={17} /></button></div>
            {!selectedProgram ? <div className="ana-inline-empty"><Target size={18} /><span>{t("Select a single program to manage impact indicators.")}</span></div> : kpiQuery.isLoading ? <div className="ana-sessions-loading"><i /><i /></div> : kpiQuery.isError ? <div className="ana-inline-empty"><CircleAlert size={18} /><span>{t("Impact indicators could not load. Refresh to try again.")}</span></div> : kpis.length ? <div className="ana-kpi-list">{kpis.map((kpi) => {
              const latest = [...kpi.values].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
              const targetText = kpi.targetValue == null ? "Target not set" : `${kpi.targetValue} ${kpi.unit} target`;
              const progress = latest && kpi.targetValue !== null && kpi.targetValue !== 0 ? Math.min(100, Math.max(0, latest.value / kpi.targetValue * 100)) : 0;
              return <div className="ana-kpi-row" key={kpi.id}><div className="ana-kpi-copy"><span className="ana-kpi-symbol"><Target size={15} /></span><div><b>{kpi.name}</b><small>{kpi.description || targetText}</small></div></div>
                <div className="ana-kpi-value">{latest ? <><strong>{latest.value} <small>{kpi.unit}</small></strong><span>{dateLabel(latest.periodEnd)}</span></> : <span className="ana-missing">{t("No business values")}</span>}</div>
                {kpi.targetValue != null && <div className="ana-target-line"><i style={{ width: `${progress}%` }} /></div>}
                <div className="ana-kpi-actions print-hide"><button onClick={() => setValueEditor(kpi)} title={t("Record a business value")}>{t("Record value")}</button><button aria-label={`${t("Edit")} ${kpi.name}`} onClick={() => setKpiEditor(kpi)}><Pencil size={14} /></button><button aria-label={`${t("Remove")} ${kpi.name}`} onClick={() => setDeleteKpi(kpi)}><Trash2 size={14} /></button></div>
              </div>;
            })}</div> : <div className="ana-kpi-empty"><Target size={20} /><b>{t("No impact indicators defined")}</b><span>{t("Add an indicator to start collecting measurable outcomes from businesses.")}</span><button className="ana-button primary print-hide" onClick={() => setKpiEditor("new")}><Plus size={14} /> {t("Create indicator")}</button></div>}
          </article>
        </section>
      </>}
      <footer className="ana-footer"><span>{t("ADMIN ANALYTICS")}</span><span>{t("Only recorded program activity is shown")}</span></footer>
    </div>

    {activeSession !== null && <AccessibleDialogSurface className="ana-modal ana-attendance-modal" overlayClassName="ana-modal-backdrop" labelledBy="attendance-title" initialFocusSelector="[data-dialog-autofocus]" onClose={requestAttendanceClose} closeOnEscape={!attendanceDirty && !attendancePending} closeOnOutsideInteraction={!attendanceDirty && !attendancePending} onDismissAttempt={() => { if (attendanceDirty && !attendancePending) setDiscardTarget("attendance"); }} testId="dialog-attendance-register">
      <div className="ana-modal-head"><div><span className="ana-eyebrow">SESSION REGISTER</span><h2 id="attendance-title">{registerQuery.data?.session.title ?? "Attendance register"}</h2><p>{registerQuery.data ? dateLabel(registerQuery.data.session.scheduledDate) : "Loading roster"}</p></div><button className="ana-icon-btn" onClick={requestAttendanceClose} disabled={attendancePending} aria-label="Close register" data-dialog-autofocus><X size={17} /></button></div>
      {registerQuery.isLoading ? <div className="ana-modal-body"><div className="ana-sessions-loading"><i /><i /><i /></div></div> : registerQuery.isError ? <div className="ana-modal-body"><div className="ana-inline-empty"><CircleAlert size={18} /><span>Roster unavailable. Close and try opening this session again.</span></div></div> : <>
        <div className="ana-sync-panel">
          <div className="ana-sync-summary">
            <div><span className="ana-eyebrow">ZOOM ATTENDANCE</span><b>{registerQuery.data?.zoomSync ? registerQuery.data.zoomSync.status.replaceAll("_", " ") : "Not synced yet"}</b><small>{registerQuery.data?.zoomSync ? `${fmt(registerQuery.data.zoomSync.matchedCount)} matched · ${fmt(registerQuery.data.zoomSync.unmatchedCount)} need review` : "The report is added after Zoom ends the meeting."}</small></div>
            {registerQuery.data?.session.zoomMeetingId ? <button className="ana-button subtle" onClick={queueAttendanceRefresh} disabled={queueAttendanceSync.isPending || ["queued", "syncing"].includes(registerQuery.data?.zoomSync?.status ?? "")}>
              <RefreshCw size={14} />{queueAttendanceSync.isPending ? "Queueing…" : "Refresh from Zoom"}
            </button> : <span className="ana-count-tag">Manual register</span>}
          </div>
          {registerQuery.data?.session.zoomMeetingId ? <p>Automatic imports require a Zoom Pro-or-higher account, the <code>meeting:read:list_past_participants</code> permission, and the <code>meeting.ended</code> webhook event. Connect or reconnect Zoom in the live platform. Unmatched attendees remain for staff review.</p> : <p>This session has no Zoom meeting, so attendance can only be recorded manually.</p>}
          {registerQuery.data?.zoomSync?.lastError && <p className="ana-sync-error" role="status">{registerQuery.data.zoomSync.lastError}</p>}
          {queueAttendanceSync.isError && <p className="ana-sync-error" role="alert">Zoom attendance could not be queued. Check the session’s Zoom connection and try again.</p>}
        </div>
        {registerQuery.data?.unmatchedParticipants.length ? <section className="ana-unmatched-panel" aria-label="Unmatched Zoom attendees">
          <div className="ana-unmatched-heading"><div><span className="ana-eyebrow">ADMIN REVIEW</span><b>{registerQuery.data.unmatchedParticipants.length} unmatched Zoom attendee{registerQuery.data.unmatchedParticipants.length === 1 ? "" : "s"}</b></div><small>Match each attendee to a business or ignore staff and guests.</small></div>
          <div className="ana-unmatched-list">{registerQuery.data.unmatchedParticipants.map((person) => <div className="ana-unmatched-row" key={person.id}>
            <div><b>{person.displayName}</b><span>{person.email || "Email unavailable"} · {Math.round(person.durationSeconds / 60)} min</span></div>
            <select aria-label={`Match ${person.displayName} to a business`} value={participantMatches[person.id] ?? ""} onChange={(event) => setParticipantMatches((current) => ({ ...current, [person.id]: event.target.value }))}>
              <option value="">Choose business</option>{registerQuery.data?.roster.map((business) => <option key={business.businessId} value={business.businessId}>{business.businessName}</option>)}
            </select>
            <button className="ana-button primary" onClick={() => resolveAttendee(person.id, false)} disabled={!participantMatches[person.id] || resolveAttendanceParticipant.isPending}>Match</button>
            <button className="ana-button subtle" onClick={() => resolveAttendee(person.id, true)} disabled={resolveAttendanceParticipant.isPending}>Ignore</button>
          </div>)}</div>
          {resolveAttendanceParticipant.isError && <p className="ana-sync-error" role="alert">This attendee could not be updated. Refresh and try again.</p>}
        </section> : null}
        <div className="ana-register-tools"><span>{fmt(registerQuery.data?.roster.length ?? 0)} businesses on roster</span><div>{(["present", "absent", "excused", null] as const).map((status) => <button key={status ?? "unmarked"} onClick={() => setAttendance((current) => Object.fromEntries((registerQuery.data?.roster ?? []).map((person) => [person.businessId, { ...current[person.businessId], status, notes: current[person.businessId]?.notes ?? "" }])))}>{status ?? "Clear all"}</button>)}</div></div>
        <div className="ana-register-list">{registerQuery.data?.roster.map((person) => <div className="ana-register-person" key={person.businessId}><div className="ana-register-name"><i>{person.businessName.slice(0, 1).toUpperCase()}</i><b>{person.businessName}</b>{person.source === "zoom" && person.attendedSeconds !== null && <small>Zoom · {Math.round(person.attendedSeconds / 60)} min</small>}</div><div className="ana-status-set">{(["present", "absent", "excused", null] as const).map((status) => <button key={status ?? "clear"} className={attendance[person.businessId]?.status === status ? `selected ${status ?? "unmarked"}` : ""} onClick={() => patchAttendance(person.businessId, { status })}>{status ?? "—"}</button>)}</div><input aria-label={`Notes for ${person.businessName}`} placeholder="Optional note" value={attendance[person.businessId]?.notes ?? ""} onChange={(event) => patchAttendance(person.businessId, { notes: event.target.value })} /></div>)}</div>
         <div className="ana-modal-actions"><button className="ana-button subtle" onClick={requestAttendanceClose} disabled={attendancePending}>Cancel</button><button className="ana-button primary" onClick={saveRegister} disabled={saveAttendance.isPending}><Check size={14} />{saveAttendance.isPending ? "Saving…" : "Save register"}</button></div>
        {saveAttendance.isError && <p className="ana-form-error">Attendance could not be saved. Your changes are still here; try again.</p>}
       </>}
    </AccessibleDialogSurface>}
    {discardTarget === "attendance" && <UnsavedChangesDialog onKeepEditing={() => setDiscardTarget(null)} onDiscard={() => { setDiscardTarget(null); setAttendance({}); setParticipantMatches({}); setActiveSession(null); }} />}

    {(kpiEditor === "new" || kpiEditor) && <AccessibleDialogSurface className="ana-modal" overlayClassName="ana-modal-backdrop" labelledBy="kpi-title" initialFocusSelector="[data-dialog-autofocus]" onClose={requestKpiClose} closeOnEscape={!kpiDirty && !createKpi.isPending && !updateKpi.isPending} closeOnOutsideInteraction={!kpiDirty && !createKpi.isPending && !updateKpi.isPending} onDismissAttempt={() => { if (kpiDirty && !createKpi.isPending && !updateKpi.isPending) setDiscardTarget("kpi"); }} testId="dialog-kpi-editor">
      <div className="ana-modal-head"><div><span className="ana-eyebrow">OUTCOME MEASUREMENT</span><h2 id="kpi-title">{kpiEditor === "new" ? "New impact indicator" : "Edit impact indicator"}</h2><p>Define a useful measure for this program’s businesses.</p></div><button className="ana-icon-btn" onClick={requestKpiClose} disabled={createKpi.isPending || updateKpi.isPending} aria-label="Close"><X size={17} /></button></div>
      <form className="ana-form" onSubmit={commitKpi} onChange={() => setKpiDirty(true)}>
        <label>Name<input data-dialog-autofocus name="name" required maxLength={120} defaultValue={kpiEditor === "new" ? "" : kpiEditor.name} placeholder="e.g. Monthly recurring revenue" /></label>
        <label>Description <span className="ana-optional">Optional</span><textarea name="description" maxLength={1000} defaultValue={kpiEditor === "new" ? "" : kpiEditor.description ?? ""} placeholder="What should this measure tell you?" /></label>
        <div className="ana-form-row"><label>Unit<input name="unit" required maxLength={40} defaultValue={kpiEditor === "new" ? "" : kpiEditor.unit} placeholder="USD, customers, jobs…" /></label><label>Target value <span className="ana-optional">Optional</span><input name="targetValue" type="number" step="any" defaultValue={kpiEditor === "new" || kpiEditor.targetValue == null ? "" : kpiEditor.targetValue} /></label></div>
        <label>Direction<select name="direction" defaultValue={kpiEditor === "new" ? "increase_is_good" : kpiEditor.direction}><option value="increase_is_good">Higher values are better</option><option value="decrease_is_good">Lower values are better</option></select></label>
        {(createKpi.isError || updateKpi.isError) && <p className="ana-form-error">Could not save this indicator. Check your connection and try again.</p>}
        <div className="ana-modal-actions"><button type="button" className="ana-button subtle" onClick={requestKpiClose} disabled={createKpi.isPending || updateKpi.isPending}>Cancel</button><button className="ana-button primary" disabled={createKpi.isPending || updateKpi.isPending}>{createKpi.isPending || updateKpi.isPending ? "Saving…" : "Save indicator"}</button></div>
      </form>
    </AccessibleDialogSurface>}
    {discardTarget === "kpi" && <UnsavedChangesDialog onKeepEditing={() => setDiscardTarget(null)} onDiscard={() => { setDiscardTarget(null); closeKpiEditor(); }} />}

    {valueEditor && <AccessibleDialogSurface className="ana-modal" overlayClassName="ana-modal-backdrop" labelledBy="value-title" initialFocusSelector="[data-dialog-autofocus]" onClose={requestValueClose} closeOnEscape={!valueDirty && !saveKpiValues.isPending} closeOnOutsideInteraction={!valueDirty && !saveKpiValues.isPending} onDismissAttempt={() => { if (valueDirty && !saveKpiValues.isPending) setDiscardTarget("value"); }} testId="dialog-kpi-value">
      <div className="ana-modal-head"><div><span className="ana-eyebrow">RECORD OUTCOME</span><h2 id="value-title">{valueEditor.name}</h2><p>Add one observed value for a business.</p></div><button className="ana-icon-btn" onClick={requestValueClose} disabled={saveKpiValues.isPending} aria-label="Close"><X size={17} /></button></div>
      <form className="ana-form" onSubmit={commitValues} onChange={() => setValueDirty(true)}>
        <label>Business<select data-dialog-autofocus name="businessId" required defaultValue=""><option value="" disabled>Select a business</option>{engagementRows.map((person) => <option key={person.businessId} value={person.businessId}>{person.businessName}</option>)}</select></label>
        <div className="ana-form-row"><label>Observed value ({valueEditor.unit})<input name="value" type="number" step="any" required /></label><label>Period ending<input name="periodEnd" type="date" required defaultValue={today} /></label></div>
        <label>Notes <span className="ana-optional">Optional</span><textarea name="notes" maxLength={1000} placeholder="Context for this measurement" /></label>
        {saveKpiValues.isError && <p className="ana-form-error">Value not saved. Please check the details and retry.</p>}
        <div className="ana-modal-actions"><button type="button" className="ana-button subtle" onClick={requestValueClose} disabled={saveKpiValues.isPending}>Cancel</button><button className="ana-button primary" disabled={saveKpiValues.isPending}>{saveKpiValues.isPending ? "Saving…" : "Save value"}</button></div>
        {!engagementRows.length && <p className="ana-form-hint">There are no businesses in this filtered program window to select.</p>}
      </form>
    </AccessibleDialogSurface>}
    {discardTarget === "value" && <UnsavedChangesDialog onKeepEditing={() => setDiscardTarget(null)} onDiscard={() => { setDiscardTarget(null); closeValueEditor(); }} />}

    {deleteKpi && <AccessibleDialogSurface className="ana-modal ana-confirm" overlayClassName="ana-modal-backdrop" role="alertdialog" labelledBy="delete-title" initialFocusSelector="[data-dialog-autofocus]" onClose={() => setDeleteKpi(null)} closeOnOutsideInteraction={false} closeOnEscape={!removeKpi.isPending} testId="dialog-delete-kpi"><span className="ana-delete-mark"><Trash2 size={18} /></span><h2 id="delete-title">Remove this indicator?</h2><p><b>{deleteKpi.name}</b> and its recorded values will be deleted. This cannot be undone.</p>{removeKpi.isError && <p className="ana-form-error">Could not remove the indicator. Try again.</p>}<div className="ana-modal-actions"><button className="ana-button subtle" data-dialog-autofocus onClick={() => setDeleteKpi(null)} disabled={removeKpi.isPending}>Keep indicator</button><button className="ana-button danger" disabled={removeKpi.isPending} onClick={() => removeKpi.mutate({ id: deleteKpi.id }, { onSuccess: () => { invalidateKpis(); setDeleteKpi(null); } })}>{removeKpi.isPending ? "Removing…" : "Remove indicator"}</button></div></AccessibleDialogSurface>}

    {reportOpen && <AccessibleDialogSurface className="ana-modal" overlayClassName="ana-modal-backdrop print-hide" labelledBy="report-title" initialFocusSelector="[data-dialog-autofocus]" onClose={() => setReportOpen(false)} testId="dialog-report-builder">
      <div className="ana-modal-head"><div><span className="ana-eyebrow">REPORT BUILDER</span><h2 id="report-title">Prepare a filtered report</h2><p>Choose sections from the current program and date scope.</p></div><button className="ana-icon-btn" onClick={() => setReportOpen(false)} aria-label="Close"><X size={17} /></button></div>
      <div className="ana-form"><label>Report title<input data-dialog-autofocus value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} maxLength={100} /></label>
         <div className="ana-report-parts">{Object.entries({ summary: "Program summary", stages: "Founder stage distribution", attendance: "Attendance trend and sessions", engagement: "Founder engagement table", impact: "Impact indicators and business outcomes" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={reportParts[key as keyof typeof reportParts]} onChange={(event) => setReportParts((parts) => ({ ...parts, [key]: event.target.checked }))} /><span>{label}</span></label>)}</div>
        <div className="ana-report-scope"><b>Included scope</b><span>{selectedProgram ? data?.programs.find((p) => p.id === selectedProgram)?.name : "All programs"}</span><span>{from ? dateLabel(from) : "Start"} to {to ? dateLabel(to) : "Today"}</span></div>
         <div className="ana-modal-actions ana-report-actions"><button className="ana-button subtle" onClick={() => setReportOpen(false)}>{t("Cancel")}</button><button className="ana-button subtle" onClick={exportReportSpreadsheet} data-testid="button-export-program-report-csv"><Download size={14} /> {t("Export spreadsheet (CSV)")}</button><button className="ana-button primary" onClick={() => { setReportOpen(false); window.setTimeout(() => window.print(), 100); }} data-testid="button-print-program-report"><Printer size={14} /> {t("Print / Save branded PDF")}</button></div>
      </div>
    </AccessibleDialogSurface>}

  <div className="ana-report-print" aria-hidden="true" lang={currentLanguage()} dir={currentLanguage() === "ar" ? "rtl" : "ltr"}>
      <header className="ana-print-brand">
        <span className="ana-print-mark">J</span>
        <div className="ana-print-wordmark"><b>JUSOOR</b><span>{t("ENTREPRENEURSHIP PROGRAM · ADMIN REPORT")}</span></div>
        <span className="ana-print-issued">{t("Generated")} · {new Date().toLocaleDateString(currentLanguage() === "ar" ? "ar-JO" : "en-GB", { dateStyle: "medium" })}</span>
      </header>
      <div className="ana-print-title">
        <span>{t("IMPACT & PROGRESS")}</span>
        <h1>{reportTitle || t("Program progress report")}</h1>
        <p>{selectedProgram ? data?.programs.find((p) => p.id === selectedProgram)?.name : t("All programs")} · {from ? dateLabel(from) : t("Start")} — {to ? dateLabel(to) : t("Today")}</p>
      </div>
      {reportParts.summary && summary && <section>
        <h2>{t("Program summary")}</h2>
        <div className="ana-print-stats">{metrics.map((metric) => <div key={metric.title}><span>{t(metric.title)}</span><b>{metric.value}</b></div>)}</div>
        <p>{t("Applications")}: {fmt(summary.applications)} · {t("Accepted applications")}: {fmt(summary.acceptedApplications)} · {t("Sessions")}: {fmt(summary.sessionsInRange)} · {t("Completed support")}: {fmt(summary.completedSupport)} · {t("Unanswered questions")}: {fmt(summary.unansweredQuestions)}</p>
      </section>}
      {reportParts.stages && <section>
        <h2>{t("Founder stage distribution")}</h2>
        {stageRows.length ? stageRows.map((row) => <p key={row.stage}>{t(STAGE_LABELS[row.stage] ?? row.stage)}: {fmt(row.count)}</p>) : <p>{t("No stage data recorded.")}</p>}
      </section>}
      {reportParts.attendance && <section>
        <h2>{t("Attendance trend and sessions")}</h2>
        {hasAttendanceData ? trendRows.map((row) => <p key={row.period}>{row.period}: {row.present === null ? t("No attendance marks recorded") : `${fmt(row.present)} ${t("present")} · ${fmt(row.absent ?? 0)} ${t("absent")} · ${fmt(row.excused ?? 0)} ${t("excused")}`}</p>) : <p>{t("No attendance data recorded for this range.")}</p>}
        {sessions.map((session) => <p key={session.id}>{dateLabel(session.scheduledDate)} · {session.title}: {fmt(session.present)} {t("present")} / {fmt(session.attendanceMarks)} {t("marked")}</p>)}
      </section>}
      {reportParts.engagement && <section>
        <h2>{t("Founder engagement")}</h2>
        {engagementRows.length ? engagementRows.map((person) => <p key={person.businessId}>{person.businessName} · {t(STAGE_LABELS[person.stage] ?? person.stage)} · {person.attendanceRate == null ? t("No attendance records") : `${person.attendanceRate.toFixed(1)}% ${t("attendance")}`} · {person.assignmentsSubmitted}/{person.assignmentsAvailable} {t("assignments")}</p>) : <p>{t("No founder activity data recorded.")}</p>}
      </section>}
      {reportParts.impact && <section>
        <h2>{t("Impact indicators and business outcomes")}</h2>
        {!selectedProgram ? <p>{t("Select one program to include its impact indicators.")}</p> : kpis.length ? kpis.map((kpi) => <div key={kpi.id}>
          <h3>{kpi.name} ({kpi.unit}){kpi.targetValue == null ? "" : ` · ${t("Target")} ${kpi.targetValue}`}</h3>
          {kpi.values.length ? kpi.values.map((value) => <p key={`${value.businessId}-${value.periodEnd}`}>{value.businessName} · {value.value} {kpi.unit} · {t("period ending")} {dateLabel(value.periodEnd)}{value.notes ? ` · ${value.notes}` : ""}</p>) : <p>{t("No business outcomes recorded for this indicator.")}</p>}
        </div>) : <p>{t("No impact indicators have been defined for this program.")}</p>}
      </section>}
      <footer className="ana-print-footer"><span>{t("ENTREPRENEURSHIP PROGRAM · ADMIN REPORT")}</span><span>{t("Generated from recorded data. Missing records are reported as unavailable, not estimated.")}</span></footer>
    </div>
  </section>;
}

export default ProgramAnalyticsPage;
