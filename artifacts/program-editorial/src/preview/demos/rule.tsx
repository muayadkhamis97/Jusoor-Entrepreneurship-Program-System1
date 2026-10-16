import { Rule } from "../../components/ui/rule";
import { Typography } from "../../components/ui/typography";
export default function RuleDemo() {
  return <div className="space-y-8"><Typography as="h1" variant="heading">Divider rules</Typography><Typography variant="label">Horizontal · neutral</Typography><Rule />
    <div className="flex items-center gap-4"><Rule tone="accent" className="w-[30px]" /><Typography variant="label" tone="accent">A small editorial marker</Typography><Rule tone="accent" className="w-[30px]" /></div>
    <div className="flex items-stretch gap-7 border-y border-border py-8"><Typography className="flex-1">A distinct content region.</Typography><Rule orientation="vertical" /><Typography className="flex-1">A clear next action.</Typography></div>
    <Typography className="text-sm">Rules expose separator semantics and orientation. Vertical rules use logical borders for RTL layouts.</Typography>
  </div>;
}
