import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { teamMembersTable, projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

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
    "project.view",
    "build.view",
    "logs.view",
  ],
  viewer: [
    "project.view",
  ],
};

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getUserId(req: Request): string {
  if (!req.user) {
    throw new Error("getUserId called without authenticated user");
  }
  return req.user.id;
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
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
        errorAr: "يجب تسجيل الدخول",
      });
    }

    const userId = req.user.id;
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

    req.teamRole = role;
    next();
  };
}

export function requireBillingAccess(permission: "billing.view" | "billing.manage") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
        errorAr: "يجب تسجيل الدخول",
      });
    }

    const userId = req.user.id;

    const memberships = await db
      .select({ role: teamMembersTable.role })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, userId));

    if (memberships.length === 0) {
      return next();
    }

    const hasAccess = memberships.some((m) =>
      hasPermission(m.role as TeamRole, permission)
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: "You do not have permission to access billing",
        errorAr: "ليس لديك صلاحية للوصول إلى الفوترة",
      });
    }

    next();
  };
}

export function requireProjectAccess(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
        errorAr: "يجب تسجيل الدخول",
      });
    }

    const userId = req.user.id;
    const projectId = req.params.projectId;

    if (!projectId) {
      return next();
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
        errorAr: "المشروع غير موجود",
      });
    }

    if (project.userId === userId) {
      req.teamRole = "admin";
      return next();
    }

    if (project.teamId) {
      const role = await getUserTeamRole(userId, project.teamId);
      if (role && hasPermission(role, permission)) {
        req.teamRole = role;
        return next();
      }
    }

    return res.status(403).json({
      error: "You do not have access to this project",
      errorAr: "ليس لديك صلاحية للوصول إلى هذا المشروع",
    });
  };
}
