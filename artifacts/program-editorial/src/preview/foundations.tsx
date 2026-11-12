import { useState } from "react";
import { tokens } from "../generated/tokens";
import { Button } from "../components/ui/button";
import { Typography } from "../components/ui/typography";
import { PaperSurface } from "../components/ui/paper-surface";
import { Rule } from "../components/ui/rule";
import { Dialog } from "../components/ui/dialog";
import { Guidelines } from "./parts";

const cssName = (name: string) => name.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`).replace(/chart(\d)/, "chart-$1");
function Swatches({ roles }: { roles: string[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{roles.map(role => <div key={role} className="min-w-0 border border-border">
    <div className="h-24 border-b border-border" style={{ background: `hsl(var(--${cssName(role)}))` }} />
    <div className="p-4"><p className="text-sm font-semibold">{role}</p><div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-caption text-muted-foreground">
      <span>L {tokens.color.light[role as keyof typeof tokens.color.light]}</span><span>D {tokens.color.dark[role as keyof typeof tokens.color.dark]}</span>
    </div></div>
  </div>)}</div>;
}
function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="mb-8"><Typography as="h1" variant="heading" className="text-4xl">{title}</Typography><Typography className="mt-3 max-w-2xl">{description}</Typography></div>;
}
export function Overview() {
  const [open, setOpen] = useState(false);
  return <div className="space-y-12">
    <section><Typography variant="label" tone="accent" className="mb-6">Program Editorial / The visual language</Typography>
      <Typography variant="hero">Good work,<br /><em>moving forward.</em></Typography>
      <Typography className="mt-7 max-w-xl">A clear system for program teams and founders. Warm paper, consistent sans-serif typography, and clear teal actions—with readable type at every level.</Typography>
    </section>
    <Swatches roles={["primary", "secondary", "accent"]} />
    <section><div className="mb-6 flex items-center gap-4"><Typography as="h2" variant="label">The component set · 5 families</Typography><Rule className="flex-1" /></div>
      <PaperSurface grain className="border-y border-border">
        <div className="grid gap-7 py-8 lg:grid-cols-[1fr_auto_1fr]">
          <div><Typography variant="label" tone="accent" className="mb-3">Typography & paper surface</Typography><Typography variant="heading">Every founder.<br />Every next step.</Typography><Typography className="mt-3 text-sm">One sans-serif family for clear reading. Mono for compact structural labels.</Typography></div>
          <Rule orientation="vertical" className="hidden lg:block" />
          <div className="space-y-5"><Typography variant="label">Buttons & dialog</Typography><div className="flex flex-wrap items-center gap-4"><Button arrow onClick={() => setOpen(true)}>Explore the dialog</Button><Button variant="pill" disabled>Unavailable</Button></div><Button variant="text" arrow onClick={() => { window.location.hash = "page=component-button"; }}>View button variants</Button></div>
        </div>
      </PaperSurface>
    </section>
    <section className="grid gap-8 md:grid-cols-2">
      <div><Typography variant="heading">One family. Clear hierarchy.</Typography><Typography className="mt-3 text-sm">DM Sans now carries Latin headings and body text, with hierarchy from size and weight. Noto Sans Arabic provides a deliberate Arabic pairing, and body text starts at 16px.</Typography></div>
      <div><Typography variant="heading">Extensions are explicit.</Typography><Typography className="mt-3 text-sm">Dark mode, semantic colors, chart slots, and sidebar roles are derived for completeness. This is not a full admin UI kit: inputs, tables, and navigation components were not present in the source.</Typography></div>
    </section>
    <Dialog open={open} onOpenChange={setOpen} eyebrow="Controlled dialog" title="A clear next step." description="The source panel styling, with native modal focus containment, Escape dismissal, and return to the opener."><Button arrow onClick={() => setOpen(false)}>Got it</Button></Dialog>
  </div>;
}
export function BrandColors() {
  return <div className="space-y-8"><SectionTitle title="The core palette." description="Primary, secondary, and accent are the three organizing colors. Swatches follow the selected theme; both token values are shown." /><Swatches roles={["primary", "secondary", "accent"]} /><Guidelines items={[
    { kind: "do", text: "Use deep teal for the primary action and quieter text actions, as in the source action rail." },
    { kind: "do", text: "Use terracotta for editorial emphasis and small section markers." },
    { kind: "dont", text: "Turn every surface into a filled card; the source uses open paper and divider rules." },
  ]} /></div>;
}
export function SupportingColors() {
  return <div className="space-y-10"><SectionTitle title="Supporting roles." description="Paper, ink, muted text, and line colors are source-mapped. Semantic, chart, interactive-input, and sidebar roles extend the source; they are not evidence of existing components." />
    <Swatches roles={["background", "foreground", "card", "muted", "mutedForeground", "border", "input", "ring", "destructive", "sidebar", "sidebarPrimary", "sidebarAccent", "chart1", "chart2", "chart3", "chart4", "chart5"]} />
    <Typography className="text-sm">Paired foreground tokens are documented in tokens.json. Borders are decorative; interactive input boundaries use a stronger derived color. Data charts still need labels and non-color distinctions.</Typography>
  </div>;
}
export function Fonts() {
  return <div className="space-y-9"><SectionTitle title="Clear sans-serif. Confident Arabic." description="DM Sans is used for all Latin headings and body text. Noto Sans Arabic supports Arabic content, while IBM Plex Mono is reserved for short structural labels." />
    <div className="border-y border-border py-7"><Typography variant="label">01 / DM Sans · Headings & interface · 400–700</Typography><Typography as="h2" variant="heading" className="mt-3">Good work, <em className="text-accent">moving forward.</em></Typography></div>
    <div><Typography variant="label">02 / DM Sans · Body · 400–700</Typography><Typography className="mt-3 text-2xl text-foreground">Clear information for every next step.</Typography></div>
    <div><Typography variant="label">03 / IBM Plex Mono · Short labels · 400–500</Typography><p className="mt-3 font-mono text-sm tracking-wider">OUTREACH · INCUBATION · GRANTS</p></div>
    <div lang="ar" dir="rtl" className="border-t border-border pt-7"><Typography variant="label">04 / نوتو العربي · العناوين والمحتوى · ٤٠٠–٧٠٠</Typography><Typography as="h2" variant="heading" className="mt-3">كل خطوة تبدأ بفكرة واضحة.</Typography><Typography className="mt-3">خط عربي واضح، ومسافات مريحة للقراءة دون تمديد الحروف أو إمالتها اصطناعياً.</Typography></div>
    <Typography className="text-sm">Noto Sans Arabic is an intentional addition, not a source-extracted font. Arabic components inherit their language, use connected script without extra letter spacing or synthetic italics, and have more line-height headroom. This is font coverage, not full platform translation.</Typography>
    <Guidelines items={[{kind:"do",text:"Use one sans-serif family for all proportional text, distinguishing hierarchy with size and weight."},{kind:"do",text:"Use monospaced uppercase text for short labels, not paragraphs."}]} />
  </div>;
}
export function Layout() {
  return <div className="space-y-9"><SectionTitle title="Space gives the content structure." description="Geometry and movement extracted from the source CSS—not a replacement layout for the app." />
    <div className="grid gap-5 sm:grid-cols-2">
      {[["Grid", "1390px maximum content width; 44px desktop gutters; 20px below 760px."],["Spacing", "4px base unit. Source layouts also use optical offsets such as 31px dialog padding."],["Corners", "Primary actions alternate 3px / 14px corners. Utility controls use a capsule."],["Rules", "Thin horizontal and vertical dividers separate content rather than stacked filled cards."],["Motion", "Source hover lift: 2px over 200ms. Entry motion: 9px rise over 650ms."],["Small screens", "The source’s three-column action rail becomes one column at 760px. Reduced motion removes movement."]].map(([title, description]) => <PaperSurface key={title} variant="panel" className="p-6"><Typography variant="label" tone="accent" className="mb-3">{title}</Typography><Typography className="text-sm">{description}</Typography></PaperSurface>)}
    </div>
    <Guidelines items={[{kind:"do",text:"Use generous space around the main message and divide supporting actions with fine rules."}]} />
    <Typography className="text-sm">Arabic tracking guidance is a documented adaptation, not an explicit rule in the source. Component focus rings and native dialog keyboard behavior are accessibility adaptations.</Typography>
  </div>;
}
