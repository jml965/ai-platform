import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { teamMembersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

export type TeamRole = "admin" | "developer" | "reviewer" | "viewer";

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  admin: 4,
  developer: 3,
  reviewer: 2,
  viewer: 1,
};

export type Permission =
  | "team.manage"
  | "team.invite"
  | "team.view"
  | "project.create"
  | "project.edit"
  | "project.view"
  | "project.delete"
  | "build.start"
  | "build.cancel"
  | "build.view"
  | "billing.view"
  | "billing.manage"
  | "logs.view";

const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  admin: [
    "team.manage", "team.invite", "team.view",
    "project.create", "project.edit", "project.view", "project.delete",
    "build.start", "build.cancel", "build.view",
    "billing.view", "billing.manage",
    "logs.view",
  ],
  developer: [
    "team.view",
    "project.create", "project.edit", "project.view",
    "build.start", "build.cancel", "build.view",
    "logs.view",
  ],
  reviewer: [
    "team.view",
    "project.view",
    "build.view",
    "logs.view",
  ],
  viewer: [
    "team.view",
    "project.view",
  ],
};

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getUserId(req: any): string {
  return req.user?.id ?? SEED_USER_ID;
}

export async function getUserTeamRole(userId: string, teamId: string): Promise<TeamRole | null> {
  const [member] = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)))
    .limit(1);
  return member ? (member.role as TeamRole) : null;
}

export function requireTeamPermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    const teamId = req.params.teamId;

    if (!teamId) {
      return res.status(400).json({ error: "Missing teamId parameter" });
    }

    const role = await getUserTeamRole(userId, teamId);
    if (!role) {
      return res.status(403).json({
        error: "You are not a member of this team",
        errorAr: "لست عضواً في هذا الفريق",
      });
    }

    if (!hasPermission(role, permission)) {
      return res.status(403).json({
        error: "You do not have permission to perform this action",
        errorAr: "ليس لديك صلاحية لتنفيذ هذا الإجراء",
      });
    }

    (req as any).teamRole = role;
    next();
  };
}
