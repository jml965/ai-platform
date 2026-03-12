import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const sandboxInstancesTable = pgTable("sandbox_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("created"),
  runtime: text("runtime").notNull().default("node"),
  port: integer("port"),
  pid: integer("pid"),
  workDir: text("work_dir"),
  memoryLimitMb: integer("memory_limit_mb").default(256),
  timeoutSeconds: integer("timeout_seconds").default(300),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  stoppedAt: timestamp("stopped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSandboxInstanceSchema = createInsertSchema(sandboxInstancesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSandboxInstance = z.infer<typeof insertSandboxInstanceSchema>;
export type SandboxInstance = typeof sandboxInstancesTable.$inferSelect;
