export type ProgramAnalyticsCsvRow = {
  section: string;
  item: string;
  detail?: string | null;
  value?: string | number | null;
};

export type ProgramAnalyticsCsvMetadata = {
  title: string;
  scope: string;
  from: string;
  through: string;
  generatedAt: string;
};

export type ReportLanguage = "en" | "ar";

function csvCell(value: string | number | null | undefined): string {
  const safeValue = value == null ? "" : String(value);
  const spreadsheetSafeValue = /^[\t\r ]*[=+\-@]/.test(safeValue) ? `'${safeValue}` : safeValue;
  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
}

export function buildProgramAnalyticsCsv(
  metadata: ProgramAnalyticsCsvMetadata,
  rows: ProgramAnalyticsCsvRow[],
  language: ReportLanguage = "en",
): string {
  const labels = language === "ar"
    ? { section: "القسم", item: "العنصر", detail: "التفاصيل", value: "القيمة", report: "بيانات التقرير", title: "العنوان", scope: "البرنامج / المجموعة", dateRange: "الفترة", generated: "تاريخ الإنشاء" }
    : { section: "Section", item: "Item", detail: "Details", value: "Value", report: "Report details", title: "Title", scope: "Program / cohort", dateRange: "Date range", generated: "Generated" };
  const records: Array<Array<string | number | null | undefined>> = [
    [labels.section, labels.item, labels.detail, labels.value],
    [labels.report, labels.title, "", metadata.title],
    [labels.report, labels.scope, "", metadata.scope],
    [labels.report, labels.dateRange, "", `${metadata.from} – ${metadata.through}`],
    [labels.report, labels.generated, "", metadata.generatedAt],
    ...rows.map((row) => [row.section, row.item, row.detail, row.value]),
  ];

  return `\uFEFF${records.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadProgramAnalyticsCsv(
  metadata: ProgramAnalyticsCsvMetadata,
  rows: ProgramAnalyticsCsvRow[],
  language: ReportLanguage = "en",
): void {
  const csv = buildProgramAnalyticsCsv(metadata, rows, language);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jusoor-program-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
