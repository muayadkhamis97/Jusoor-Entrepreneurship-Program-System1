import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  CircleAlert,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Settings,
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
    email: "morgan.lee@example.org",
    role: "Admin",
    programs: "All programs",
    account: "Account not linked",
    delivery: "Delivered",
    added: "18 Oct 2026",
  },
  {
    email: "samir.abbas@example.org",
    role: "Admin",
    programs: "All programs",
    account: "Active",
    delivery: "",
    added: "14 Oct 2026",
  },
  {
    email: "noor.haddad@example.org",
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

const navGroups = [
  {
    label: "Program operations",
    items: [
      { label: "Overview", icon: LayoutDashboard },
      { label: "Businesses", icon: Building2 },
      { label: "Programs", icon: BookOpen },
      { label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Branding", icon: GraduationCap },
      { label: "Integration settings", icon: Settings },
      { label: "Team access", icon: Users, active: true },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Sessions", icon: Activity },
      { label: "Communications", icon: Mail },
      { label: "Chat", icon: MessageCircle },
      { label: "Support", icon: CircleAlert },
      { label: "Mentor meeting reports", icon: FileText },
    ],
  },
];

function StatusTag({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "accent" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-primary/20 bg-primary/10 text-primary"
      : tone === "warning"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : "border-border bg-background text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
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

function Sidebar() {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-5 py-5 md:hidden">
        <span className="grid size-9 place-items-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground">J</span>
        <div className="leading-tight">
          <span className="block text-sm font-semibold tracking-wide text-sidebar-foreground">JUSOOR</span>
          <span className="mt-1 block text-xs text-sidebar-foreground/70">PROGRAM HUB</span>
        </div>
        <span className="ml-auto rounded-full border border-sidebar-border px-2.5 py-1 text-xs text-sidebar-foreground/75">Admin</span>
      </div>
      <aside className="hidden w-52 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          <span className="grid size-9 place-items-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground">J</span>
          <div className="leading-tight">
            <span className="block text-sm font-semibold tracking-wide">JUSOOR</span>
            <span className="mt-1 block text-xs text-sidebar-foreground/70">PROGRAM HUB</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => (
            <section key={group.label} className="mb-6">
              <Typography variant="label" className="mb-2 px-3 text-sidebar-foreground/65">
                {group.label}
              </Typography>
              <div className="grid gap-1">
                {group.items.map(({ label, icon: Icon, active }) => (
                  <div
                    key={label}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-sm ${
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80"
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="border-t border-sidebar-border px-5 py-4 text-xs text-sidebar-foreground/70">
          Program operations
        </div>
      </aside>
    </>
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
    }, 350);
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
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:gap-4 lg:px-7 lg:py-5">
          <header className="grid gap-4 border-b border-border pb-4 sm:flex sm:items-end sm:justify-between">
            <div>
              <Typography variant="label" tone="accent" className="mb-1">TEAM / ACCESS</Typography>
              <Typography as="h1" variant="heading" className="mb-1 text-3xl">Team access</Typography>
              <Typography variant="body" className="text-sm">
                Invite the right people into each part of the founder journey.
              </Typography>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:flex sm:shrink-0">
              <Button
                variant="text"
                className="justify-center"
                onClick={() => { setDialog({ type: "participant-invite" }); setError(""); }}
              >
                <span className="inline-flex items-center gap-2"><Plus aria-hidden="true" className="size-4" /> Invite participant</span>
              </Button>
              <Button
                variant="primary"
                arrow
                className="justify-center"
                onClick={() => { setDialog({ type: "team-invite" }); setError(""); }}
              >
                Invite team member
              </Button>
            </div>
          </header>

          {notice && (
            <div role="status" className="flex items-start gap-3 rounded-md border border-border bg-muted px-4 py-2 text-sm">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{notice}</p>
            </div>
          )}

          <PaperSurface variant="panel" className="px-4 py-3 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <div>
                <Typography as="h2" variant="heading" className="text-sm">
                  Every role is tied to a verified email.
                </Typography>
                <Typography className="mt-1 text-sm leading-snug">
                  Choose admin, program staff, trainer, mentor or judge access. A branded invitation email is sent after the access record is saved. Members must use the same verified email address.
                </Typography>
              </div>
            </div>
          </PaperSurface>

          <PaperSurface variant="panel" className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <Typography variant="label" tone="accent" className="mb-1">APPROVED ACCOUNTS</Typography>
                <Typography as="h2" variant="heading" className="text-xl">{staff.length} team members</Typography>
              </div>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Users aria-hidden="true" className="size-4" />
                Only admins can change access
              </span>
            </div>

            {staff.length === 0 ? (
              <div className="grid justify-items-center gap-3 px-5 py-9 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Users aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <Typography as="h3" variant="heading" className="text-base">No team members yet</Typography>
                  <Typography className="mt-1 text-sm">Invite a colleague to coordinate a program with you.</Typography>
                </div>
                <Button variant="primary" onClick={() => setDialog({ type: "team-invite" })}>Invite team member</Button>
              </div>
            ) : (
              <div>
                <div className="hidden grid-cols-12 gap-3 border-b border-border bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                  <span className="col-span-4">TEAM MEMBER · ACCOUNT / DELIVERY</span>
                  <span className="col-span-2">ROLE · PROGRAM SCOPE</span>
                  <span className="col-span-2">ADDED</span>
                  <span className="col-span-4 text-right">ACTIONS</span>
                </div>
                {staff.map((member) => (
                  <article
                    key={member.email}
                    className="grid grid-cols-1 gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-12 lg:items-center lg:gap-3 lg:py-2.5"
                  >
                    <div className="flex min-w-0 items-start gap-2 lg:col-span-4">
                      <div className="min-w-0">
                        <Typography as="h3" variant="body" className="break-all text-sm font-semibold text-foreground">
                          {member.email}
                        </Typography>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusTag tone={member.account === "Active" ? "accent" : "neutral"}>{member.account}</StatusTag>
                          {member.delivery && <StatusTag>{member.delivery}</StatusTag>}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-1 text-sm lg:col-span-2">
                      <span className="text-xs text-muted-foreground lg:hidden">ROLE · PROGRAM SCOPE</span>
                      <span className="font-medium">
                        {member.role}
                        <span className="mx-1.5 text-muted-foreground" aria-hidden="true">·</span>
                        <span className="font-normal text-muted-foreground">{member.programs}</span>
                      </span>
                    </div>

                    <div className="grid gap-1 text-sm lg:col-span-2">
                      <span className="text-xs text-muted-foreground lg:hidden">ADDED</span>
                      <span className="font-medium">{member.added}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0 border-t border-border pt-2 lg:col-span-4 lg:justify-end lg:border-0 lg:pt-0">
                      {member.delivery && (
                        <Button
                          variant="text"
                          className="inline-flex min-h-9 items-center gap-1.5"
                          onClick={() => resendStaffInvitation(member.email)}
                        >
                          <Mail aria-hidden="true" className="size-3.5" /> Resend invitation
                        </Button>
                      )}
                      <Button
                        variant="text"
                        className="inline-flex min-h-9 items-center gap-1.5"
                        onClick={() => { setDialog({ type: "edit", email: member.email }); setError(""); }}
                      >
                        <Pencil aria-hidden="true" className="size-3.5" /> Edit access
                      </Button>
                      <Button
                        variant="text"
                        className="inline-flex min-h-9 items-center gap-1.5"
                        onClick={() => setDialog({ type: "revoke", email: member.email })}
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" /> Revoke access
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </PaperSurface>

          <PaperSurface variant="panel" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <Typography variant="label" tone="accent" className="mb-1">PARTICIPANT ACCESS</Typography>
                <Typography as="h2" variant="heading" className="text-xl">Participant invitations</Typography>
                <Typography className="mt-1 text-sm">Each invitation is connected to a program and an existing business.</Typography>
              </div>
              <Button
                variant="primary"
                arrow
                className="self-start sm:self-auto"
                onClick={() => { setDialog({ type: "participant-invite" }); setError(""); }}
              >
                Invite participant
              </Button>
            </div>

            {participants.length === 0 ? (
              <div className="grid justify-items-center gap-3 px-5 py-9 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Mail aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <Typography as="h3" variant="heading" className="text-base">No invitations have been sent yet.</Typography>
                  <Typography className="mt-1 text-sm">When a founder is invited, their program and business will appear here.</Typography>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
                <div>
                  <div className="hidden grid-cols-12 gap-3 border-y border-border bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                    <span className="col-span-4">PARTICIPANT · INVITATION STATUS</span>
                    <span className="col-span-5">PROGRAM · EXISTING BUSINESS</span>
                    <span className="col-span-3 text-right">ACTIONS</span>
                  </div>
                  {filteredParticipants.length ? filteredParticipants.map((participant) => (
                    <article
                      key={participant.email}
                      className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-12 lg:items-center lg:gap-3 lg:py-2.5"
                    >
                      <div className="min-w-0 lg:col-span-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Typography as="h3" variant="body" className="text-sm font-semibold text-foreground">{participant.name}</Typography>
                          <StatusTag
                            tone={participant.status === "Joined" ? "accent" : participant.status === "Expired" ? "warning" : "neutral"}
                          >
                            {participant.status}
                          </StatusTag>
                        </div>
                        <span className="mt-1 block break-all text-sm text-muted-foreground">{participant.email}</span>
                      </div>
                      <div className="grid gap-1 text-sm lg:col-span-5">
                        <span className="text-xs text-muted-foreground lg:hidden">PROGRAM · EXISTING BUSINESS</span>
                        <span className="font-medium">{participant.program}</span>
                        <span className="text-muted-foreground">{participant.business}</span>
                      </div>
                      {participant.status !== "Joined" ? (
                        <Button
                          variant="text"
                          className="inline-flex min-h-9 items-center gap-2 justify-self-start lg:col-span-3 lg:justify-self-end"
                          onClick={() => resendParticipantInvitation(participant.email)}
                        >
                          <Mail aria-hidden="true" className="size-4" /> Resend invitation
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground lg:col-span-3 lg:justify-self-end">
                          <Check aria-hidden="true" className="size-4 text-primary" /> Access active
                        </span>
                      )}
                    </article>
                  )) : (
                    <div className="flex items-center gap-3 px-4 py-4 text-sm text-muted-foreground">
                      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                      No invitations match that search.
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="border-t border-border px-4 py-2 sm:px-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="mr-1 font-medium text-foreground">Status guide</span>
                <StatusTag>Waiting</StatusTag>
                <StatusTag tone="warning">Expired</StatusTag>
                <StatusTag tone="accent">Joined</StatusTag>
              </div>
            </div>
          </PaperSurface>

          <footer className="flex items-center gap-3 pb-1 text-xs text-muted-foreground">
            <Rule className="flex-1" />
            <span className="whitespace-nowrap">Program operations · Access with care</span>
            <Rule className="flex-1" />
          </footer>
        </div>
      </main>

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
                <Field label="Participant name" name="name" required />
                <Field label="Participant email" name="email" type="email" required />
                <Field label="Program" name="program" defaultValue="Jusoor Growth Lab 2026" required />
                <Field label="Existing business" name="business" required />
              </>
            ) : (
              <>
                <Field
                  label="Verified email"
                  name="email"
                  type="email"
                  defaultValue={dialog?.type === "edit" ? selectedStaff?.email : undefined}
                  required
                  readOnly={dialog?.type === "edit"}
                />
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
              <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />{error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="text" type="button" onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={isSaving}>
                {isSaving ? "Saving access…" : dialog?.type === "edit" ? "Save access" : "Send invitation"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
