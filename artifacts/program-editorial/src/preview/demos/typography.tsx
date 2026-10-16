import { Typography } from "../../components/ui/typography";
export default function TypographyDemo() {
  return <div className="space-y-9"><Typography as="h1" variant="heading">Editorial typography</Typography>
    <Typography variant="label">Hero · Fraunces 600 / emphasis 500</Typography><Typography as="h2" variant="hero">Good work,<br /><em>moving forward.</em></Typography>
    <Typography as="h2" variant="heading">Every founder. Every next step.</Typography>
    <Typography>One place for applications, founder progress, and the team behind the work. Body text uses a comfortable line height.</Typography>
    <Typography variant="label">01 — Program operations</Typography>
    <div dir="rtl" lang="ar" className="border-t border-border pt-6"><Typography as="h2" variant="heading" lang="ar">خطوة تالية لكل مؤسس</Typography><Typography lang="ar" className="mt-3">مساحة تدعم المؤسسين وتساعدهم على متابعة تقدّمهم.</Typography></div>
  </div>;
}
