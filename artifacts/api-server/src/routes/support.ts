import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateSupportBody,
  CreateSupportResponse,
  DeleteSupportParams,
  ListSupportQueryParams,
  ListSupportResponse,
  UpdateSupportBody,
  UpdateSupportParams,
  UpdateSupportResponse,
} from "@workspace/api-zod";
import { db, supportTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/support", async (req, res): Promise<void> => {
  const query = ListSupportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [];
  if (query.data.businessId !== undefined) filters.push(eq(supportTable.businessId, query.data.businessId));
  if (query.data.type) filters.push(eq(supportTable.type, query.data.type));
  const engagements = await db.select().from(supportTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(supportTable.createdAt));
  res.json(ListSupportResponse.parse(engagements));
});

router.post("/support", async (req, res): Promise<void> => {
  const parsed = CreateSupportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [engagement] = await db.insert(supportTable).values(parsed.data).returning();
  res.status(201).json(CreateSupportResponse.parse(engagement));
});

router.patch("/support/:id", async (req, res): Promise<void> => {
  const params = DeleteSupportParams.safeParse(req.params);
  const body = UpdateSupportBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const values = {
    ...body.data,
    scheduledDate: body.data.scheduledDate instanceof Date
      ? body.data.scheduledDate.toISOString().slice(0, 10)
      : body.data.scheduledDate,
  };
  const [engagement] = await db.update(supportTable).set(values)
    .where(eq(supportTable.id, params.data.id)).returning();
  if (!engagement) {
    res.status(404).json({ error: "Support engagement not found" });
    return;
  }
  res.json(UpdateSupportResponse.parse(engagement));
});

router.delete("/support/:id", async (req, res): Promise<void> => {
  const params = UpdateSupportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [engagement] = await db.delete(supportTable).where(eq(supportTable.id, params.data.id)).returning();
  if (!engagement) {
    res.status(404).json({ error: "Support engagement not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
