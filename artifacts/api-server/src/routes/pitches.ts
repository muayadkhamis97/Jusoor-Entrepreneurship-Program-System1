import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreatePitchBody,
  CreatePitchResponse,
  DeletePitchParams,
  ListPitchesQueryParams,
  ListPitchesResponse,
  UpdatePitchBody,
  UpdatePitchParams,
  UpdatePitchResponse,
} from "@workspace/api-zod";
import { db, pitchesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/pitches", async (req, res): Promise<void> => {
  const query = ListPitchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [];
  if (query.data.businessId !== undefined) filters.push(eq(pitchesTable.businessId, query.data.businessId));
  if (query.data.eventType) filters.push(eq(pitchesTable.eventType, query.data.eventType));
  const records = await db.select().from(pitchesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(pitchesTable.eventDate));
  res.json(ListPitchesResponse.parse(records));
});

router.post("/pitches", async (req, res): Promise<void> => {
  const parsed = CreatePitchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [record] = await db.insert(pitchesTable).values(parsed.data).returning();
  res.status(201).json(CreatePitchResponse.parse(record));
});

router.patch("/pitches/:id", async (req, res): Promise<void> => {
  const params = DeletePitchParams.safeParse(req.params);
  const body = UpdatePitchBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [record] = await db.update(pitchesTable).set(body.data)
    .where(eq(pitchesTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Pitch record not found" });
    return;
  }
  res.json(UpdatePitchResponse.parse(record));
});

router.delete("/pitches/:id", async (req, res): Promise<void> => {
  const params = UpdatePitchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [record] = await db.delete(pitchesTable).where(eq(pitchesTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Pitch record not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
