import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { currentLanguage, t, useAppLanguage } from "./language";
import { AccessibleDialogSurface, UnsavedChangesDialog } from "./accessible-dialog";
import {
  getListGrantAwardsQueryKey,
  useCreateGrantReceipt,
  useListGrantAwards,
} from "@workspace/api-client-react";
import type {
  GrantAwardRecord,
  GrantReceiptInput,
} from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpLeft,
  Check,
  CircleDollarSign,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { Link } from "wouter";
import "./grant-surfaces.css";

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const dateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === "ar" ? "ar-JO" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const statusLabel: Record<GrantAwardRecord["status"], string> = {
  amount_needed: "Amount needed",
  not_received: "Not received",
  partially_received: "Partially received",
  received: "Fully received",
  over_received: "Over award",
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      return data.error;
    }
  }
  return "The grant ledger entry could not be saved.";
}

function ReceiptDialog({
  award,
  kind,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  award: GrantAwardRecord;
  kind: "received" | "reversal";
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: GrantReceiptInput) => void;
}) {
  const [amount, setAmount] = useState("");
  const [initialReceiptDate] = useState(() => localDate());
  const [receivedOn, setReceivedOn] = useState(initialReceiptDate);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = Boolean(amount || reference.trim() || notes.trim() || receivedOn !== initialReceiptDate);
  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <>
    <AccessibleDialogSurface className="modal-card grant-receipt-dialog" labelledBy="grant-dialog-title" initialFocusSelector="[data-dialog-autofocus]" onClose={requestClose} closeOnEscape={!dirty && !saving} closeOnOutsideInteraction={!dirty && !saving} onDismissAttempt={() => { if (dirty && !saving) setConfirmDiscard(true); }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{t("GRANT LEDGER")} / {t(kind === "received" ? "RECEIPT" : "CORRECTION")}</div>
            <h2 id="grant-dialog-title" className="app-title">
              {t(kind === "received" ? "Record funds received" : "Reverse a ledger entry")}
            </h2>
            <p>{award.businessName} · Award {money(award.grantAmount)}</p>
          </div>
          <button type="button" className="icon-button" aria-label={t("Close dialog")} onClick={requestClose} disabled={saving}><X size={18} /></button>
        </div>
        {kind === "reversal" && (
          <div className="grant-correction-note" role="note">
            <Undo2 size={15} />
            <span>{t("This adds a dated correction entry; it does not delete the original receipt. Explain the correction below.")}</span>
          </div>
        )}
        <form className="modal-form" onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            kind,
            amount: Number(amount),
            receivedOn,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
          });
        }}>
          <div className="form-grid">
            <label className="field">
              <span>{t("Amount (USD)")} *</span>
              <input className="form-control" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required data-dialog-autofocus />
            </label>
            <label className="field">
              <span>{t(kind === "received" ? "Date received" : "Correction date")} *</span>
              <input className="form-control" type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} required />
            </label>
            <label className="field field-wide">
              <span>{t("Reference")} <small>({t("optional")})</small></span>
              <input className="form-control" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t("Internal voucher or transfer reference")} />
            </label>
            <label className="field field-wide">
              <span>{t(kind === "reversal" ? "Reason for correction" : "Notes")} *{kind === "received" && <small> ({t("optional")})</small>}</span>
              <textarea className="form-control resize-y" rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} required={kind === "reversal"} placeholder={t(kind === "reversal" ? "Explain why this amount is being reversed." : "Add any internal receipt context.")} />
            </label>
          </div>
          {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
          <div className="modal-actions">
             <button type="button" className="button button-quiet" onClick={requestClose} disabled={saving}>{t("Cancel")}</button>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? t("Saving…") : <><Check size={16} /> {t(kind === "received" ? "Save receipt" : "Save correction")}</>}
            </button>
          </div>
        </form>
    </AccessibleDialogSurface>
    {confirmDiscard && <UnsavedChangesDialog onKeepEditing={() => setConfirmDiscard(false)} onDiscard={() => { setConfirmDiscard(false); onClose(); }} />}
    </>
  );
}

