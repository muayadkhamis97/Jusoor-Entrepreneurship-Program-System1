import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetProgramBrandingResponse,
  UpdateProgramBrandingBody,
  UpdateProgramBrandingResponse,
} from "@workspace/api-zod";
import { db, programBrandingTable } from "@workspace/db";
import { requireCoordinator, requireStaff } from "../middlewares/staffAccess";

const router: IRouter = Router();

const defaultBranding = {
  brandName: "Jusoor",
  logoUrl: null,
  primaryColor: "#28665a",
  accentColor: "#d98a46",
};

router.get("/branding", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(programBrandingTable).limit(1);
  res.json(GetProgramBrandingResponse.parse(settings ?? defaultBranding));
});

router.put("/branding", requireStaff, requireCoordinator, async (req, res): Promise<void> => {
  const parsed = UpdateProgramBrandingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const brandName = parsed.data.brandName.trim();
  if (!brandName) {
    res.status(400).json({ error: "Program name cannot be empty." });
    return;
  }

  if (parsed.data.logoUrl) {
    try {
      const logoUrl = new URL(parsed.data.logoUrl);
      if (logoUrl.protocol !== "https:" || logoUrl.username || logoUrl.password) {
        res.status(400).json({ error: "Logo URL must be a public HTTPS URL without embedded credentials." });
        return;
      }
    } catch {
      res.status(400).json({ error: "Logo URL must be a valid public HTTPS URL." });
      return;
    }
  }

  const [settings] = await db.insert(programBrandingTable)
    .values({
      id: 1,
      brandName,
      logoUrl: parsed.data.logoUrl,
      primaryColor: parsed.data.primaryColor.toLowerCase(),
      accentColor: parsed.data.accentColor.toLowerCase(),
    })
    .onConflictDoUpdate({
      target: programBrandingTable.id,
      set: {
        brandName,
        logoUrl: parsed.data.logoUrl,
        primaryColor: parsed.data.primaryColor.toLowerCase(),
        accentColor: parsed.data.accentColor.toLowerCase(),
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(UpdateProgramBrandingResponse.parse(settings));
});

export default router;
