import { Router, type IRouter } from "express";
import { PLUGIN_DEFINITIONS, PLUGIN_CATEGORIES, getPluginById } from "../lib/plugins/plugin-definitions";
import { db } from "@workspace/db";
import { projectFilesTable, projectsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "../middlewares/permissions";

const router: IRouter = Router();

router.get("/plugins", (_req, res) => {
  const plugins = PLUGIN_DEFINITIONS.map(p => ({
    id: p.id,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    descriptionEn: p.descriptionEn,
    descriptionAr: p.descriptionAr,
    category: p.category,
    icon: p.icon,
    previewHtml: p.previewHtml,
  }));
  res.json({ data: plugins, categories: PLUGIN_CATEGORIES });
});

router.get("/plugins/:pluginId", (req, res) => {
  const plugin = getPluginById(req.params.pluginId);
  if (!plugin) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Plugin not found" } });
    return;
  }
  res.json(plugin);
});

function containsPlugin(content: string, pluginId: string): boolean {
  return content.includes(`data-plugin="${pluginId}"`) ||
    content.includes(`id="plugin-${pluginId}"`) ||
    content.includes(`Plugin: ${pluginId}`);
}

router.post("/projects/:projectId/plugins", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { pluginId } = req.body;

    if (!pluginId || typeof pluginId !== "string") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "pluginId is required" } });
      return;
    }

    const plugin = getPluginById(pluginId);
    if (!plugin) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Plugin not found" } });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId))
      .limit(1);

    if (!project || project.userId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      return;
    }

    const existingFiles = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, req.params.projectId));

    if (existingFiles.length === 0) {
      res.status(422).json({ error: { code: "NO_FILES", message: "Project has no files yet. Build your project first before adding plugins." } });
      return;
    }

    const htmlFile = existingFiles.find(f => f.filePath?.endsWith(".html"));

    const alreadyAdded = existingFiles.some(f => f.content && containsPlugin(f.content, plugin.id));
    if (alreadyAdded) {
      res.status(409).json({ error: { code: "ALREADY_EXISTS", message: "Plugin already added to this project" } });
      return;
    }

    let modified = false;

    if (htmlFile && htmlFile.content) {
      let htmlContent = htmlFile.content;
      const hadHead = htmlContent.includes("</head>");
      const hadBody = htmlContent.includes("</body>");

      if (plugin.codeCss) {
        const cssTag = `<style data-plugin="${plugin.id}">${plugin.codeCss}</style>`;
        if (hadHead) {
          htmlContent = htmlContent.replace("</head>", `${cssTag}\n</head>`);
        } else {
          htmlContent = cssTag + "\n" + htmlContent;
        }
      }

      if (plugin.codeHtml) {
        if (hadBody) {
          htmlContent = htmlContent.replace("</body>", `${plugin.codeHtml}\n</body>`);
        } else {
          htmlContent = htmlContent + "\n" + plugin.codeHtml;
        }
      }

      if (plugin.codeJs) {
        const jsTag = `<script data-plugin="${plugin.id}">${plugin.codeJs}<\/script>`;
        if (htmlContent.includes("</body>")) {
          htmlContent = htmlContent.replace("</body>", `${jsTag}\n</body>`);
        } else {
          htmlContent = htmlContent + "\n" + jsTag;
        }
      }

      if (htmlContent !== htmlFile.content) {
        await db
          .update(projectFilesTable)
          .set({ content: htmlContent })
          .where(eq(projectFilesTable.id, htmlFile.id));
        modified = true;
      }
    } else {
      const cssFile = existingFiles.find(f => f.filePath?.endsWith(".css"));
      const jsFile = existingFiles.find(f => f.filePath?.endsWith(".js"));

      if (cssFile && cssFile.content && plugin.codeCss) {
        await db
          .update(projectFilesTable)
          .set({ content: cssFile.content + `\n\n/* Plugin: ${plugin.id} */\n` + plugin.codeCss })
          .where(eq(projectFilesTable.id, cssFile.id));
        modified = true;
      }

      if (jsFile && jsFile.content && plugin.codeJs) {
        await db
          .update(projectFilesTable)
          .set({ content: jsFile.content + `\n\n// Plugin: ${plugin.id}\n` + plugin.codeJs })
          .where(eq(projectFilesTable.id, jsFile.id));
        modified = true;
      }

      if (!modified && (plugin.codeHtml || plugin.codeCss || plugin.codeJs)) {
        let pluginHtml = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n";
        if (plugin.codeCss) {
          pluginHtml += `<style data-plugin="${plugin.id}">${plugin.codeCss}</style>\n`;
        }
        pluginHtml += "</head>\n<body>\n";
        if (plugin.codeHtml) {
          pluginHtml += plugin.codeHtml + "\n";
        }
        if (plugin.codeJs) {
          pluginHtml += `<script data-plugin="${plugin.id}">${plugin.codeJs}<\/script>\n`;
        }
        pluginHtml += "</body>\n</html>";

        await db
          .insert(projectFilesTable)
          .values({
            projectId: req.params.projectId,
            filePath: `plugin-${plugin.id}.html`,
            content: pluginHtml,
            fileType: "html",
            version: 1,
          });
        modified = true;
      }
    }

    if (!modified) {
      res.status(422).json({ error: { code: "INJECTION_FAILED", message: "Could not inject plugin into project files" } });
      return;
    }

    res.json({
      success: true,
      pluginId: plugin.id,
      pluginName: plugin.nameEn,
      message: `Plugin "${plugin.nameEn}" added successfully`,
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to add plugin" } });
  }
});

export default router;