export function GrantManagementPage() {
  useAppLanguage();
  const query = useListGrantAwards();
  const createReceipt = useCreateGrantReceipt();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeEntry, setActiveEntry] = useState<{ award: GrantAwardRecord; kind: "received" | "reversal" } | null>(null);
  const awards = query.data ?? [];

  const filteredAwards = useMemo(() => awards.filter((award) => {
    const queryText = search.trim().toLowerCase();
    const matchesSearch = !queryText || [
      award.businessName,
      award.founderName ?? "",
      award.programName ?? "",
      award.eventType,
    ].some((value) => value.toLowerCase().includes(queryText));
    return matchesSearch && (statusFilter === "all" || award.status === statusFilter);
  }), [awards, search, statusFilter]);

  const committed = awards.reduce((sum, award) => sum + (award.grantAmount ?? 0), 0);
  const received = awards.reduce((sum, award) => sum + award.totalReceived, 0);
  const remaining = awards.reduce((sum, award) => sum + Math.max(0, award.remainingAmount ?? 0), 0);
  const complete = awards.filter((award) => award.status === "received").length;

  const saveReceipt = (data: GrantReceiptInput) => {
    if (!activeEntry) return;
    createReceipt.mutate({ pitchId: activeEntry.award.pitchId, data }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getListGrantAwardsQueryKey() });
        setActiveEntry(null);
      },
    });
  };

  return (
    <>
      <header className="page-heading grant-page-heading">
        <div>
          <div className="eyebrow">{t("FINANCE / AWARD ADMINISTRATION")}</div>
          <h1 className="app-title">{t("Grant management")}</h1>
          <p>{t("Follow each demo-day award from commitment through received installments.")}</p>
        </div>
      </header>

      <section className="grant-ledger-intro">
        <span className="grant-ledger-mark"><CircleDollarSign size={21} /></span>
        <div>
          <div className="eyebrow">{t("AWARDS TO RECEIPTS")}</div>
          <b>{t("Keep the funding record connected to the judge’s decision.")}</b>
          <span>{t("Record each amount received, keep the history, and add a correction entry instead of removing a receipt.")}</span>
        </div>
        <Link href="/pitches" className="button button-quiet grant-pitch-link"><FileText size={15} /> {t("Review award decisions")}</Link>
      </section>

      <section className="grant-ledger-metrics" aria-label="Grant totals">
        <article><span>AWARDED</span><b>{awards.length}</b><small>{complete} fully received</small></article>
        <article><span>COMMITTED</span><b>{money(committed)}</b><small>Approved award amounts</small></article>
        <article><span>RECEIVED</span><b>{money(received)}</b><small>Net receipts recorded</small></article>
        <article><span>REMAINING</span><b>{money(remaining)}</b><small>Against committed awards</small></article>
      </section>

      <div className="grant-ledger-toolbar">
        <label className="grant-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search business or program")} aria-label={t("Search grants")} /></label>
        <label className="grant-status-filter"><span className="sr-only">{t("Filter grants by receipt status")}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("All awards")}</option>
            <option value="amount_needed">{t("Amount needed")}</option>
            <option value="not_received">{t("Not received")}</option>
            <option value="partially_received">{t("Partially received")}</option>
            <option value="received">{t("Fully received")}</option>
            <option value="over_received">{t("Over award")}</option>
          </select>
        </label>
        <span className="grant-ledger-count"><b>{filteredAwards.length}</b> {t("awards")}</span>
      </div>

      {query.isLoading ? (
        <div className="grant-ledger-state">{t("Loading grant records…")}</div>
      ) : query.isError ? (
        <div className="grant-ledger-state grant-ledger-error" role="alert">
          <AlertCircle size={18} /><span>{t("Grant records couldn’t be loaded.")}</span>
          <button type="button" className="button button-quiet" onClick={() => void query.refetch()}>{t("Retry")}</button>
        </div>
      ) : awards.length === 0 ? (
        <div className="grant-ledger-empty">
          <span className="grant-ledger-mark"><ShieldCheck size={21} /></span>
          <h2>{t("No grant awards to track yet.")}</h2>
          <p>{t("When judges select grant recipients, set the awarded amount in Pitch &amp; grants. The awards will appear here for installment tracking.")}</p>
          <Link href="/pitches" className="button button-primary">{t("Open Pitch &amp; grants")}</Link>
        </div>
      ) : filteredAwards.length === 0 ? (
        <div className="grant-ledger-state">{t("No awards match this search or status.")}</div>
      ) : (
        <section className="grant-award-list" aria-label={t("Award ledger")}>
          {filteredAwards.map((award) => {
            const awardAmount = award.grantAmount ?? 0;
            const percentReceived = awardAmount > 0 ? Math.min(100, (award.totalReceived / awardAmount) * 100) : 0;
            return (
              <article className={`grant-award-card grant-status-${award.status}`} key={award.pitchId} data-testid={`grant-award-${award.pitchId}`}>
                <div className="grant-award-main">
                  <div className="grant-award-identity">
                    <span className="grant-award-monogram">{award.businessName.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <h2>{award.businessName}</h2>
                      <span>{award.founderName || t("Founder")}{award.programName ? ` · ${award.programName}` : ""}</span>
                      <small>{t(award.eventType.replaceAll("_", " "))} · {dateLabel(award.eventDate)}</small>
                    </div>
                  </div>
                  <div className="grant-award-status">
                    <span className={`grant-status-pill status-${award.status}`}>{t(statusLabel[award.status])}</span>
                    <div className="grant-award-actions">
                      {award.grantAmount !== null && award.grantAmount > 0 ? (
                        <>
                          <button type="button" className="button button-primary grant-action-button" onClick={() => { createReceipt.reset(); setActiveEntry({ award, kind: "received" }); }}>
                            <Plus size={14} /> {t("Record receipt")}
                          </button>
                          {award.totalReceived > 0 && <button type="button" className="button button-quiet grant-action-button" onClick={() => { createReceipt.reset(); setActiveEntry({ award, kind: "reversal" }); }}>
                            <Undo2 size={14} /> {t("Correct ledger")}
                          </button>}
                        </>
                      ) : <Link href="/pitches" className="button button-quiet grant-action-button">{t("Set award amount")}</Link>}
                    </div>
                  </div>
                </div>

                <div className="grant-award-numbers">
                  <div><span>{t("AWARD")}</span><b>{award.grantAmount === null ? t("Set amount") : money(award.grantAmount)}</b></div>
                  <div><span>{t("RECEIVED")}</span><b>{money(award.totalReceived)}</b></div>
                  <div><span>{t(award.status === "over_received" ? "OVER AWARD" : "REMAINING")}</span><b className={award.status === "over_received" ? "grant-overage" : ""}>{award.remainingAmount === null ? "—" : money(Math.abs(award.remainingAmount))}</b></div>
                </div>

                {award.grantAmount !== null && award.grantAmount > 0 && (
                  <div className="grant-progress-track" role="progressbar" aria-label={`${award.businessName} ${t("award received")}`} aria-valuenow={Math.min(100, Math.round(percentReceived))} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${percentReceived}%` }} />
                  </div>
                )}

                <details className="grant-receipt-history">
                  <summary>{award.receipts.length === 0 ? t("No receipt entries yet") : `${award.receipts.length} ${t("ledger")} ${t(award.receipts.length === 1 ? "entry" : "entries")}`}<span>{award.receipts.length ? t("View history") : t("View details")}</span></summary>
                  {award.receipts.length ? (
                    <ol className="grant-receipt-list">
                      {award.receipts.map((entry) => (
                        <li key={entry.id} className={entry.kind === "reversal" ? "grant-receipt-reversal" : ""}>
                          <span className="grant-receipt-icon">{entry.kind === "received" ? <ArrowDownLeft size={15} /> : <ArrowUpLeft size={15} />}</span>
                          <div className="grant-receipt-copy">
                            <b>{t(entry.kind === "received" ? "Funds received" : "Correction reversal")}</b>
                            <small>{dateLabel(entry.receivedOn)}{entry.reference ? ` · ${t("Ref")} ${entry.reference}` : ""}{entry.recordedBy ? ` · ${t("Recorded by")} ${entry.recordedBy}` : ""}</small>
                            {entry.notes && <span>{entry.notes}</span>}
                          </div>
                          <strong className="grant-receipt-amount">{entry.kind === "received" ? "+" : "−"}{money(entry.amount)}</strong>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="grant-no-receipts">Add an installment when funds are received. Entries are retained as a ledger.</p>}
                </details>
              </article>
            );
          })}
        </section>
      )}

      {activeEntry && <ReceiptDialog
        award={activeEntry.award}
        kind={activeEntry.kind}
        saving={createReceipt.isPending}
        error={createReceipt.error ? errorMessage(createReceipt.error) : undefined}
        onClose={() => { createReceipt.reset(); setActiveEntry(null); }}
        onSubmit={saveReceipt}
      />}
    </>
  );
}
