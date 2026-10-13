import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  CreateGrantReceiptBody,
  CreateGrantReceiptParams,
  CreateGrantReceiptResponse,
  ListGrantAwardsResponse,
} from "@workspace/api-zod";
import {
  businessesTable,
  db,
  grantReceiptsTable,
  pitchesTable,
  programsTable,
  staffMembersTable,
} from "@workspace/db";
import { grantReceiptStatus, totalGrantReceived } from "../lib/grant-ledger";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();
router.use(requireCoordinator);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

router.get("/grants", async (_req, res): Promise<void> => {
  const awards = await db.select({
    pitchId: pitchesTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    founderName: businessesTable.founderName,
    programName: programsTable.name,
    eventType: pitchesTable.eventType,
    eventDate: pitchesTable.eventDate,
    grantAmount: pitchesTable.grantAmount,
  }).from(pitchesTable)
    .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
    .leftJoin(programsTable, eq(businessesTable.programId, programsTable.id))
    .where(eq(pitchesTable.grantDecision, "awarded"))
    .orderBy(desc(pitchesTable.eventDate), asc(businessesTable.businessName));

  const pitchIds = awards.map(({ pitchId }) => pitchId);
  const receipts = pitchIds.length
    ? await db.select({
      id: grantReceiptsTable.id,
      pitchId: grantReceiptsTable.pitchId,
      kind: grantReceiptsTable.kind,
      amount: grantReceiptsTable.amount,
      receivedOn: grantReceiptsTable.receivedOn,
      reference: grantReceiptsTable.reference,
      notes: grantReceiptsTable.notes,
      recordedBy: staffMembersTable.email,
      recordedAt: grantReceiptsTable.createdAt,
    }).from(grantReceiptsTable)
      .leftJoin(staffMembersTable, eq(grantReceiptsTable.recordedByStaffId, staffMembersTable.id))
      .where(inArray(grantReceiptsTable.pitchId, pitchIds))
      .orderBy(asc(grantReceiptsTable.receivedOn), asc(grantReceiptsTable.createdAt))
    : [];
  const receiptsByPitch = new Map<number, typeof receipts>();
  for (const receipt of receipts) {
    const list = receiptsByPitch.get(receipt.pitchId) ?? [];
    list.push(receipt);
    receiptsByPitch.set(receipt.pitchId, list);
  }

  const result = awards.map((award) => {
    const awardReceipts = receiptsByPitch.get(award.pitchId) ?? [];
    const totalReceived = roundMoney(totalGrantReceived(awardReceipts));
    return {
      ...award,
      totalReceived,
      remainingAmount: award.grantAmount === null
        ? null
        : roundMoney(award.grantAmount - totalReceived),
      status: grantReceiptStatus(award.grantAmount, totalReceived),
      receipts: awardReceipts,
    };
  });
  res.json(ListGrantAwardsResponse.parse(result));
});

router.post("/grants/:pitchId/receipts", async (req, res): Promise<void> => {
  const params = CreateGrantReceiptParams.safeParse(req.params);
  const body = CreateGrantReceiptBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  if (!validDate(body.data.receivedOn)) {
    res.status(400).json({ error: "Choose a valid receipt date." });
    return;
  }
  const amountCents = Math.round(body.data.amount * 100);
  if (Math.abs(body.data.amount * 100 - amountCents) > 0.00001) {
    res.status(400).json({ error: "Enter an amount with no more than two decimal places." });
    return;
  }
  if (body.data.kind === "reversal" && !body.data.notes?.trim()) {
    res.status(400).json({ error: "Add a note explaining this correction." });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const result = await db.transaction(async (tx) => {
    const [award] = await tx.select({
      id: pitchesTable.id,
      amount: pitchesTable.grantAmount,
    }).from(pitchesTable)
      .where(and(
        eq(pitchesTable.id, params.data.pitchId),
        eq(pitchesTable.grantDecision, "awarded"),
      ))
      .for("update")
      .limit(1);
    if (!award) return { kind: "not_found" as const };
    if (award.amount === null || award.amount <= 0) {
      return { kind: "amount_needed" as const };
    }

    const existing = await tx.select({
      kind: grantReceiptsTable.kind,
      amount: grantReceiptsTable.amount,
    }).from(grantReceiptsTable)
      .where(eq(grantReceiptsTable.pitchId, award.id));
    const totalReceived = totalGrantReceived(existing);
    if (body.data.kind === "reversal" && amountCents > Math.round(totalReceived * 100)) {
      return { kind: "reversal_too_large" as const };
    }

    const [record] = await tx.insert(grantReceiptsTable).values({
      pitchId: award.id,
      kind: body.data.kind,
      amount: body.data.amount,
      receivedOn: body.data.receivedOn,
      reference: body.data.reference?.trim() || null,
      notes: body.data.notes?.trim() || null,
      recordedByStaffId: staff.id,
    }).returning();
    return { kind: "created" as const, record, recordedBy: staff.email };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Awarded grant not found." });
    return;
  }
  if (result.kind === "amount_needed") {
    res.status(409).json({ error: "Set a positive award amount in Pitch & grants before recording receipts." });
    return;
  }
  if (result.kind === "reversal_too_large") {
    res.status(409).json({ error: "A correction cannot exceed the amount currently recorded as received." });
    return;
  }
  req.log.info({ pitchId: params.data.pitchId, kind: body.data.kind }, "Grant ledger entry recorded");
  res.status(201).json(CreateGrantReceiptResponse.parse({
    ...result.record,
    recordedBy: result.recordedBy,
  }));
});

export default router;
