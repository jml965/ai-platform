import { pgTable, uuid, text, timestamp, integer, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentConfigsTable = pgTable("agent_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentKey: text("agent_key").notNull().unique(),
  displayNameEn: text("display_name_en").notNull(),
  displayNameAr: text("display_name_ar").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  isCustom: boolean("is_custom").notNull().default(false),

  governorEnabled: boolean("governor_enabled").notNull().default(false),
  governorModel: jsonb("governor_model").$type<{ provider: string; model: string; creativity: number; timeoutSeconds: number }>(),
  primaryModel: jsonb("primary_model").$type<{ provider: string; model: string; enabled: boolean; creativity: number; timeoutSeconds: number }>().notNull(),
  secondaryModel: jsonb("secondary_model").$type<{ provider: string; model: string; enabled: boolean; creativity: number; timeoutSeconds: number }>(),
  tertiaryModel: jsonb("tertiary_model").$type<{ provider: string; model: string; enabled: boolean; creativity: number; timeoutSeconds: number }>(),

  systemPrompt: text("system_prompt").notNull().default(""),
  instructions: text("instructions").default(""),
  permissions: jsonb("permissions").$type<string[]>().default([]),

  pipelineOrder: integer("pipeline_order").notNull().default(0),
  receivesFrom: text("receives_from"),
  sendsTo: text("sends_to"),
  roleOnReceive: text("role_on_receive"),
  roleOnSend: text("role_on_send"),

  tokenLimit: integer("token_limit").notNull().default(100000),
  batchSize: integer("batch_size").notNull().default(10),
  creativity: numeric("creativity", { precision: 3, scale: 2 }).notNull().default("0.70"),

  shortTermMemory: jsonb("short_term_memory").$type<any[]>().default([]),
  longTermMemory: jsonb("long_term_memory").$type<any[]>().default([]),

  sourceFiles: jsonb("source_files").$type<string[]>().default([]),

  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  totalTasksCompleted: integer("total_tasks_completed").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  avgExecutionMs: integer("avg_execution_ms").notNull().default(0),
  totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }).notNull().default("0.000000"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentConfigSchema = createInsertSchema(agentConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentConfig = z.infer<typeof insertAgentConfigSchema>;
export type AgentConfig = typeof agentConfigsTable.$inferSelect;
