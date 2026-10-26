import { Typography } from "../../components/ui/typography";
export default function TypographyDemo() {
  return <div className="grid gap-9"><Typography as="h1" variant="heading">System typography</Typography>
    <section className="grid gap-3">
      <Typography variant="label">Hero · DM Sans 500–700 · 44–88px · 1.12 line height</Typography><Typography as="h2" variant="hero">Good work,<br /><em>moving forward.</em></Typography>
    </section>
    <section className="grid gap-3">
      <Typography variant="label">01 — Program operations</Typography>
      <Typography as="h2" variant="heading">Every founder. Every next step.</Typography>
      <Typography>One place for applications, founder progress, and the team behind the work. Body text starts at 16px, with a comfortable line height and a reading width of up to 65 characters.</Typography>
    </section>
    <div dir="rtl" lang="ar" className="grid gap-4 border-t border-border pt-6">
      <Typography variant="label">العربية · خط نوتو العربي</Typography>
      <Typography as="h2" variant="heading">خطوة تالية لكل مؤسس</Typography>
      <Typography>مساحة تدعم المؤسسين وتساعدهم على متابعة تقدّمهم. تتيح المسافات المريحة قراءة المحتوى بوضوح، مع الحفاظ على اتصال الحروف وعلامات التشكيل.</Typography>
    </div>
    <section className="grid gap-3">
      <Typography variant="label">Language on a component also sets its default direction</Typography>
      <Typography lang="ar">تجربة تعليمية أوضح، خطوةً بخطوة.</Typography>
    </section>
    <dl className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
      <div><dt className="font-semibold">Headings</dt><dd className="mt-1 text-sm text-muted-foreground">24–32px · line height 1.3 · restrained tracking.</dd></div>
      <div><dt className="font-semibold">Short labels</dt><dd className="mt-1 text-sm text-muted-foreground">11px · line height 1.55 · lighter Latin letter spacing.</dd></div>
    </dl>
    <Typography className="text-sm">One sans-serif family keeps interface and content consistent. Size, weight and spacing provide hierarchy; Noto Sans Arabic supports Arabic content.</Typography>
  </div>;
}
