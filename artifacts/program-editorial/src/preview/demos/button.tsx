import { useState } from "react";
import { Mail, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Typography } from "../../components/ui/typography";
import { Row } from "../parts";
export default function ButtonDemo() {
  const [count, setCount] = useState(0);
  const [arabic, setArabic] = useState(false);
  return <div className="space-y-8"><Typography as="h1" variant="heading">Buttons</Typography>
    <Row label="Primary · accent"><Button arrow onClick={() => setCount(n => n + 1)}>Apply to a program</Button><Button><Mail aria-hidden="true" />Invite team member</Button><Button disabled>Unavailable</Button></Row>
    <Row label="Secondary · quiet bordered"><Button variant="secondary"><Pencil aria-hidden="true" />Edit</Button><Button variant="secondary" size="sm"><Mail aria-hidden="true" />Resend</Button></Row>
    <Row label="Danger · destructive"><Button variant="danger"><Trash2 aria-hidden="true" />Revoke</Button><Button variant="danger" size="sm">Remove</Button></Row>
    <Row label="Sizes · sm (32px) / md (36px)"><Button size="sm">Small</Button><Button>Medium</Button></Row>
    <Row label="Link semantics"><Button asChild variant="secondary" arrow><a href="#buttons">Shared link action</a></Button></Row>
    <Row label="Text actions"><Button variant="text" arrow onClick={() => setCount(n => n + 1)}>Track your progress</Button><Button variant="text" size="sm"><Mail aria-hidden="true" />Retry email</Button><Button variant="text" disabled>Unavailable</Button></Row>
    <Row label="Pill · language utility"><Button variant="pill" aria-pressed={arabic} onClick={() => setArabic(value => !value)}>{arabic ? "English · EN" : "العربية"}</Button><Button variant="pill" disabled>Unavailable</Button></Row>
    <p role="status" className="text-sm text-muted-foreground">Action invoked {count} time{count === 1 ? "" : "s"}.</p>
    <Typography className="text-sm">Icons and labels are direct children of one inline-flex row and never stack. Native button semantics, visible focus, disabled states, reduced-motion handling. Arrow glyphs are decorative.</Typography>
  </div>;
}
