import { and, asc, count, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateStaffBody,
  CreateStaffResponse,
  DeleteStaffParams,
  GetAuthMeResponse,
  GetMentorBookingStatusResponse,
  ListStaffResponse,
  UpdateStaffBody,
  UpdateStaffParams,
  UpdateStaffResponse,
} from "@workspace/api-zod";
import { db, staffMembersTable } from "@workspace/db";
import { requireCoordinator, requireOperationsStaff } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/auth/me", (_req, res): void => {
  res.json(GetAuthMeResponse.parse(res.locals.staff));
});

router.get("/staff", requireOperationsStaff, async (_req, res): Promise<void> => {
  const members = await db.select().from(staffMembersTable).orderBy(asc(staffMembersTable.email));
  res.json(ListStaffResponse.parse(members));
});

router.get("/staff/mentor-booking-status", requireCoordinator, async (_req, res): Promise<void> => {
  const mentors = await db.select({
    staffId: staffMembersTable.id,
    email: staffMembersTable.email,
    status: staffMembersTable.status,
    calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
  }).from(staffMembersTable)
    .where(eq(staffMembersTable.role, "mentor"))
    .orderBy(asc(staffMembersTable.email));

  res.json(GetMentorBookingStatusResponse.parse(mentors.map(({ calendlyBookingUrl, ...mentor }) => ({
    ...mentor,
    calendlyConnected: Boolean(calendlyBookingUrl),
  }))));
});

router.post("/staff", requireCoordinator, async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [member] = await db.insert(staffMembersTable)
    .values({ email, role: parsed.data.role, status: "invited" })
    .onConflictDoNothing({ target: staffMembersTable.email })
    .returning();
  if (!member) {
    res.status(409).json({ error: "This email already has staff access." });
    return;
  }

  res.status(201).json(CreateStaffResponse.parse(member));
});

router.patch("/staff/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  const body = UpdateStaffBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }

  const current = res.locals.staff as { id: number };
  const [target] = await db.select().from(staffMembersTable)
    .where(eq(staffMembersTable.id, params.data.id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  if (target.id === current.id) {
    res.status(400).json({ error: "You cannot change your own role." });
    return;
  }

  if (target.role === "coordinator" && body.data.role !== "coordinator") {
    const [coordinatorCount] = await db.select({ value: count() })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.role, "coordinator"));
    if ((coordinatorCount?.value ?? 0) <= 1) {
      res.status(400).json({ error: "At least one coordinator must remain." });
      return;
    }
  }

  const [member] = await db.update(staffMembersTable)
    .set({ role: body.data.role })
    .where(eq(staffMembersTable.id, params.data.id))
    .returning();
  res.json(UpdateStaffResponse.parse(member));
});

router.delete("/staff/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const current = res.locals.staff as { id: number };
  const [target] = await db.select().from(staffMembersTable)
    .where(eq(staffMembersTable.id, params.data.id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  if (target.id === current.id) {
    res.status(400).json({ error: "You cannot revoke your own access." });
    return;
  }

  if (target.role === "coordinator") {
    const [coordinatorCount] = await db.select({ value: count() })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.role, "coordinator"));
    if ((coordinatorCount?.value ?? 0) <= 1) {
      res.status(400).json({ error: "At least one coordinator must remain." });
      return;
    }
  }

  await db.delete(staffMembersTable).where(eq(staffMembersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
