import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { pipeline } from "node:stream/promises";
import {
  CreateBrandLogoUploadUrlBody,
  CreateBrandLogoUploadUrlResponse,
  GetProgramBrandingResponse,
  UpdateProgramBrandingBody,
  UpdateProgramBrandingResponse,
} from "@workspace/api-zod";
import { db, programBrandingTable } from "@workspace/db";
import { requireCoordinator, requireStaff } from "../middlewares/staffAccess";
import {
  brandLogoIdFromObjectPath,
  brandLogoIdFromReference,
  createBrandLogoUploadUrl,
  getBrandLogoFile,
  isBrandLogoId,
  isSupportedBrandLogo,
} from "../lib/brandLogoStorage";

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

router.get("/branding", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(programBrandingTable).limit(1);
  const visibleSettings = settings
    ? {
      ...settings,
      brandName: getVisibleBrandName(settings.brandName),
      logoUrl: visibleLogoUrl(settings.logoUrl, req),
    }
    : defaultBranding;
  res.json(GetProgramBrandingResponse.parse(visibleSettings));
});

router.get("/branding/logo/:logoId", async (req, res): Promise<void> => {
  const logoId = req.params.logoId;
  if (!isBrandLogoId(logoId)) {
    res.status(404).json({ error: "Program logo not found." });
    return;
  }
  const [settings] = await db.select({ logoUrl: programBrandingTable.logoUrl })
    .from(programBrandingTable).limit(1);
  if (brandLogoIdFromReference(settings?.logoUrl ?? null) !== logoId.toLowerCase()) {
    res.status(404).json({ error: "Program logo not found." });
    return;
  }
  try {
    const file = await getBrandLogoFile(logoId);
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", metadata.contentType!);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    await pipeline(file.createReadStream(), res);
  } catch (error) {
    req.log.error({ err: error }, "Could not stream configured program logo");
    if (!res.headersSent) res.status(404).json({ error: "Program logo not found." });
    else res.destroy();
  }
});

router.post("/branding/logo/upload-url", requireStaff, requireCoordinator, async (req, res): Promise<void> => {
  const body = CreateBrandLogoUploadUrlBody.safeParse(req.body);
  if (!body.success || !isSupportedBrandLogo(body.data?.contentType ?? "", body.data?.size ?? 0)) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP logo up to 5 MB." });
    return;
  }
  try {
    const upload = await createBrandLogoUploadUrl(publicOrigin(req));
    res.json(CreateBrandLogoUploadUrlResponse.parse(upload));
  } catch (error) {
    req.log.error({ err: error }, "Could not create program logo upload URL");
    res.status(503).json({ error: "Logo upload storage is unavailable right now." });
  }
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

  let storedLogoUrl = parsed.data.logoUrl;
  const uploadedLogoId = brandLogoIdFromReference(storedLogoUrl);
  if (uploadedLogoId) {
    try {
      await getBrandLogoFile(uploadedLogoId);
    } catch {
      res.status(400).json({ error: "Uploaded logo could not be verified. Upload it again." });
      return;
    }
    storedLogoUrl = new URL(`/api/branding/logo/${uploadedLogoId}`, publicOrigin(req)).toString();
  } else if (storedLogoUrl) {
    try {
      const logoUrl = new URL(storedLogoUrl);
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
      logoUrl: storedLogoUrl,
      primaryColor: parsed.data.primaryColor.toLowerCase(),
      accentColor: parsed.data.accentColor.toLowerCase(),
      sidebarColor,
      topbarColor,
    })
    .onConflictDoUpdate({
      target: programBrandingTable.id,
      set: {
        brandName,
        logoUrl: storedLogoUrl,
        primaryColor: parsed.data.primaryColor.toLowerCase(),
        accentColor: parsed.data.accentColor.toLowerCase(),
        sidebarColor,
        topbarColor,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(UpdateProgramBrandingResponse.parse({
    ...settings,
    logoUrl: visibleLogoUrl(settings.logoUrl, req),
  }));
});

function visibleLogoUrl(storedLogoUrl: string | null, req: Request): string | null {
  const logoId = brandLogoIdFromObjectPath(storedLogoUrl);
  const referenceId = brandLogoIdFromReference(storedLogoUrl);
  const id = logoId ?? referenceId;
  if (!id) return storedLogoUrl;
  if (storedLogoUrl && !storedLogoUrl.startsWith("/objects/")) {
    try {
      const url = new URL(storedLogoUrl);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // Older relative logo references are rebuilt against the current public host below.
    }
  }
  return new URL(`/api/branding/logo/${id}`, publicOrigin(req)).toString();
}

function publicOrigin(req: Request): string {
  const host = req.get("host");
  if (!host || /[\\/@]/.test(host)) throw new Error("A valid public request host is required for branding.");
  return new URL(`https://${host}`).origin;
}

export default router;
