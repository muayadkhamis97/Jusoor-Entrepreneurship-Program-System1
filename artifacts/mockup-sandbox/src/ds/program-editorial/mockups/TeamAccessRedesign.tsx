import { useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  Check,
  CircleAlert,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@workspace/program-editorial/components/ui/button";
import { Dialog } from "@workspace/program-editorial/components/ui/dialog";
import { PaperSurface } from "@workspace/program-editorial/components/ui/paper-surface";
import { Rule } from "@workspace/program-editorial/components/ui/rule";
import { Typography } from "@workspace/program-editorial/components/ui/typography";

type StaffMember = {
  email: string;
  role: string;
  programs: string;
  account: string;
  delivery: string;
  added: string;
};

type ParticipantInvitation = {
  name: string;
  email: string;
  program: string;
  business: string;
  status: "Waiting" | "Expired" | "Joined";
};

type DialogState =
  | { type: "team-invite" }
  | { type: "participant-invite" }
  | { type: "edit"; email: string }
  | { type: "revoke"; email: string }
  | null;

const initialStaff: StaffMember[] = [
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

const initialParticipants: ParticipantInvitation[] = [
  {
    name: "Lina Haddad",
    email: "lina.haddad@example.org",
    program: "Jusoor Growth Lab 2026",
    business: "Olive & Loom",
    status: "Waiting",
  },
  {
    name: "Sami Khalil",
    email: "sami.khalil@example.org",
    program: "Jusoor Growth Lab 2026",
    business: "Cedar Cycle",
    status: "Expired",
  },
  {
    name: "Maya Nasser",
    email: "maya.nasser@example.org",
    program: "Jusoor Growth Lab 2026",
    business: "Northline Foods",
    status: "Joined",
  },
];

function StatusTag({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "accent" | "warning" }) {
  const toneClass =
    tone === "accent"
      ? "border-primary/20 bg-primary/10 text-primary"
      : tone === "warning"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : "border-border bg-background text-muted-foreground";

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>{children}</span>;
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = false,
  readOnly = false,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        readOnly={readOnly}
        className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? options[0]}
        className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function TeamAccessRedesign() {
  const [staff, setStaff] = useState(initialStaff);
  const [participants, setParticipants] = useState(initialParticipants);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredParticipants = useMemo(
    () => participants.filter((participant) =>
      `${participant.name} ${participant.email} ${participant.business}`.toLowerCase().includes(search.toLowerCase()),
    ),
    [participants, search],
  );

  const selectedStaff = dialog?.type === "edit" || dialog?.type === "revoke"
    ? staff.find((member) => member.email === dialog.email)
    : undefined;

  function announce(message: string) {
    setError("");
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    const formData = new FormData(event.currentTarget);
    const currentDialog = dialog;

    window.setTimeout(() => {
      setIsSaving(false);
      if (currentDialog?.type === "team-invite") {
        const email = String(formData.get("email") ?? "").trim();
        if (!email) {
          setError("Enter a verified email address to continue.");
          return;
        }
        const role = String(formData.get("role") ?? "Staff");
        const programs = String(formData.get("programs") ?? "All programs");
        setStaff((current) => [
          ...current,
          { email, role, programs, account: "Account not linked", delivery: "Delivered", added: "Today" },
        ]);
        setDialog(null);
        announce("Invitation sent. The new access record is ready.");
      } else if (currentDialog?.type === "participant-invite") {
        const name = String(formData.get("name") ?? "").trim();
        const email = String(formData.get("email") ?? "").trim();
        const program = String(formData.get("program") ?? "").trim();
        const business = String(formData.get("business") ?? "").trim();
        if (!name || !email || !program || !business) {
          setError("Add the participant, program, and existing business details.");
          return;
        }
        setParticipants((current) => [...current, { name, email, program, business, status: "Waiting" }]);
        setDialog(null);
        announce("Participant invitation sent.");
      } else if (currentDialog?.type === "edit") {
        const role = String(formData.get("role") ?? "Staff");
        const programs = String(formData.get("programs") ?? "All programs");
        setStaff((current) => current.map((member) =>
          member.email === currentDialog.email ? { ...member, role, programs } : member,
        ));
        setDialog(null);
        announce("Access changes saved.");
      }
    }, 450);
  }

  function resendStaffInvitation(email: string) {
    announce(`Invitation resent to ${email}.`);
  }

  function resendParticipantInvitation(email: string) {
    setParticipants((current) => current.map((participant) =>
      participant.email === email ? { ...participant, status: "Waiting" } : participant,
    ));
    announce(`Invitation resent to ${email}.`);
  }

  function revokeAccess() {
    if (dialog?.type !== "revoke") return;
    const email = dialog.email;
    setStaff((current) => current.filter((member) => member.email !== email));
    setDialog(null);
    announce(`Access revoked for ${email}.`);
  }

  return (
    <main dir="auto" className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 sm:py-8 lg:px-8 lg:py-6">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:gap-5">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between lg:gap-4">
          <div>
            <Typography variant="label" tone="accent" className="mb-2">TEAM / ACCESS</Typography>
            <Typography as="h1" variant="heading" className="mb-2 text-3xl">Team access</Typography>
            <Typography variant="body">Invite the right people into each part of the founder journey.</Typography>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Button variant="text" className="justify-center sm:justify-start" onClick={() => { setDialog({ type: "participant-invite" }); setError(""); }}>
              <span className="inline-flex items-center gap-2"><Plus aria-hidden="true" className="size-4" /> Invite participant</span>
            </Button>
            <Button variant="primary" arrow className="self-start sm:self-auto" onClick={() => { setDialog({ type: "team-invite" }); setError(""); }}>
              Invite team member
            </Button>
          </div>
        </header>

        {notice && (
          <div role="status" className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>{notice}</p>
          </div>
        )}

        <PaperSurface variant="panel" className="p-4 sm:p-5 lg:p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary lg:size-9">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <Typography as="h2" variant="heading" className="text-base">Every role is tied to a verified email.</Typography>
              <Typography className="mt-1 text-sm leading-relaxed">
                Choose admin, program staff, trainer, mentor or judge access. A branded invitation email is sent after the access record is saved. Members must use the same verified email address.
              </Typography>
            </div>
          </div>
        </PaperSurface>

        <PaperSurface variant="panel" className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:gap-3 lg:px-5 lg:py-4">
            <div>
              <Typography variant="label" tone="accent" className="mb-1">APPROVED ACCOUNTS</Typography>
              <div className="flex flex-wrap items-center gap-3">
                <Typography as="h2" variant="heading" className="text-xl">{staff.length} team members</Typography>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Users aria-hidden="true" className="size-4" />
              Only admins can change access
            </span>
          </div>

          <div className="grid gap-3 p-3 sm:p-4 lg:gap-2 lg:p-3">
            {staff.length === 0 ? (
              <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-border px-5 py-8 text-center lg:gap-2 lg:px-4 lg:py-6">
                <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><Users aria-hidden="true" className="size-5" /></span>
                <div>
                  <Typography as="h3" variant="heading" className="text-base">No team members yet</Typography>
                  <Typography className="mt-1 text-sm">Invite a colleague to coordinate a program with you.</Typography>
                </div>
                <Button variant="primary" onClick={() => setDialog({ type: "team-invite" })}>Invite team member</Button>
              </div>
            ) : staff.map((member) => (
              <article key={member.email} className="grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 sm:items-center lg:grid-cols-3 lg:gap-3 lg:p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 font-semibold text-primary">
                    {member.email[0].toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <Typography as="h3" variant="body" className="break-all font-semibold text-foreground">{member.email}</Typography>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusTag tone="accent">{member.account}</StatusTag>
                      {member.delivery && <StatusTag>{member.delivery}</StatusTag>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:gap-2">
                  <div className="grid content-start gap-1">
                    <span className="text-xs text-muted-foreground">ROLE</span>
                    <span className="inline-flex items-center gap-2 font-medium"><Users aria-hidden="true" className="size-4 text-primary" />{member.role}</span>
                  </div>
                  <div className="col-span-2 grid content-start gap-1 sm:col-span-1">
                    <span className="text-xs text-muted-foreground">PROGRAMS</span>
                    <span className="font-medium">{member.programs}</span>
                  </div>
                  <div className="grid content-start gap-1">
                    <span className="text-xs text-muted-foreground">ADDED</span>
                    <span className="font-medium">{member.added}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 sm:border-0 sm:pt-0 lg:justify-end lg:gap-x-2">
                  {member.delivery && (
                    <Button variant="text" className="inline-flex min-h-10 items-center gap-2" onClick={() => resendStaffInvitation(member.email)}>
                      <Mail aria-hidden="true" className="size-4" /> Resend invitation
                    </Button>
                  )}
                  <Button variant="text" className="inline-flex min-h-10 items-center gap-2" onClick={() => { setDialog({ type: "edit", email: member.email }); setError(""); }}>
                    <Pencil aria-hidden="true" className="size-4" /> Edit access
                  </Button>
                  <Button variant="text" className="inline-flex min-h-10 items-center gap-2" onClick={() => setDialog({ type: "revoke", email: member.email })}>
                    <Trash2 aria-hidden="true" className="size-4" /> Revoke access
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </PaperSurface>

        <PaperSurface variant="panel" className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:gap-3 lg:px-5 lg:py-4">
            <div>
              <Typography variant="label" tone="accent" className="mb-1">PARTICIPANT ACCESS</Typography>
              <Typography as="h2" variant="heading" className="text-xl">Participant invitations</Typography>
              <Typography className="mt-1 text-sm">Each invitation is connected to a program and an existing business.</Typography>
            </div>
            <Button variant="primary" arrow onClick={() => { setDialog({ type: "participant-invite" }); setError(""); }}>
              Invite participant
            </Button>
          </div>

          {participants.length === 0 ? (
            <div className="grid justify-items-center gap-3 px-5 py-9 text-center lg:gap-2 lg:px-4 lg:py-7">
              <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Mail aria-hidden="true" className="size-5" /></span>
              <div>
                <Typography as="h3" variant="heading" className="text-base">No invitations have been sent yet.</Typography>
                <Typography className="mt-1 text-sm">When a founder is invited, their program and business will appear here.</Typography>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:gap-2 lg:px-5 lg:py-3">
                <div>
                  <Typography as="h3" variant="heading" className="text-base">Recent invitations</Typography>
                  <Typography className="mt-1 text-sm">Illustrative sample records for this design preview.</Typography>
                </div>
                <label className="relative block w-full sm:max-w-xs">
                  <span className="sr-only">Search participant invitations</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, email, business"
                    className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
              <div className="grid gap-3 px-3 pb-3 sm:px-4 lg:gap-2 lg:px-3 lg:pb-2">
                {filteredParticipants.length ? filteredParticipants.map((participant) => (
                  <article key={participant.email} className="grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 sm:items-center lg:grid-cols-3 lg:gap-3 lg:p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography as="h3" variant="body" className="font-semibold text-foreground">{participant.name}</Typography>
                        <StatusTag tone={participant.status === "Joined" ? "accent" : participant.status === "Expired" ? "warning" : "neutral"}>
                          {participant.status}
                        </StatusTag>
                      </div>
                      <span className="mt-1 block break-all text-sm text-muted-foreground">{participant.email}</span>
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{participant.program}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{participant.business}</span>
                      </div>
                    </div>
                    {participant.status !== "Joined" ? (
                      <Button variant="text" className="inline-flex min-h-10 items-center gap-2 justify-self-start" onClick={() => resendParticipantInvitation(participant.email)}>
                        <Mail aria-hidden="true" className="size-4" /> Resend invitation
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Check aria-hidden="true" className="size-4 text-primary" /> Access active
                      </span>
                    )}
                  </article>
                )) : (
                  <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-4 text-sm text-muted-foreground">
                    <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                    No invitations match that search.
                  </div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-border px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Status guide</span>
              <StatusTag>Waiting</StatusTag>
              <StatusTag tone="warning">Expired</StatusTag>
              <StatusTag tone="accent">Joined</StatusTag>
            </div>
          </div>
        </PaperSurface>

        <footer className="flex items-center gap-3 text-sm text-muted-foreground">
          <Rule className="flex-1" />
          <span>Program operations · Access with care</span>
          <Rule className="flex-1" />
        </footer>
      </div>

      <Dialog
        open={!!dialog}
        onOpenChange={(open) => { if (!open) { setDialog(null); setError(""); } }}
        title={dialog?.type === "revoke" ? "Revoke team access?" : dialog?.type === "edit" ? "Edit team access" : dialog?.type === "participant-invite" ? "Invite a participant" : "Invite a team member"}
        eyebrow={dialog?.type === "participant-invite" ? "PARTICIPANT ACCESS" : "TEAM / ACCESS"}
        description={
          dialog?.type === "revoke"
            ? `This will remove ${dialog.email} from the approved team access list.`
            : dialog?.type === "participant-invite"
              ? "Connect the invitation to a program and an existing business."
              : dialog?.type === "edit"
                ? "Update the member's role and program scope."
                : "A branded invitation will be sent after the access record is saved."
        }
      >
        {dialog?.type === "revoke" ? (
          <div className="grid gap-4">
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-foreground">{selectedStaff?.email}</p>
              <p className="mt-1 text-muted-foreground">{selectedStaff?.role} · {selectedStaff?.programs}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="text" onClick={() => setDialog(null)}>Keep access</Button>
              <Button variant="primary" onClick={revokeAccess}>Confirm revoke</Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {dialog?.type === "participant-invite" ? (
              <>
                <Field label="Participant name" name="name" />
                <Field label="Participant email" name="email" type="email" />
                <Field label="Program" name="program" defaultValue="Jusoor Growth Lab 2026" />
                <Field label="Existing business" name="business" />
              </>
            ) : (
              <>
                <Field label="Verified email" name="email" type="email" defaultValue={dialog?.type === "edit" ? selectedStaff?.email : undefined} readOnly={dialog?.type === "edit"} />
                <SelectField
                  label="Role"
                  name="role"
                  options={["Admin", "Staff", "Trainer", "Mentor", "Judge"]}
                  defaultValue={dialog?.type === "edit" ? selectedStaff?.role : "Staff"}
                />
                <SelectField
                  label="Program scope"
                  name="programs"
                  options={["All programs", "Jusoor Growth Lab 2026"]}
                  defaultValue={dialog?.type === "edit" ? selectedStaff?.programs : "All programs"}
                />
              </>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-foreground">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="text" onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={isSaving}>
                {isSaving ? "Saving access…" : dialog?.type === "edit" ? "Save access" : "Send invitation"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </main>
  );
}
