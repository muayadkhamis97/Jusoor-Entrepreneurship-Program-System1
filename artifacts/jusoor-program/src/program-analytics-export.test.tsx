import assert from "node:assert/strict";
import test from "node:test";
import { buildProgramAnalyticsCsv } from "./program-analytics-export";

const metadata = {
  title: "Quarterly progress",
  scope: "Spring founders, 2026",
  from: "1 Mar 2026",
  through: "31 May 2026",
  generatedAt: "14 Oct 2026",
};

test("exports selected analytics as a spreadsheet-friendly CSV with report scope", () => {
  const csv = buildProgramAnalyticsCsv(metadata, [
    { section: "Program summary", item: "Attendance", detail: "No attendance marks", value: "Unavailable" },
    { section: "Founder engagement", item: "Example business", detail: "Assignments", value: "2 / 4" },
  ]);
  const rows = csv.replace(/^\uFEFF/, "").trim().split("\r\n");

  assert.equal(rows[0], '"Section","Item","Details","Value"');
  assert.equal(rows[1], '"Report details","Title","","Quarterly progress"');
  assert.match(rows[4], /"Generated","","14 Oct 2026"/);
  assert.match(rows[5], /"Program summary","Attendance","No attendance marks","Unavailable"/);
  assert.match(rows[6], /"Founder engagement","Example business","Assignments","2 \/ 4"/);
});

test("quotes embedded commas and neutralizes formula-like spreadsheet content", () => {
  const csv = buildProgramAnalyticsCsv(
    { ...metadata, title: '=HYPERLINK("https://example.com")' },
    [{ section: "Outcomes", item: "A, B startup", detail: "Target", value: "+12" }],
  );

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.com""\)"/);
  assert.match(csv, /"Outcomes","A, B startup","Target","'\+12"/);
});

test("uses Arabic column and report metadata headings when Arabic is selected", () => {
  const csv = buildProgramAnalyticsCsv(metadata, [], "ar");
  assert.match(csv, /^\uFEFF"القسم","العنصر","التفاصيل","القيمة"/);
  assert.match(csv, /"بيانات التقرير","العنوان"/);
});
