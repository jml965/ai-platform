import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const teamInvitationsTable = pgTable("team_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  invitedBy: uuid("invited_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type TeamInvitation = typeof teamInvitationsTable.$inferSelect;
