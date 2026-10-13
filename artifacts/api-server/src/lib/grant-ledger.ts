export type GrantLedgerEntry = {
  kind: string;
  amount: number;
};

export type GrantReceiptStatus =
  | "amount_needed"
  | "not_received"
  | "partially_received"
  | "received"
  | "over_received";

export function cents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function totalGrantReceived(entries: GrantLedgerEntry[]): number {
  return entries.reduce((total, entry) => {
    const amount = cents(entry.amount);
    if (entry.kind === "received") return total + amount;
    if (entry.kind === "reversal") return total - amount;
    throw new Error("Unknown grant ledger entry type.");
  }, 0) / 100;
}

export function grantReceiptStatus(
  awardAmount: number | null,
  totalReceived: number,
): GrantReceiptStatus {
  if (awardAmount === null || awardAmount <= 0) return "amount_needed";
  if (totalReceived <= 0) return "not_received";
  if (cents(totalReceived) < cents(awardAmount)) return "partially_received";
  if (cents(totalReceived) > cents(awardAmount)) return "over_received";
  return "received";
}
