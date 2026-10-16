import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Typography } from "../../components/ui/typography";
import { Row } from "../parts";
export default function ButtonDemo() {
  const [count, setCount] = useState(0);
  const [arabic, setArabic] = useState(false);
  return <div className="space-y-8"><Typography as="h1" variant="heading">Buttons</Typography>
    <Row label="Primary · asymmetric corners"><Button arrow onClick={() => setCount(n => n + 1)}>Apply to a program</Button><Button>Without arrow</Button><Button disabled arrow>Unavailable</Button></Row>
    <Row label="Text actions"><Button variant="text" arrow onClick={() => setCount(n => n + 1)}>Track your progress</Button><Button variant="text" disabled>Unavailable</Button></Row>
    <Row label="Pill · language utility"><Button variant="pill" aria-pressed={arabic} onClick={() => setArabic(value => !value)}>{arabic ? "English · EN" : "العربية"}</Button><Button variant="pill" disabled>Unavailable</Button></Row>
    <p role="status" className="text-sm text-muted-foreground">Action invoked {count} time{count === 1 ? "" : "s"}.</p>
    <Typography className="text-sm">Native button semantics, keyboard activation, visible focus, disabled states, and reduced-motion hover handling. Arrow glyphs are decorative.</Typography>
  </div>;
}
