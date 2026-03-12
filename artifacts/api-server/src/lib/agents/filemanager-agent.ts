import { db } from "@workspace/db";
import { projectFilesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { validateFilePath, validateFileExtension } from "./constitution";
import type { AgentConstitution } from "./constitution";
import type { AgentResult, GeneratedFile, AgentType } from "./types";

export class FileManagerAgent {
  readonly agentType: AgentType = "filemanager";
  private constitution: AgentConstitution;

  constructor(constitution: AgentConstitution) {
    this.constitution = constitution;
  }

  async saveFiles(
    projectId: string,
    files: GeneratedFile[]
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const savedFiles: string[] = [];
    const errors: string[] = [];

    const existingCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));
    const currentFileCount = existingCount[0]?.count ?? 0;
    const newFileCount = files.filter(
      (f) => !files.some((ef) => ef.filePath === f.filePath)
    ).length;

    if (currentFileCount + newFileCount > this.constitution.maxFilesPerProject) {
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: `Project file limit exceeded (max: ${this.constitution.maxFilesPerProject}, current: ${currentFileCount}, adding: ${newFileCount})`,
        data: { savedFiles: [], errors: [`File limit exceeded`] },
      };
    }

    for (const file of files) {
      if (!validateFilePath(file.filePath, projectId)) {
        errors.push(`Invalid file path: ${file.filePath}`);
        continue;
      }
      if (!validateFileExtension(file.filePath, this.constitution)) {
        errors.push(`Disallowed file extension: ${file.filePath}`);
        continue;
      }
      if (file.content.length > this.constitution.maxFileSizeBytes) {
        errors.push(`File too large: ${file.filePath}`);
        continue;
      }

      try {
        const existing = await db
          .select()
          .from(projectFilesTable)
          .where(
            and(
              eq(projectFilesTable.projectId, projectId),
              eq(projectFilesTable.filePath, file.filePath)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(projectFilesTable)
            .set({
              content: file.content,
              fileType: file.fileType,
              version: (existing[0].version ?? 1) + 1,
              updatedAt: new Date(),
            })
            .where(eq(projectFilesTable.id, existing[0].id));
        } else {
          await db.insert(projectFilesTable).values({
            projectId,
            filePath: file.filePath,
            content: file.content,
            fileType: file.fileType,
          });
        }
        savedFiles.push(file.filePath);
      } catch (error) {
        errors.push(
          `Failed to save ${file.filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      success: errors.length === 0,
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      data: { savedFiles, errors },
    };
  }

  async getProjectFiles(
    projectId: string
  ): Promise<{ filePath: string; content: string }[]> {
    const files = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    return files.map((f) => ({
      filePath: f.filePath,
      content: f.content,
    }));
  }
}
