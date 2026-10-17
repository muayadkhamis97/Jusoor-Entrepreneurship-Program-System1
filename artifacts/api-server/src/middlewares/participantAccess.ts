import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Request, RequestHandler } from "express";
import { applicationsTable, db } from "@workspace/db";
import { getExpiredAdminInvitedApplicationIds } from "../lib/participantInvitations";

export type ParticipantAccess = {
  userId: string;
  email: string;
};

type ParticipantUserIdResolver = (request: Request) => string | null | undefined | Promise<string | null | undefined>;
type VerifiedPrimaryEmailResolver = (userId: string) => Promise<string | undefined>;

const resolveClerkVerifiedPrimaryEmail: VerifiedPrimaryEmailResolver = async (userId) => {
  const user = await clerkClient.users.getUser(userId);
  const verifiedPrimaryEmail = user.emailAddresses.find(
    (entry) => entry.id === user.primaryEmailAddressId && entry.verification?.status === "verified",
  );
  return verifiedPrimaryEmail?.emailAddress;
};

export function createRequireParticipant(
  resolveUserId: ParticipantUserIdResolver = (request) => getAuth(request).userId,
  resolveVerifiedPrimaryEmail: VerifiedPrimaryEmailResolver = resolveClerkVerifiedPrimaryEmail,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
  const userId = await resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in with the email used on your application." });
    return;
  }

  try {
    const email = (await resolveVerifiedPrimaryEmail(userId))?.trim().toLowerCase();
    if (!email) {
      res.status(403).json({ error: "Verify your primary email to access the participant portal." });
      return;
    }

    const unlinkedApplications = await db.select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(and(
        eq(applicationsTable.email, email),
        isNull(applicationsTable.clerkUserId),
      ));
    const expiredInvitationIds = await getExpiredAdminInvitedApplicationIds(
      unlinkedApplications.map(({ id }) => id),
    );
    const linkableApplicationIds = unlinkedApplications
      .map(({ id }) => id)
      .filter((id) => !expiredInvitationIds.has(id));
    if (linkableApplicationIds.length) {
      await db.update(applicationsTable)
        .set({ clerkUserId: userId })
        .where(and(
          inArray(applicationsTable.id, linkableApplicationIds),
          eq(applicationsTable.email, email),
          isNull(applicationsTable.clerkUserId),
        ));
    }

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
