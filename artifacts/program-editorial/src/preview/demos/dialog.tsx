import { useState } from "react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Typography } from "../../components/ui/typography";
export default function DialogDemo() {
  const [open, setOpen] = useState(false);
  return <div className="space-y-7"><Typography as="h1" variant="heading">Dialogs</Typography><Typography className="max-w-xl">The dialog uses a narrow paper panel, a clear sans-serif title, a quiet overlay, and one clear action, with native modal behavior.</Typography>
    <Button arrow onClick={() => setOpen(true)}>Open sample dialog</Button>
    <Dialog open={open} onOpenChange={setOpen} eyebrow="Private workspace" title="Welcome back." description="Focus enters the dialog, remains inside while open, and returns to the opener when closed. Escape and the close control dismiss it.">
      <Button arrow onClick={() => setOpen(false)}>Got it</Button>
    </Dialog>
    <Typography className="text-sm">A controlled open/onOpenChange API replaces the page-local conditional state. Native dialog focus handling is an accessibility adaptation, not behavior demonstrated by the source mockup.</Typography>
  </div>;
}
