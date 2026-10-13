import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
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
  const [receivedOn, setReceivedOn] = useState(localDate);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-card grant-receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="grant-dialog-title">
        <div className="modal-head">
          <div>
            <div className="eyebrow">GRANT LEDGER / {kind === "received" ? "RECEIPT" : "CORRECTION"}</div>
            <h2 id="grant-dialog-title" className="app-title">
              {kind === "received" ? "Record funds received" : "Reverse a ledger entry"}
            </h2>
            <p>{award.businessName} · Award {money(award.grantAmount)}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
        </div>
        {kind === "reversal" && (
          <div className="grant-correction-note" role="note">
            <Undo2 size={15} />
            <span>This adds a dated correction entry; it does not delete the original receipt. Explain the correction below.</span>
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
              <span>Amount (USD) *</span>
              <input className="form-control" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>{kind === "received" ? "Date received" : "Correction date"} *</span>
              <input className="form-control" type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} required />
            </label>
            <label className="field field-wide">
              <span>Reference <small>(optional)</small></span>
              <input className="form-control" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Internal voucher or transfer reference" />
            </label>
            <label className="field field-wide">
              <span>{kind === "reversal" ? "Reason for correction *" : "Notes"}{kind === "received" && <small> (optional)</small>}</span>
              <textarea className="form-control resize-y" rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} required={kind === "reversal"} placeholder={kind === "reversal" ? "Explain why this amount is being reversed." : "Add any internal receipt context."} />
            </label>
          </div>
          {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : <><Check size={16} /> {kind === "received" ? "Save receipt" : "Save correction"}</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function GrantManagementPage() {
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
          <div className="eyebrow">FINANCE / AWARD ADMINISTRATION</div>
          <h1 className="app-title">Grant management</h1>
          <p>Follow each demo-day award from commitment through received installments.</p>
        </div>
      </header>

      <section className="grant-ledger-intro">
        <span className="grant-ledger-mark"><CircleDollarSign size={21} /></span>
        <div>
          <div className="eyebrow">AWARDS TO RECEIPTS</div>
          <b>Keep the funding record connected to the judge’s decision.</b>
          <span>Record each amount received, keep the history, and add a correction entry instead of removing a receipt.</span>
        </div>
        <Link href="/pitches" className="button button-quiet grant-pitch-link"><FileText size={15} /> Review award decisions</Link>
      </section>

      <section className="grant-ledger-metrics" aria-label="Grant totals">
        <article><span>AWARDED</span><b>{awards.length}</b><small>{complete} fully received</small></article>
        <article><span>COMMITTED</span><b>{money(committed)}</b><small>Approved award amounts</small></article>
        <article><span>RECEIVED</span><b>{money(received)}</b><small>Net receipts recorded</small></article>
        <article><span>REMAINING</span><b>{money(remaining)}</b><small>Against committed awards</small></article>
      </section>

      <div className="grant-ledger-toolbar">
        <label className="grant-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business or program" aria-label="Search grants" /></label>
        <label className="grant-status-filter"><span className="sr-only">Filter grants by receipt status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All awards</option>
            <option value="amount_needed">Amount needed</option>
            <option value="not_received">Not received</option>
            <option value="partially_received">Partially received</option>
            <option value="received">Fully received</option>
            <option value="over_received">Over award</option>
          </select>
        </label>
        <span className="grant-ledger-count"><b>{filteredAwards.length}</b> awards</span>
      </div>

      {query.isLoading ? (
        <div className="grant-ledger-state">Loading grant records…</div>
      ) : query.isError ? (
        <div className="grant-ledger-state grant-ledger-error" role="alert">
          <AlertCircle size={18} /><span>Grant records couldn’t be loaded.</span>
          <button type="button" className="button button-quiet" onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : awards.length === 0 ? (
        <div className="grant-ledger-empty">
          <span className="grant-ledger-mark"><ShieldCheck size={21} /></span>
          <h2>No grant awards to track yet.</h2>
          <p>When judges select grant recipients, set the awarded amount in Pitch &amp; grants. The awards will appear here for installment tracking.</p>
          <Link href="/pitches" className="button button-primary">Open Pitch &amp; grants</Link>
        </div>
      ) : filteredAwards.length === 0 ? (
        <div className="grant-ledger-state">No awards match this search or status.</div>
      ) : (
        <section className="grant-award-list" aria-label="Award ledger">
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
                      <span>{award.founderName || "Founder"}{award.programName ? ` · ${award.programName}` : ""}</span>
                      <small>{award.eventType.replaceAll("_", " ")} · {dateLabel(award.eventDate)}</small>
                    </div>
                  </div>
                  <div className="grant-award-status">
                    <span className={`grant-status-pill status-${award.status}`}>{statusLabel[award.status]}</span>
                    <div className="grant-award-actions">
                      {award.grantAmount !== null && award.grantAmount > 0 ? (
                        <>
                          <button type="button" className="button button-primary grant-action-button" onClick={() => { createReceipt.reset(); setActiveEntry({ award, kind: "received" }); }}>
                            <Plus size={14} /> Record receipt
                          </button>
                          {award.totalReceived > 0 && <button type="button" className="button button-quiet grant-action-button" onClick={() => { createReceipt.reset(); setActiveEntry({ award, kind: "reversal" }); }}>
                            <Undo2 size={14} /> Correct ledger
                          </button>}
                        </>
                      ) : <Link href="/pitches" className="button button-quiet grant-action-button">Set award amount</Link>}
                    </div>
                  </div>
                </div>

                <div className="grant-award-numbers">
                  <div><span>AWARD</span><b>{award.grantAmount === null ? "Set amount" : money(award.grantAmount)}</b></div>
                  <div><span>RECEIVED</span><b>{money(award.totalReceived)}</b></div>
                  <div><span>{award.status === "over_received" ? "OVER AWARD" : "REMAINING"}</span><b className={award.status === "over_received" ? "grant-overage" : ""}>{award.remainingAmount === null ? "—" : money(Math.abs(award.remainingAmount))}</b></div>
                </div>

                {award.grantAmount !== null && award.grantAmount > 0 && (
                  <div className="grant-progress-track" role="progressbar" aria-label={`${award.businessName} award received`} aria-valuenow={Math.min(100, Math.round(percentReceived))} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${percentReceived}%` }} />
                  </div>
                )}

                <details className="grant-receipt-history">
                  <summary>{award.receipts.length === 0 ? "No receipt entries yet" : `${award.receipts.length} ledger ${award.receipts.length === 1 ? "entry" : "entries"}`}<span>{award.receipts.length ? "View history" : "View details"}</span></summary>
                  {award.receipts.length ? (
                    <ol className="grant-receipt-list">
                      {award.receipts.map((entry) => (
                        <li key={entry.id} className={entry.kind === "reversal" ? "grant-receipt-reversal" : ""}>
                          <span className="grant-receipt-icon">{entry.kind === "received" ? <ArrowDownLeft size={15} /> : <ArrowUpLeft size={15} />}</span>
                          <div className="grant-receipt-copy">
                            <b>{entry.kind === "received" ? "Funds received" : "Correction reversal"}</b>
                            <small>{dateLabel(entry.receivedOn)}{entry.reference ? ` · Ref ${entry.reference}` : ""}{entry.recordedBy ? ` · Recorded by ${entry.recordedBy}` : ""}</small>
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
