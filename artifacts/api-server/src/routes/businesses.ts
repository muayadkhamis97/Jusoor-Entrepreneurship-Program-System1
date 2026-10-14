import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  CreateBusinessBody,
  CreateBusinessResponse,
  DeleteBusinessParams,
  GetBusinessParams,
  GetBusinessResponse,
  ListBusinessesQueryParams,
  ListBusinessesResponse,
  UpdateBusinessBody,
  UpdateBusinessParams,
  UpdateBusinessResponse,
} from "@workspace/api-zod";
import { businessesTable, db } from "@workspace/db";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import type { StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/businesses", async (req, res): Promise<void> => {
  const query = ListBusinessesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const activeProgramIds = await activeProgramIdsFor(staff);
  if (activeProgramIds.length === 0) {
    res.json([]);
    return;
  }
  const filters = [];
  filters.push(inArray(businessesTable.programId, activeProgramIds));
  if (query.data.programId !== undefined) filters.push(eq(businessesTable.programId, query.data.programId));
  if (query.data.stage) filters.push(eq(businessesTable.stage, query.data.stage));
  if (query.data.search?.trim()) {
    const needle = `%${query.data.search.trim()}%`;
    filters.push(or(
      ilike(businessesTable.businessName, needle),
      ilike(businessesTable.founderName, needle),
      ilike(businessesTable.email, needle),
    )!);
  }
  const businesses = await db.select().from(businessesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(businessesTable.createdAt));
  res.json(ListBusinessesResponse.parse(businesses));
});

router.post("/businesses", async (req, res): Promise<void> => {
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  if (!await canAccessActiveProgram(staff, parsed.data.programId)) {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  const [business] = await db.insert(businessesTable).values(parsed.data).returning();
  res.status(201).json(CreateBusinessResponse.parse(business));
});

router.get("/businesses/:id", async (req, res): Promise<void> => {
  const params = GetBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, params.data.id));
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  if (!await canAccessActiveProgram(staff, business.programId)) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  res.json(GetBusinessResponse.parse(business));
});

router.patch("/businesses/:id", async (req, res): Promise<void> => {
  const params = UpdateBusinessParams.safeParse(req.params);
  const body = UpdateBusinessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [current] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, params.data.id)).limit(1);
  const staff = res.locals.staff as StaffAccess;
  if (!current || !await canAccessActiveProgram(staff, current.programId)) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  if (body.data.programId !== undefined && !await canAccessActiveProgram(staff, body.data.programId)) {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  const values = {
    ...body.data,
    applicationDate: body.data.applicationDate instanceof Date
      ? body.data.applicationDate.toISOString().slice(0, 10)
      : body.data.applicationDate,
  };
  const [business] = await db.update(businessesTable).set(values)
    .where(and(eq(businessesTable.id, params.data.id), eq(businessesTable.programId, current.programId))).returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(UpdateBusinessResponse.parse(business));
});

router.delete("/businesses/:id", async (req, res): Promise<void> => {
  const params = DeleteBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [current] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, params.data.id)).limit(1);
  const staff = res.locals.staff as StaffAccess;
  if (!current || !await canAccessActiveProgram(staff, current.programId)) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  const [business] = await db.delete(businessesTable)
    .where(and(eq(businessesTable.id, params.data.id), eq(businessesTable.programId, current.programId)))
    .returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
