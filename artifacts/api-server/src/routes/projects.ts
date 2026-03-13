import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, projectFilesTable, teamMembersTable } from "@workspace/db/schema";
import { eq, and, desc, sql, or, inArray } from "drizzle-orm";
import {
  CreateProjectBody,
  UpdateProjectBody,
} from "@workspace/api-zod";
import { requireProjectAccess, getUserId, getUserTeamRole, hasPermission } from "../middlewares/permissions";
import multer from "multer";
import path from "path";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon",
      "font/woff", "font/woff2", "font/ttf",
      "application/pdf",
      "text/plain", "text/css", "text/html", "text/javascript",
      "application/json", "application/javascript",
    ];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const router: IRouter = Router();

router.get("/projects", async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const teamMemberships = await db
      .select({ teamId: teamMembersTable.teamId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, userId));

    const teamIds = teamMemberships.map((m) => m.teamId);

    const accessCondition = teamIds.length > 0
      ? or(
          eq(projectsTable.userId, userId),
          inArray(projectsTable.teamId, teamIds)
        )
      : eq(projectsTable.userId, userId);

    const [projects, countResult] = await Promise.all([
      db
        .select()
        .from(projectsTable)
        .where(accessCondition)
        .orderBy(desc(projectsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(projectsTable).where(accessCondition),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({
      data: projects.map(mapProject),
      meta: { page, limit, total },
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list projects" } });
  }
});

router.post("/projects", async (req, res) => {
  try {
    const userId = getUserId(req);
    const body = CreateProjectBody.parse(req.body);

    if (body.teamId) {
      const role = await getUserTeamRole(userId, body.teamId);
      if (!role) {
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "You are not a member of this team" },
        });
        return;
      }
      if (!hasPermission(role, "project.create")) {
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "You do not have permission to create projects in this team" },
        });
        return;
      }
    }

    const [project] = await db
      .insert(projectsTable)
      .values({
        userId,
        name: body.name,
        description: body.description,
        teamId: body.teamId,
      })
      .returning();

    res.status(201).json(mapProject(project));
  } catch (error) {
    res.status(400).json({ error: { code: "VALIDATION", message: "Invalid project data" } });
  }
});

router.get("/projects/:projectId", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }

    res.json(mapProject(project));
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get project" } });
  }
});

router.patch("/projects/:projectId", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const body = UpdateProjectBody.parse(req.body);

    const [project] = await db
      .update(projectsTable)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, req.params.projectId))
      .returning();

    if (!project) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }

    res.json(mapProject(project));
  } catch (error) {
    res.status(400).json({ error: { code: "VALIDATION", message: "Invalid update data" } });
  }
});

router.delete("/projects/:projectId", requireProjectAccess("project.delete"), async (req, res) => {
  try {
    const [project] = await db
      .delete(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId))
      .returning();

    if (!project) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }

    res.json({ success: true, message: "Project deleted" });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to delete project" } });
  }
});

router.get("/projects/:projectId/files", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, req.params.projectId))
      .orderBy(projectFilesTable.filePath);

    res.json({
      data: files.map(mapFile),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list files" } });
  }
});

router.get("/projects/:projectId/files/:fileId", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const [file] = await db
      .select()
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.id, req.params.fileId),
          eq(projectFilesTable.projectId, req.params.projectId)
        )
      )
      .limit(1);

    if (!file) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found" } });
      return;
    }

    res.json(mapFile(file));
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get file" } });
  }
});

router.patch("/projects/:projectId/files/:fileId", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "content is required" } });
      return;
    }

    const [updated] = await db
      .update(projectFilesTable)
      .set({
        content,
        version: sql`${projectFilesTable.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectFilesTable.id, req.params.fileId),
          eq(projectFilesTable.projectId, req.params.projectId)
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found" } });
      return;
    }

    res.json(mapFile(updated));
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to update file" } });
  }
});

function mapProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    teamId: p.teamId,
    name: p.name,
    description: p.description,
    status: p.status,
    totalTokensUsed: p.totalTokensUsed ?? 0,
    totalCostUsd: Number(p.totalCostUsd) || 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function mapFile(f: typeof projectFilesTable.$inferSelect) {
  return {
    id: f.id,
    projectId: f.projectId,
    filePath: f.filePath,
    content: f.content,
    fileType: f.fileType,
    version: f.version ?? 1,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

router.post("/projects/:projectId/upload", requireProjectAccess("project.edit"), (req, res, next) => {
  upload.array("files", 10)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "File exceeds 2MB limit" } });
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({ error: { code: "TOO_MANY_FILES", message: "Maximum 10 files per upload" } });
          return;
        }
        res.status(400).json({ error: { code: "UPLOAD_ERROR", message: err.message } });
        return;
      }
      res.status(400).json({ error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed" } });
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "No files uploaded" } });
      return;
    }

    const allowedDirs = ["public/assets", "public/images", "src/assets", "assets"];
    const rawDir = (req.body.directory as string) || "public/assets";
    const normalizedDir = path.normalize(rawDir).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    if (normalizedDir.includes("..") || path.isAbsolute(rawDir) || !allowedDirs.some(d => normalizedDir.startsWith(d))) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid upload directory" } });
      return;
    }
    const targetDir = normalizedDir;

    const savedFiles: { filePath: string; size: number; mimeType: string }[] = [];

    for (const file of files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${targetDir}/${safeName}`;
      const isTextFile = file.mimetype.startsWith("text/") || file.mimetype === "application/json" || file.mimetype === "application/javascript";
      const content = isTextFile
        ? file.buffer.toString("utf-8")
        : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

      const ext = path.extname(safeName).slice(1) || "bin";
      const existing = await db
        .select()
        .from(projectFilesTable)
        .where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.filePath, filePath)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(projectFilesTable)
          .set({ content, updatedAt: new Date(), version: sql`${projectFilesTable.version} + 1` })
          .where(eq(projectFilesTable.id, existing[0].id));
      } else {
        await db.insert(projectFilesTable).values({
          projectId,
          filePath,
          content,
          fileType: ext,
          version: 1,
        });
      }

      savedFiles.push({ filePath, size: file.size, mimeType: file.mimetype });
    }

    res.json({ success: true, files: savedFiles });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Upload failed";
    res.status(500).json({ error: { code: "INTERNAL", message: msg } });
  }
});

export default router;
