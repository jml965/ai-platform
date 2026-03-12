import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { teamsTable } from "./teams";

export const teamMembersTable = pgTable("team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  unique("team_members_team_user_unique").on(table.teamId, table.userId),
]);

export type TeamMember = typeof teamMembersTable.$inferSelect;
