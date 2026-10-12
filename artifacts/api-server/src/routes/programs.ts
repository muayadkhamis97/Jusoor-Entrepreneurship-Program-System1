import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import {
  CreateProgramBody,
  CreateProgramResponse,
  DeleteProgramParams,
  ListProgramsResponse,
  UpdateProgramBody,
  UpdateProgramParams,
  UpdateProgramResponse,
} from "@workspace/api-zod";
import { db, programsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/programs", async (_req, res): Promise<void> => {
  const programs = await db.select().from(programsTable).orderBy(asc(programsTable.createdAt));
  res.json(ListProgramsResponse.parse(programs));
});

router.post("/programs", async (req, res): Promise<void> => {
  const parsed = CreateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [program] = await db.insert(programsTable).values(parsed.data).returning();
  res.status(201).json(CreateProgramResponse.parse(program));
});

router.patch("/programs/:id", async (req, res): Promise<void> => {
  const params = DeleteProgramParams.safeParse(req.params);
  const body = UpdateProgramBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const values = {
    ...body.data,
    startDate: body.data.startDate instanceof Date ? body.data.startDate.toISOString().slice(0, 10) : body.data.startDate,
    endDate: body.data.endDate instanceof Date ? body.data.endDate.toISOString().slice(0, 10) : body.data.endDate,
    applicationDeadline: body.data.applicationDeadline instanceof Date
      ? body.data.applicationDeadline.toISOString().slice(0, 10)
      : body.data.applicationDeadline,
  };
  const [program] = await db.update(programsTable).set(values)
    .where(eq(programsTable.id, params.data.id)).returning();
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  res.json(UpdateProgramResponse.parse(program));
});

router.delete("/programs/:id", async (req, res): Promise<void> => {
  const params = UpdateProgramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [program] = await db.delete(programsTable).where(eq(programsTable.id, params.data.id)).returning();
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
