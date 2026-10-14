import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  applicationsTable,
  db,
  staffMembersTable,
  userProfilesTable,
  type UserProfile,
} from "@workspace/db";

export type ProfileAccountType = "staff" | "participant" | "both";

export type ProfileIdentity = {
  userId: string;
  email: string;
  accountType: ProfileAccountType;
  fallbackDisplayName: string;
  fallbackPhone: string | null;
};

export type ProfileUpdateValues = {
  displayName?: string;
  phone?: string | null;
  bio?: string | null;
  organization?: string | null;
  photoPath?: string | null;
};

export function normalizeProfileUpdate(values: ProfileUpdateValues): ProfileUpdateValues | null {
  const normalized: ProfileUpdateValues = {};
  if (values.displayName !== undefined) {
    const displayName = values.displayName.trim();
    if (!displayName) return null;
    normalized.displayName = displayName;
  }
  for (const key of ["phone", "bio", "organization"] as const) {
    const value = values[key];
    if (value !== undefined) normalized[key] = typeof value === "string" ? value.trim() || null : null;
  }
  if (values.photoPath !== undefined) {
    normalized.photoPath = typeof values.photoPath === "string" ? values.photoPath.trim() || null : null;
  }
  return Object.keys(normalized).length ? normalized : null;
}

export function canEditUserProfile(actorUserId: string, targetUserId: string, isAdmin: boolean): boolean {
  return actorUserId === targetUserId || isAdmin;
}

export async function findProfileIdentity(userId: string): Promise<ProfileIdentity | null> {
  const [staff] = await db.select({ email: staffMembersTable.email })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.clerkUserId, userId))
    .limit(1);
  const [application] = await db.select({
    email: applicationsTable.email,
    founderName: applicationsTable.founderName,
    phone: applicationsTable.phone,
  })
    .from(applicationsTable)
    .where(eq(applicationsTable.clerkUserId, userId))
    .orderBy(desc(applicationsTable.createdAt))
    .limit(1);
  if (!staff && !application) return null;

  const accountType: ProfileAccountType = staff && application ? "both" : staff ? "staff" : "participant";
  const email = staff?.email ?? application?.email;
  if (!email) return null;
  return {
    userId,
    email,
    accountType,
    fallbackDisplayName: application?.founderName || email.split("@")[0] || email,
    fallbackPhone: application?.phone ?? null,
  };
}

export async function ensureUserProfile(identity: ProfileIdentity): Promise<UserProfile> {
  await db.insert(userProfilesTable)
    .values({
      userId: identity.userId,
      displayName: identity.fallbackDisplayName,
      phone: identity.fallbackPhone,
    })
    .onConflictDoNothing();
  const [profile] = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.userId, identity.userId))
    .limit(1);
  if (!profile) throw new Error("Could not load the user profile.");
  return profile;
}

export async function findStoredUserProfile(userId: string): Promise<UserProfile | null> {
  const [profile] = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  return profile ?? null;
}

export async function updateUserProfile(
  identity: ProfileIdentity,
  values: ProfileUpdateValues,
): Promise<UserProfile> {
  const current = await ensureUserProfile(identity);
  const [profile] = await db.update(userProfilesTable)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(userProfilesTable.userId, identity.userId))
    .returning();
  if (!profile) return current;
  return profile;
}

export async function listRegisteredUserProfiles(): Promise<Array<{
  identity: ProfileIdentity;
  profile: UserProfile | null;
}>> {
  const staff = await db.select({
    userId: staffMembersTable.clerkUserId,
    email: staffMembersTable.email,
  }).from(staffMembersTable)
    .where(isNotNull(staffMembersTable.clerkUserId));
  const applications = await db.select({
    userId: applicationsTable.clerkUserId,
    email: applicationsTable.email,
    founderName: applicationsTable.founderName,
    phone: applicationsTable.phone,
  }).from(applicationsTable)
    .where(isNotNull(applicationsTable.clerkUserId))
    .orderBy(desc(applicationsTable.createdAt));

  const identities = new Map<string, ProfileIdentity>();
  const participantUsers = new Set<string>();
  for (const member of staff) {
    if (!member.userId) continue;
    identities.set(member.userId, {
      userId: member.userId,
      email: member.email,
      accountType: "staff",
      fallbackDisplayName: member.email.split("@")[0] || member.email,
      fallbackPhone: null,
    });
  }
  for (const application of applications) {
    if (!application.userId) continue;
    const existing = identities.get(application.userId);
    const isFirstApplication = !participantUsers.has(application.userId);
    participantUsers.add(application.userId);
    identities.set(application.userId, {
      userId: application.userId,
      email: existing?.email ?? application.email,
      accountType: existing ? "both" : "participant",
      fallbackDisplayName: isFirstApplication ? application.founderName : existing?.fallbackDisplayName ?? application.founderName,
      fallbackPhone: isFirstApplication ? application.phone : existing?.fallbackPhone ?? application.phone,
    });
  }

  const userIds = [...identities.keys()];
  if (!userIds.length) return [];
  const profiles = await db.select().from(userProfilesTable)
    .where(inArray(userProfilesTable.userId, userIds));
  const profilesByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  return [...identities.values()]
    .map((identity) => ({ identity, profile: profilesByUserId.get(identity.userId) ?? null }))
    .sort((a, b) => {
      const aName = a.profile?.displayName ?? a.identity.fallbackDisplayName;
      const bName = b.profile?.displayName ?? b.identity.fallbackDisplayName;
      return aName.localeCompare(bName);
    });
}
