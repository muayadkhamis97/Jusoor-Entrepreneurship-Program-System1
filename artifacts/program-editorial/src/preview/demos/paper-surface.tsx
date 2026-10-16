import { PaperSurface } from "../../components/ui/paper-surface";
import { Typography } from "../../components/ui/typography";
export default function PaperSurfaceDemo() {
  return <div className="space-y-8"><Typography as="h1" variant="heading">Paper surfaces</Typography>
    <div className="grid gap-6 sm:grid-cols-2">{(["paper", "panel"] as const).flatMap(variant => [false, true].map(grain => <PaperSurface key={`${variant}-${grain}`} variant={variant} grain={grain} className="min-h-48 p-7"><Typography variant="label">{variant} / {grain ? "grain" : "plain"}</Typography><Typography variant="heading" className="mt-5">Room to move.</Typography><Typography className="mt-3 text-sm">A quiet surface keeps attention on the content.</Typography></PaperSurface>))}</div>
    <Typography className="text-sm">The source texture is a 7px dot grid. Here it derives its color from the border token and stays local to the surface, without a fixed global overlay.</Typography>
  </div>;
}
