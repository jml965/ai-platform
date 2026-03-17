import { pgTable, uuid, text, timestamp, integer, numeric, boolean, jsonb } from "drizzle-orm/pg-core";

export const mediaProvidersTable = pgTable("media_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerKey: text("provider_key").notNull().unique(),
  type: text("type").notNull(),
  displayName: text("display_name").notNull(),
  displayNameAr: text("display_name_ar").notNull(),
  logo: text("logo").default(""),
  website: text("website").default(""),
  apiKeyUrl: text("api_key_url").default(""),
  apiKey: text("api_key").default(""),
  keyStatus: text("key_status").notNull().default("inactive"),
  isCustom: boolean("is_custom").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(10),

  parentProvider: text("parent_provider").default(""),

  maxFileSizeMb: integer("max_file_size_mb").notNull().default(10),

  models: jsonb("models").$type<{
    id: string;
    name: string;
    maxResolution: string;
    costPerRequest: number;
    costPerToken: number;
    maxFileSizeMb: number;
    description: string;
  }[]>().default([]),

  budgetMonthlyUsd: numeric("budget_monthly_usd", { precision: 10, scale: 2 }).default("0.00"),
  alertThreshold: integer("alert_threshold").notNull().default(80),

  totalRequests: integer("total_requests").notNull().default(0),
  totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }).notNull().default("0.000000"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mediaUsageLogsTable = pgTable("media_usage_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerKey: text("provider_key").notNull(),
  modelId: text("model_id").notNull(),
  agentKey: text("agent_key"),
  type: text("type").notNull(),
  fileSizeMb: numeric("file_size_mb", { precision: 8, scale: 2 }).default("0.00"),
  tokensUsed: integer("tokens_used").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0.000000"),
  durationMs: integer("duration_ms").default(0),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MediaProvider = typeof mediaProvidersTable.$inferSelect;
export type MediaUsageLog = typeof mediaUsageLogsTable.$inferSelect;
