import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
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

const router: IRouter = Router();

router.get("/businesses", async (req, res): Promise<void> => {
  const query = ListBusinessesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [];
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
  res.json(GetBusinessResponse.parse(business));
});

router.patch("/businesses/:id", async (req, res): Promise<void> => {
  const params = UpdateBusinessParams.safeParse(req.params);
  const body = UpdateBusinessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const values = {
    ...body.data,
    applicationDate: body.data.applicationDate instanceof Date
      ? body.data.applicationDate.toISOString().slice(0, 10)
      : body.data.applicationDate,
  };
  const [business] = await db.update(businessesTable).set(values)
    .where(eq(businessesTable.id, params.data.id)).returning();
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
  const [business] = await db.delete(businessesTable).where(eq(businessesTable.id, params.data.id)).returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
