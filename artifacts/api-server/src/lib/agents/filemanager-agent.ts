import { db } from "@workspace/db";
import { projectFilesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { validateFilePath, validateFileExtension, validateDirectoryPath } from "./constitution";
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
    files: GeneratedFile[],
    directories?: string[]
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const savedFiles: string[] = [];
    const createdDirectories: string[] = [];
    const errors: string[] = [];

    if (directories && directories.length > 0) {
      for (const dir of directories) {
        if (!validateDirectoryPath(dir, this.constitution.allowedDirectoryDepth)) {
          errors.push(`Invalid directory path: ${dir}`);
        } else {
          createdDirectories.push(dir);
        }
      }
    }

    const existingFiles = await db
      .select({ filePath: projectFilesTable.filePath })
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));
    const existingPaths = new Set(existingFiles.map((f) => f.filePath));
    const newPaths = files.filter((f) => !existingPaths.has(f.filePath));
    const totalAfterSave = existingPaths.size + newPaths.length;

    if (totalAfterSave > this.constitution.maxFilesPerProject) {
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: `Project file limit exceeded (max: ${this.constitution.maxFilesPerProject}, current: ${existingPaths.size}, adding: ${newPaths.length})`,
        data: { savedFiles: [], createdDirectories: [], errors: [`File limit exceeded`] },
      };
    }

    for (const file of files) {
      if (!validateFilePath(file.filePath, projectId, this.constitution.allowedDirectoryDepth)) {
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

    const criticalErrors = errors.filter(e =>
      !e.includes("Disallowed file extension") && !e.includes("File too large")
    );
    return {
      success: savedFiles.length > 0 && criticalErrors.length === 0,
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      data: { savedFiles, createdDirectories, errors },
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

  async getProjectStructure(
    projectId: string
  ): Promise<{ directories: string[]; files: { filePath: string; fileType: string }[] }> {
    const files = await db
      .select({
        filePath: projectFilesTable.filePath,
        fileType: projectFilesTable.fileType,
      })
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    const directories = new Set<string>();
    for (const file of files) {
      const parts = file.filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join("/"));
      }
    }

    return {
      directories: Array.from(directories).sort(),
      files: files.map((f) => ({ filePath: f.filePath, fileType: f.fileType })),
    };
  }

  async getFilesByDirectory(
    projectId: string,
    directory: string
  ): Promise<{ filePath: string; content: string }[]> {
    const allFiles = await this.getProjectFiles(projectId);
    const normalizedDir = directory.replace(/\/$/, "");

    return allFiles.filter((f) => {
      if (normalizedDir === "") return !f.filePath.includes("/");
      return f.filePath.startsWith(normalizedDir + "/");
    });
  }
}
