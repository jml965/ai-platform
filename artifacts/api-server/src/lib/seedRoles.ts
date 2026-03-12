import { db } from "@workspace/db";
import { rolesTable, permissionsTable } from "@workspace/db/schema";
import { count, eq } from "drizzle-orm";

const ROLES_DATA = [
  { name: "admin", displayName: "Admin", displayNameAr: "مدير", level: "4" },
  { name: "developer", displayName: "Developer", displayNameAr: "مطور", level: "3" },
  { name: "reviewer", displayName: "Reviewer", displayNameAr: "مراجع", level: "2" },
  { name: "viewer", displayName: "Viewer", displayNameAr: "مشاهد", level: "1" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
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

export async function seedRolesAndPermissions() {
  const existing = await db.select({ cnt: count() }).from(rolesTable);
  if ((existing[0]?.cnt ?? 0) >= 4) return;

  for (const roleData of ROLES_DATA) {
    const [role] = await db
      .insert(rolesTable)
      .values(roleData)
      .onConflictDoNothing()
      .returning();

    if (role) {
      const perms = ROLE_PERMISSIONS[roleData.name] ?? [];
      for (const perm of perms) {
        await db
          .insert(permissionsTable)
          .values({ roleId: role.id, permission: perm })
          .onConflictDoNothing();
      }
    }
  }

  console.log("[Seed] Roles and permissions seeded");
}
