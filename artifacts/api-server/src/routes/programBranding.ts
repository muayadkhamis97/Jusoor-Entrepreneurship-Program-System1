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
  brandName: "Program Hub",
  logoUrl: null,
  primaryColor: "#28665a",
  accentColor: "#d98a46",
  sidebarColor: "#1f3445",
  topbarColor: "#2d4453",
};

function getVisibleBrandName(brandName: string | null | undefined): string {
  const configured = brandName?.trim();
  return configured && !/(jusoor|جسور)/i.test(configured) ? configured : "Program Hub";
}

router.get("/branding", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(programBrandingTable).limit(1);
  const visibleSettings = settings
    ? { ...settings, brandName: getVisibleBrandName(settings.brandName) }
    : defaultBranding;
  res.json(GetProgramBrandingResponse.parse(visibleSettings));
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
  if (/(jusoor|جسور)/i.test(brandName)) {
    res.status(400).json({ error: "This brand name is unavailable. Choose another name." });
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

  const sidebarColor = (parsed.data.sidebarColor ?? defaultBranding.sidebarColor).toLowerCase();
  const topbarColor = (parsed.data.topbarColor ?? defaultBranding.topbarColor).toLowerCase();
  const [settings] = await db.insert(programBrandingTable)
    .values({
      id: 1,
      brandName,
      logoUrl: parsed.data.logoUrl,
      primaryColor: parsed.data.primaryColor.toLowerCase(),
      accentColor: parsed.data.accentColor.toLowerCase(),
      sidebarColor,
      topbarColor,
    })
    .onConflictDoUpdate({
      target: programBrandingTable.id,
      set: {
        brandName,
        logoUrl: parsed.data.logoUrl,
        primaryColor: parsed.data.primaryColor.toLowerCase(),
        accentColor: parsed.data.accentColor.toLowerCase(),
        sidebarColor,
        topbarColor,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(UpdateProgramBrandingResponse.parse(settings));
});

export default router;
