import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, projectFilesTable } from "@workspace/db/schema";
import { getUserId } from "../middlewares/permissions";
import { TEMPLATES } from "../lib/template-data";

const router: IRouter = Router();

router.get("/templates", (_req, res) => {
  const list = TEMPLATES.map(({ files, ...rest }) => ({
    ...rest,
    fileCount: files.length,
  }));
  res.json({ data: list });
});

router.post("/templates/use", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { templateId } = req.body;

    if (!templateId || typeof templateId !== "string") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "templateId is required" } });
      return;
    }

    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Template not found" } });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projectsTable)
        .values({
          userId,
          name: template.nameAr,
          description: `Created from template: ${template.nameEn}`,
          status: "ready",
        })
        .returning();

      if (template.files.length > 0) {
        await tx.insert(projectFilesTable).values(
          template.files.map((f) => ({
            projectId: project.id,
            filePath: f.filePath,
            content: f.content,
            fileType: f.fileType,
          }))
        );
      }

      return project;
    });

    res.status(201).json({
      id: result.id,
      userId: result.userId,
      name: result.name,
      description: result.description,
      status: result.status,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to create project from template:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to create project from template" } });
  }
});

export default router;
