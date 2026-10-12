import type { RequestHandler } from "express";
import type { StaffAccess } from "./staffAccess";

export function requireRole(...roles: StaffAccess["role"][]): RequestHandler {
  return (_req, res, next): void => {
    const staff = res.locals.staff as StaffAccess | undefined;
    if (!staff || staff.status !== "active" || !roles.includes(staff.role)) {
      res.status(403).json({ error: "This account does not have access to this role view." });
      return;
    }
    next();
  };
}
