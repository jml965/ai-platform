import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectFilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess, getUserId } from "../middlewares/permissions";
import { SeoAgent, type SeoAnalysisResult } from "../lib/agents/seo-agent";

const router: IRouter = Router();

router.post("/projects/:projectId/seo/analyze", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const userId = getUserId(req);
    const projectId = req.params.projectId as string;

    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    if (files.length === 0) {
      res.status(400).json({
        error: { code: "NO_FILES", message: "Project has no files to analyze" },
      });
      return;
    }

    const existingFiles = files.map((f) => ({
      filePath: f.filePath,
      content: f.content,
    }));

    const agent = new SeoAgent();
    const result = await agent.execute({
      buildId: `seo-${Date.now()}`,
      projectId: projectId,
      userId: userId,
      prompt: "Analyze SEO",
      existingFiles,
      tokensUsedSoFar: 0,
    });

    if (!result.success) {
      res.status(500).json({
        error: { code: "ANALYSIS_FAILED", message: result.error || "SEO analysis failed" },
      });
      return;
    }

    const analysis = result.data?.analysis as SeoAnalysisResult;

    res.json({
      success: true,
      analysis,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error("SEO analysis error:", error);
    res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to run SEO analysis" },
    });
  }
});

router.post("/projects/:projectId/seo/apply", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const userId = getUserId(req);
    const projectId = req.params.projectId as string;
    const { metaSuggestions } = req.body as { metaSuggestions: unknown };

    if (!metaSuggestions || typeof metaSuggestions !== "object") {
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "metaSuggestions is required and must be an object" },
      });
      return;
    }

    const validKeys = ["title", "description", "keywords", "ogTitle", "ogDescription", "ogImage"];
    const suggestions = metaSuggestions as Record<string, unknown>;
    for (const key of Object.keys(suggestions)) {
      if (!validKeys.includes(key)) {
        res.status(400).json({
          error: { code: "BAD_REQUEST", message: `Invalid metaSuggestions key: ${key}` },
        });
        return;
      }
      if (suggestions[key] !== null && suggestions[key] !== undefined && typeof suggestions[key] !== "string") {
        res.status(400).json({
          error: { code: "BAD_REQUEST", message: `metaSuggestions.${key} must be a string or null` },
        });
        return;
      }
    }

    const validatedSuggestions = metaSuggestions as SeoAnalysisResult["metaSuggestions"];

    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    const htmlFile = files.find(
      (f) => f.filePath.endsWith(".html") || f.filePath.endsWith(".htm")
    );

    if (!htmlFile) {
      res.status(400).json({
        error: { code: "NO_HTML", message: "No HTML file found to apply changes" },
      });
      return;
    }

    const agent = new SeoAgent();
    const existingFiles = files.map((f) => ({
      filePath: f.filePath,
      content: f.content,
    }));

    const { content: fixedHtml, tokensUsed } = await agent.generateFixedHtml(
      htmlFile.content,
      validatedSuggestions,
      {
        buildId: `seo-fix-${Date.now()}`,
        projectId: projectId,
        userId: userId,
        prompt: "Apply SEO fixes",
        existingFiles,
        tokensUsedSoFar: 0,
      }
    );

    const cleaned = fixedHtml
      .replace(/```html\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const [updated] = await db
      .update(projectFilesTable)
      .set({
        content: cleaned,
        updatedAt: new Date(),
      })
      .where(eq(projectFilesTable.id, htmlFile.id))
      .returning();

    res.json({
      success: true,
      fileId: updated.id,
      filePath: updated.filePath,
      tokensUsed,
    });
  } catch (error) {
    console.error("SEO apply error:", error);
    res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to apply SEO improvements" },
    });
  }
});

export default router;
