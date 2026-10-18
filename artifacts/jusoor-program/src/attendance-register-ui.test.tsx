import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("./analytics-surfaces.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics.css", import.meta.url), "utf8");
const translations = readFileSync(new URL("./language.tsx", import.meta.url), "utf8");

test("attendance register marks each participant and keeps the business association visible", () => {
  assert.match(component, /Button as EditorialButton/);
  assert.match(component, /role="group" aria-label=\{\`\$\{t\("Attendance status for"\)\} \$\{person\.participantName\}\`\}/);
  assert.match(component, /aria-pressed=\{attendance\[person\.participantId\]\?\.status === status\}/);
  assert.match(component, /participantName\}\<\/b\><small>\{person\.businessName\} · \{person\.participantEmail\}/);
  assert.match(component, /participantId: person\.participantId, status:/);
  assert.match(component, /ana-register-note/);
  assert.match(component, /No participants are on this session’s roster\./);
  assert.match(styles, /\.ana-status-set \.ana-status-option \{[^}]*min-height:44px/);
});

test("attendance register expands on desktop and reflows into touch-sized mobile controls", () => {
  assert.match(styles, /\.ana-attendance-modal \{ width:min\(860px,calc\(100vw - 32px\)\)/);
  assert.match(styles, /\.ana-register-note input \{[^}]*height:44px/);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.ana-status-set \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.ana-register-bulk \.ana-bulk-option \{ min-height:44px/);
});

test("new attendance controls have Arabic labels", () => {
  for (const key of [
    "'Unmarked': 'غير محدد'",
    "'Participants on roster': 'المشاركون في قائمة الجلسة'",
    "'Set all participants to': 'تحديد الحالة لجميع المشاركين'",
    "'Staff review': 'مراجعة الفريق'",
    "'Match attendee to a participant': 'مطابقة الحاضر مع مشارك'",
    "'Choose participant': 'اختر مشاركاً'",
    "'No participants are on this session’s roster.': 'لا يوجد مشاركون في قائمة هذه الجلسة.'",
    "'Optional note': 'ملاحظة اختيارية'",
    "'Set all participants to': 'تحديد الحالة لجميع المشاركين'",
    "'Save register': 'حفظ سجل الحضور'",
  ]) {
    assert.ok(translations.includes(key), `Missing translation: ${key}`);
  }
  assert.match(translations, /^\s*Present: 'حاضر',/m);
  assert.match(translations, /^\s*Absent: 'غائب',/m);
  assert.match(translations, /^\s*Excused: 'بعذر',/m);
});
