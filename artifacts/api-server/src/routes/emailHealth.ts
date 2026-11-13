import { clerkClient, getAuth } from "@clerk/express";
import { Router, type Request } from "express";
import { CheckEmailHealthBody, CheckEmailHealthResponse } from "@workspace/api-zod";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";
import { runEmailHealth } from "../lib/email-health";

async function ownVerifiedEmail(req: Request): Promise<string | undefined> {
  const { userId } = getAuth(req);
  if (!userId) return undefined;
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.find(entry =>
    entry.id === user.primaryEmailAddressId && entry.verification?.status === "verified",
  )?.emailAddress;
}

export function createEmailHealthRouter(
  health = runEmailHealth,
  verifiedEmail = ownVerifiedEmail,
) {
  const router = Router();
  router.post("/staff/email-health", requireCoordinator, async (req, res): Promise<void> => {
    const parsed = CheckEmailHealthBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A valid email health request is required." });
      return;
    }
    let email: string | undefined;
    if (parsed.data.sendTest) {
      try { email = await verifiedEmail(req); } catch { /* Fail closed if identity verification is unavailable. */ }
      if (!email) {
        res.status(403).json({ error: "Verify your primary email before sending an email health test." });
        return;
      }
    }
    const staff = res.locals.staff as StaffAccess;
    const report = await health({ ...parsed.data, requestId: `${staff.id}-${parsed.data.requestId}` }, email);
    res.set("Cache-Control", "no-store");
    res.json(CheckEmailHealthResponse.parse(report));
  });
  return router;
}

export default createEmailHealthRouter();
