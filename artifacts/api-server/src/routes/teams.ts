import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  teamsTable,
  teamMembersTable,
  teamInvitationsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  getUserId,
  getUserTeamRole,
  requireTeamPermission,
  hasPermission,
} from "../middlewares/permissions";

const router: IRouter = Router();

router.get("/teams", async (req, res) => {
  try {
    const userId = getUserId(req);
    const memberships = await db
      .select({
        teamId: teamMembersTable.teamId,
        role: teamMembersTable.role,
      })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, userId));

    if (memberships.length === 0) {
      return res.json({ data: [] });
    }

    const teamIds = memberships.map((m) => m.teamId);
    const teams = await db.select().from(teamsTable);
    const userTeams = teams.filter((t) => teamIds.includes(t.id));

    const allMembers = await db.select().from(teamMembersTable);

    const data = userTeams.map((team) => ({
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      memberCount: allMembers.filter((m) => m.teamId === team.id).length,
      createdAt: team.createdAt.toISOString(),
    }));

    return res.json({ data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/teams", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Team name is required" });
    }

    const [team] = await db
      .insert(teamsTable)
      .values({ name: name.trim(), ownerId: userId })
      .returning();

    await db.insert(teamMembersTable).values({
      teamId: team.id,
      userId,
      role: "admin",
    });

    return res.status(201).json({
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      memberCount: 1,
      createdAt: team.createdAt.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/teams/:teamId", requireTeamPermission("team.view"), async (req, res) => {
  try {
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, req.params.teamId))
      .limit(1);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const members = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, team.id));

    return res.json({
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      memberCount: members.length,
      createdAt: team.createdAt.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch("/teams/:teamId", requireTeamPermission("team.manage"), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Team name is required" });
    }

    const [team] = await db
      .update(teamsTable)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(teamsTable.id, req.params.teamId))
      .returning();

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const members = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, team.id));

    return res.json({
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      memberCount: members.length,
      createdAt: team.createdAt.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/teams/:teamId", requireTeamPermission("team.manage"), async (req, res) => {
  try {
    const userId = getUserId(req);
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, req.params.teamId))
      .limit(1);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    if (team.ownerId !== userId) {
      return res.status(403).json({
        error: "Only the team owner can delete the team",
        errorAr: "فقط مالك الفريق يمكنه حذف الفريق",
      });
    }

    await db.delete(teamsTable).where(eq(teamsTable.id, req.params.teamId));

    return res.json({ success: true, message: "Team deleted" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/teams/:teamId/members", requireTeamPermission("team.view"), async (req, res) => {
  try {
    const members = await db
      .select({
        id: teamMembersTable.id,
        userId: teamMembersTable.userId,
        role: teamMembersTable.role,
        joinedAt: teamMembersTable.joinedAt,
        displayName: usersTable.displayName,
        email: usersTable.email,
      })
      .from(teamMembersTable)
      .innerJoin(usersTable, eq(teamMembersTable.userId, usersTable.id))
      .where(eq(teamMembersTable.teamId, req.params.teamId));

    return res.json({
      data: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName,
        email: m.email,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/teams/:teamId/invite", requireTeamPermission("team.invite"), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { email, role } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const validRoles = ["admin", "developer", "reviewer", "viewer"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be: admin, developer, reviewer, or viewer" });
    }

    const [existing] = await db
      .select()
      .from(teamInvitationsTable)
      .where(
        and(
          eq(teamInvitationsTable.teamId, req.params.teamId),
          eq(teamInvitationsTable.email, email),
          eq(teamInvitationsTable.status, "pending")
        )
      )
      .limit(1);

    if (existing) {
      return res.status(409).json({
        error: "An invitation is already pending for this email",
        errorAr: "يوجد دعوة معلقة لهذا البريد الإلكتروني",
      });
    }

    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUser) {
      const [alreadyMember] = await db
        .select()
        .from(teamMembersTable)
        .where(
          and(
            eq(teamMembersTable.teamId, req.params.teamId),
            eq(teamMembersTable.userId, existingUser.id)
          )
        )
        .limit(1);

      if (alreadyMember) {
        return res.status(409).json({
          error: "User is already a member of this team",
          errorAr: "المستخدم عضو بالفعل في هذا الفريق",
        });
      }
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(teamInvitationsTable).values({
      teamId: req.params.teamId,
      email,
      role,
      token,
      invitedBy: userId,
      expiresAt,
    });

    console.log(`[Teams] Invitation sent to ${email} for team ${req.params.teamId} with role ${role}`);

    return res.json({
      success: true,
      message: `Invitation sent to ${email}`,
      messageAr: `تم إرسال الدعوة إلى ${email}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch(
  "/teams/:teamId/members/:userId",
  requireTeamPermission("team.manage"),
  async (req, res) => {
    try {
      const currentUserId = getUserId(req);
      const targetUserId = req.params.userId;
      const { role } = req.body;

      const validRoles = ["admin", "developer", "reviewer", "viewer"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      if (currentUserId === targetUserId) {
        return res.status(400).json({
          error: "Cannot change your own role",
          errorAr: "لا يمكنك تغيير دورك",
        });
      }

      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.id, req.params.teamId))
        .limit(1);

      if (team && team.ownerId === targetUserId && role !== "admin") {
        return res.status(400).json({
          error: "Cannot change the owner's role",
          errorAr: "لا يمكن تغيير دور مالك الفريق",
        });
      }

      const [member] = await db
        .update(teamMembersTable)
        .set({ role })
        .where(
          and(
            eq(teamMembersTable.teamId, req.params.teamId),
            eq(teamMembersTable.userId, targetUserId)
          )
        )
        .returning();

      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, targetUserId))
        .limit(1);

      return res.json({
        id: member.id,
        userId: member.userId,
        displayName: user?.displayName ?? "",
        email: user?.email ?? "",
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
);

router.delete(
  "/teams/:teamId/members/:userId",
  requireTeamPermission("team.manage"),
  async (req, res) => {
    try {
      const currentUserId = getUserId(req);
      const targetUserId = req.params.userId;

      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.id, req.params.teamId))
        .limit(1);

      if (team && team.ownerId === targetUserId) {
        return res.status(400).json({
          error: "Cannot remove the team owner",
          errorAr: "لا يمكن إزالة مالك الفريق",
        });
      }

      const deleted = await db
        .delete(teamMembersTable)
        .where(
          and(
            eq(teamMembersTable.teamId, req.params.teamId),
            eq(teamMembersTable.userId, targetUserId)
          )
        )
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Member not found" });
      }

      return res.json({ success: true, message: "Member removed" });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
);

router.post("/teams/accept/:token", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { token } = req.params;

    const [invitation] = await db
      .select()
      .from(teamInvitationsTable)
      .where(
        and(
          eq(teamInvitationsTable.token, token),
          eq(teamInvitationsTable.status, "pending")
        )
      )
      .limit(1);

    if (!invitation) {
      return res.status(404).json({
        error: "Invitation not found or already used",
        errorAr: "الدعوة غير موجودة أو مستخدمة بالفعل",
      });
    }

    if (new Date() > invitation.expiresAt) {
      await db
        .update(teamInvitationsTable)
        .set({ status: "expired" })
        .where(eq(teamInvitationsTable.id, invitation.id));

      return res.status(410).json({
        error: "Invitation has expired",
        errorAr: "انتهت صلاحية الدعوة",
      });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        error: "This invitation was sent to a different email address",
        errorAr: "هذه الدعوة أُرسلت إلى عنوان بريد إلكتروني مختلف",
      });
    }

    const [alreadyMember] = await db
      .select()
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, invitation.teamId),
          eq(teamMembersTable.userId, userId)
        )
      )
      .limit(1);

    if (alreadyMember) {
      await db
        .update(teamInvitationsTable)
        .set({ status: "accepted" })
        .where(eq(teamInvitationsTable.id, invitation.id));

      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.id, invitation.teamId))
        .limit(1);

      return res.json({
        id: team?.id ?? invitation.teamId,
        name: team?.name ?? "",
        ownerId: team?.ownerId ?? "",
        createdAt: team?.createdAt?.toISOString() ?? new Date().toISOString(),
      });
    }

    await db.insert(teamMembersTable).values({
      teamId: invitation.teamId,
      userId,
      role: invitation.role,
    });

    await db
      .update(teamInvitationsTable)
      .set({ status: "accepted" })
      .where(eq(teamInvitationsTable.id, invitation.id));

    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, invitation.teamId))
      .limit(1);

    const members = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, invitation.teamId));

    return res.json({
      id: team?.id ?? invitation.teamId,
      name: team?.name ?? "",
      ownerId: team?.ownerId ?? "",
      memberCount: members.length,
      createdAt: team?.createdAt?.toISOString() ?? new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
