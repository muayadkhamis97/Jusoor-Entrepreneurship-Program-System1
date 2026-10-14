import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import type { Request, RequestHandler } from "express";
import { applicationsTable, db } from "@workspace/db";

export type ParticipantAccess = {
  userId: string;
  email: string;
};

type ParticipantUserIdResolver = (request: Request) => string | null | undefined | Promise<string | null | undefined>;

export function createRequireParticipant(resolveUserId: ParticipantUserIdResolver = (request) => getAuth(request).userId): RequestHandler {
  return async (req, res, next): Promise<void> => {
  const userId = await resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in with the email used on your application." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const verifiedPrimaryEmail = user.emailAddresses.find(
      (entry) => entry.id === user.primaryEmailAddressId && entry.verification?.status === "verified",
    );
    const email = verifiedPrimaryEmail?.emailAddress.trim().toLowerCase();
    if (!email) {
      res.status(403).json({ error: "Verify your primary email to access the participant portal." });
      return;
    }

    await db.update(applicationsTable)
      .set({ clerkUserId: userId })
      .where(and(
        eq(applicationsTable.email, email),
        isNull(applicationsTable.clerkUserId),
      ));

    const applications = await db.select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkUserId, userId))
      .limit(1);
    if (!applications.length) {
      res.status(403).json({ error: "No application is linked to this account." });
      return;
    }

    res.locals.participant = { userId, email } satisfies ParticipantAccess;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Could not resolve participant access");
    res.status(503).json({ error: "Participant access could not be verified right now." });
  }
  };
}

export const requireParticipant = createRequireParticipant();
