import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db, programsTable, staffMembersTable, staffProgramAssignmentsTable } from "@workspace/db";

type StaffAccess = {
  id: number;
  email: string;
  role: "coordinator" | "staff" | "trainer" | "mentor" | "judge";
  status: "invited" | "active";
  bookingProvider: "calendly" | "google_calendar";
  calendlyBookingUrl: string | null;
  googleCalendarAccountEmail: string | null;
  googleCalendarBookingUrl: string | null;
  createdAt: Date;
  programIds: number[];
};

let bootstrapInvite: Promise<void> | undefined;

async function ensureBootstrapCoordinator(): Promise<void> {
  const email = process.env.JUSOOR_BOOTSTRAP_COORDINATOR_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("JUSOOR_BOOTSTRAP_COORDINATOR_EMAIL is not configured.");
  }

  if (!bootstrapInvite) {
    bootstrapInvite = db.insert(staffMembersTable)
      .values({ email, role: "coordinator", status: "invited" })
      .onConflictDoNothing({ target: staffMembersTable.email })
      .then(() => undefined)
      .catch((error: unknown) => {
        bootstrapInvite = undefined;
        throw error;
      });
  }
  await bootstrapInvite;
}

export const requireStaff: RequestHandler = async (req, res, next): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in with an approved staff account." });
    return;
  }

  try {
    await ensureBootstrapCoordinator();

    let [member] = await db.select().from(staffMembersTable)
      .where(eq(staffMembersTable.clerkUserId, userId)).limit(1);

    if (!member) {
      const user = await clerkClient.users.getUser(userId);
      const verifiedPrimaryEmail = user.emailAddresses.find(
        (entry) =>
          entry.id === user.primaryEmailAddressId &&
          entry.verification?.status === "verified",
      );
      const normalizedEmail = verifiedPrimaryEmail?.emailAddress.trim().toLowerCase();

      if (!normalizedEmail) {
        res.status(403).json({ error: "Verify your primary email before requesting staff access." });
        return;
      }

      const [invitation] = await db.select().from(staffMembersTable)
        .where(and(
          eq(staffMembersTable.email, normalizedEmail),
          isNull(staffMembersTable.clerkUserId),
        ))
        .limit(1);

      if (!invitation) {
        res.status(403).json({ error: "This account is not approved for Jusoor staff access." });
        return;
      }

      [member] = await db.update(staffMembersTable)
        .set({ clerkUserId: userId, status: "active" })
        .where(and(
          eq(staffMembersTable.id, invitation.id),
          isNull(staffMembersTable.clerkUserId),
        ))
        .returning();

      if (!member) {
        [member] = await db.select().from(staffMembersTable)
          .where(eq(staffMembersTable.clerkUserId, userId))
          .limit(1);
      }
    }

    if (!member) {
      res.status(403).json({ error: "This account is not approved for Jusoor staff access." });
      return;
    }

    const programAssignments = member.role === "coordinator" ? [] : await db
      .select({ programId: staffProgramAssignmentsTable.programId })
      .from(staffProgramAssignmentsTable)
      .innerJoin(programsTable, eq(programsTable.id, staffProgramAssignmentsTable.programId))
      .where(and(
        eq(staffProgramAssignmentsTable.staffId, member.id),
        isNull(programsTable.archivedAt),
      ))
      .orderBy(staffProgramAssignmentsTable.programId);

    res.locals.staff = {
      id: member.id,
      email: member.email,
      role: member.role as StaffAccess["role"],
      status: member.status as StaffAccess["status"],
      bookingProvider: member.bookingProvider as StaffAccess["bookingProvider"],
      calendlyBookingUrl: member.calendlyBookingUrl,
      googleCalendarAccountEmail: member.googleCalendarAccountEmail,
      googleCalendarBookingUrl: member.googleCalendarBookingUrl,
      createdAt: member.createdAt,
      programIds: [...new Set(programAssignments.map(({ programId }) => programId))],
    } satisfies StaffAccess;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Could not resolve staff access");
    res.status(503).json({ error: "Staff access could not be verified right now." });
  }
};

export const requireCoordinator: RequestHandler = (_req, res, next): void => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (staff?.role !== "coordinator") {
    res.status(403).json({ error: "Coordinator access is required for this action." });
    return;
  }
  next();
};

export const requireOperationsStaff: RequestHandler = (_req, res, next): void => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || (staff.role !== "coordinator" && staff.role !== "staff")) {
    res.status(403).json({ error: "Program staff access is required for this area." });
    return;
  }
  next();
};

export type { StaffAccess };
