import { ArrowRight, Pencil, Shield, Trash2, Users } from "lucide-react";
import { Button } from "@workspace/program-editorial/components/ui/button";
import { PaperSurface } from "@workspace/program-editorial/components/ui/paper-surface";
import { Typography } from "@workspace/program-editorial/components/ui/typography";

const staff = [
  {
    email: "team.lead@example.org",
    role: "Admin",
    programs: "All programs",
    account: "Account not linked",
    delivery: "Delivered",
    added: "18 Oct 2026",
  },
  {
    email: "admin.two@example.org",
    role: "Admin",
    programs: "All programs",
    account: "Active",
    delivery: "",
    added: "14 Oct 2026",
  },
  {
    email: "program.staff@example.org",
    role: "Staff",
    programs: "Jusoor Growth Lab 2026",
    account: "Active",
    delivery: "",
    added: "22 Oct 2026",
  },
];

function Status({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "accent" }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${tone === "accent" ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
      {children}
    </span>
  );
}

export function Current() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Typography variant="label" className="mb-2 text-primary">TEAM / ACCESS</Typography>
            <Typography as="h1" variant="heading" className="mb-2 text-3xl">Team access</Typography>
            <Typography variant="body" className="text-muted-foreground">
              Invite the right people into each part of the founder journey.
            </Typography>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="text">Invite participant <ArrowRight aria-hidden="true" /></Button>
            <Button variant="primary">Invite team member <ArrowRight aria-hidden="true" /></Button>
          </div>
        </header>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <Shield aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <strong className="block font-semibold">Every role is tied to a verified email.</strong>
            <p className="mt-1 text-muted-foreground">
              Choose admin, program staff, trainer, mentor or judge access. A branded invitation email will be sent after the access record is saved. Members must use the same verified email address.
            </p>
          </div>
        </div>

        <PaperSurface variant="panel" className="overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <Typography variant="label" className="mb-1 text-primary">APPROVED ACCOUNTS</Typography>
              <Typography as="h2" variant="heading" className="text-xl">3 team members</Typography>
            </div>
            <span className="text-sm text-muted-foreground">Only admins can change access</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {["EMAIL", "ROLE", "PROGRAMS", "ACCOUNT", "EMAIL DELIVERY", "ADDED", "ACTIONS"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((member, index) => (
                  <tr key={member.email} className="border-t border-border/70 text-sm">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 font-medium">
                        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">{member.email[0].toUpperCase()}</span>
                        {member.email}
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-2"><Users className="size-4 text-primary" />{member.role}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{member.programs}</td>
                    <td className="px-4 py-3"><Status tone={member.account === "Active" ? "accent" : "neutral"}>{member.account}</Status></td>
                    <td className="px-4 py-3">{member.delivery && <Status>{member.delivery}</Status>}{index === 0 && <Button variant="primary" className="ml-2">Resend invitation</Button>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.added}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="text" aria-label={`Edit ${member.email}`}><Pencil aria-hidden="true" /></Button>
                        <Button variant="text" aria-label={`Remove ${member.email}`}><Trash2 aria-hidden="true" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PaperSurface>

        <PaperSurface variant="panel" className="mt-5 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Typography variant="label" className="mb-1 text-primary">PARTICIPANT ACCESS</Typography>
              <Typography as="h2" variant="heading" className="text-xl">Participant invitations</Typography>
            </div>
            <span className="text-sm text-muted-foreground">Program and existing business access</span>
          </div>
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">No invitations have been sent yet.</p>
        </PaperSurface>
      </div>
    </main>
  );
}
