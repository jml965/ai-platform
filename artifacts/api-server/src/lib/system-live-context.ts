import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  usersTable,
  projectsTable,
  projectFilesTable,
  agentConfigsTable,
  teamsTable,
  teamMembersTable,
  deploymentsTable,
  executionLogsTable,
  agentLogsTable,
} from "@workspace/db/schema";
import { eq, desc, count } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export async function getLiveDbStats(): Promise<string> {
  try {
    const [userCount] = await db.select({ count: count() }).from(usersTable);
    const [projectCount] = await db.select({ count: count() }).from(projectsTable);
    const [fileCount] = await db.select({ count: count() }).from(projectFilesTable);
    const [agentCount] = await db.select({ count: count() }).from(agentConfigsTable);
    const [teamCount] = await db.select({ count: count() }).from(teamsTable);

    const recentUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt)).limit(10);

    const recentProjects = await db.select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      createdAt: projectsTable.createdAt,
    }).from(projectsTable).orderBy(desc(projectsTable.createdAt)).limit(10);

    const infraAgents = await db.select({
      agentKey: agentConfigsTable.agentKey,
      displayNameAr: agentConfigsTable.displayNameAr,
      enabled: agentConfigsTable.enabled,
      agentLayer: agentConfigsTable.agentLayer,
    }).from(agentConfigsTable).where(eq(agentConfigsTable.agentLayer, "infra"));

    const serviceAgents = await db.select({
      agentKey: agentConfigsTable.agentKey,
      displayNameAr: agentConfigsTable.displayNameAr,
      enabled: agentConfigsTable.enabled,
    }).from(agentConfigsTable).where(eq(agentConfigsTable.agentLayer, "service"));

    return `
## بيانات حية من قاعدة البيانات (تم جلبها الآن):

### إحصائيات عامة:
- عدد المستخدمين: ${userCount.count}
- عدد المشاريع: ${projectCount.count}
- عدد الملفات: ${fileCount.count}
- عدد الوكلاء: ${agentCount.count}
- عدد الفرق: ${teamCount.count}

### آخر 10 مستخدمين:
${recentUsers.map(u => `- ${u.displayName} (${u.email}) — الدور: ${u.role} — تاريخ: ${u.createdAt?.toISOString?.() || "N/A"}`).join("\n")}

### آخر 10 مشاريع:
${recentProjects.map(p => `- ${p.name} — الحالة: ${p.status} — تاريخ: ${p.createdAt?.toISOString?.() || "N/A"}`).join("\n")}

### وكلاء البنية التحتية:
${infraAgents.map(a => `- ${a.agentKey}: ${a.displayNameAr} — ${a.enabled ? "مفعّل" : "معطّل"}`).join("\n")}

### وكلاء الخدمة:
${serviceAgents.map(a => `- ${a.agentKey}: ${a.displayNameAr} — ${a.enabled ? "مفعّل" : "معطّل"}`).join("\n")}
`;
  } catch (err: any) {
    return `[خطأ في جلب بيانات قاعدة البيانات: ${err.message}]`;
  }
}

export async function getLiveDbTables(): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT table_name, 
        (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
      FROM information_schema.tables t 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    const rows = result.rows || result;
    return `
## جداول قاعدة البيانات الفعلية:
${(rows as any[]).map((r: any) => `- ${r.table_name} (${r.column_count} أعمدة)`).join("\n")}
`;
  } catch (err: any) {
    return `[خطأ في جلب الجداول: ${err.message}]`;
  }
}

export async function queryTable(tableName: string): Promise<string> {
  try {
    const allowedTables = [
      "users", "projects", "project_files", "agent_configs", "teams",
      "team_members", "deployments", "execution_logs", "agent_logs",
      "ai_providers", "plans", "subscriptions", "invoices", "roles",
      "permissions", "qa_reports", "notifications", "domains",
      "sandbox_instances", "pwa_settings", "page_views", "translations",
      "strategic_threads", "media_providers", "credits_ledger",
      "notification_preferences", "snapshots", "token_usage",
      "build_tasks", "team_invitations",
    ];
    if (!allowedTables.includes(tableName)) {
      return `[جدول "${tableName}" غير مسموح بالاستعلام عنه. الجداول المتاحة: ${allowedTables.join(", ")}]`;
    }
    const colResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = ${tableName} AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    const cols = (colResult.rows || colResult) as any[];

    const dataResult = await db.execute(sql.raw(`SELECT * FROM "${tableName}" ORDER BY created_at DESC LIMIT 20`));
    const rows = (dataResult.rows || dataResult) as any[];

    return `
## جدول: ${tableName}

### الأعمدة (${cols.length}):
${cols.map((c: any) => `- ${c.column_name}: ${c.data_type} ${c.is_nullable === "NO" ? "(مطلوب)" : "(اختياري)"}`).join("\n")}

### البيانات (آخر ${rows.length} سجل):
\`\`\`json
${JSON.stringify(rows.slice(0, 20), null, 2)}
\`\`\`
`;
  } catch (err: any) {
    return `[خطأ في استعلام الجدول ${tableName}: ${err.message}]`;
  }
}

export async function executeSqlQuery(query: string): Promise<string> {
  try {
    const normalized = query.trim().toUpperCase();
    const isDangerous = normalized.startsWith("DROP") || normalized.startsWith("TRUNCATE") || normalized.startsWith("ALTER") || normalized.includes("DELETE FROM") && !normalized.includes("WHERE");
    if (isDangerous) {
      return `[محظور: لا يُسمح بتنفيذ أوامر خطيرة (DROP/TRUNCATE/ALTER/DELETE بدون WHERE)]`;
    }
    const result = await db.execute(sql.raw(query));
    const rows = (result.rows || result) as any[];
    return `
## نتيجة الاستعلام:
\`\`\`sql
${query}
\`\`\`
عدد النتائج: ${rows.length}
\`\`\`json
${JSON.stringify(rows.slice(0, 50), null, 2)}
\`\`\`
`;
  } catch (err: any) {
    return `[خطأ في تنفيذ الاستعلام: ${err.message}]`;
  }
}

export function getProjectFileTree(dirPath?: string): string {
  try {
    const rootDir = process.cwd();
    const targetDir = dirPath ? path.resolve(rootDir, dirPath) : rootDir;
    if (!targetDir.startsWith(rootDir)) {
      return "[محظور: لا يُسمح بالوصول خارج مجلد المشروع]";
    }
    const entries: string[] = [];
    function walk(dir: string, prefix: string, depth: number) {
      if (depth > 3) return;
      try {
        const items = fs.readdirSync(dir);
        const filtered = items.filter(i => !i.startsWith(".") && i !== "node_modules" && i !== "dist" && i !== ".git");
        filtered.sort();
        for (const item of filtered) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          const rel = path.relative(rootDir, fullPath);
          if (stat.isDirectory()) {
            entries.push(`${prefix}${item}/`);
            walk(fullPath, prefix + "  ", depth + 1);
          } else {
            entries.push(`${prefix}${item}`);
          }
        }
      } catch {}
    }
    walk(targetDir, "", 0);
    return `
## شجرة ملفات المشروع (${dirPath || "/"}):
\`\`\`
${entries.join("\n")}
\`\`\`
`;
  } catch (err: any) {
    return `[خطأ في قراءة الملفات: ${err.message}]`;
  }
}

export function readProjectFile(filePath: string): string {
  try {
    const rootDir = process.cwd();
    const fullPath = path.resolve(rootDir, filePath);
    if (!fullPath.startsWith(rootDir)) {
      return "[محظور: لا يُسمح بالوصول خارج مجلد المشروع]";
    }
    if (!fs.existsSync(fullPath)) {
      return `[الملف غير موجود: ${filePath}]`;
    }
    const stat = fs.statSync(fullPath);
    if (stat.size > 100000) {
      return `[الملف كبير جداً: ${(stat.size / 1024).toFixed(1)} KB — استخدم مسار محدد]`;
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    return `
## محتوى الملف: ${filePath}
حجم: ${(stat.size / 1024).toFixed(1)} KB | آخر تعديل: ${stat.mtime.toISOString()}
\`\`\`${path.extname(filePath).slice(1) || "txt"}
${content}
\`\`\`
`;
  } catch (err: any) {
    return `[خطأ في قراءة الملف: ${err.message}]`;
  }
}

export function getSystemHealth(): string {
  try {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const osMem = os.totalmem();
    const osFreeMem = os.freemem();
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    return `
## حالة النظام الحية:
- وقت التشغيل: ${Math.floor(uptime / 3600)} ساعة ${Math.floor((uptime % 3600) / 60)} دقيقة
- الذاكرة (Node.js): ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB مستخدمة / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB مخصصة
- الذاكرة (النظام): ${((osMem - osFreeMem) / 1024 / 1024 / 1024).toFixed(2)} GB مستخدمة / ${(osMem / 1024 / 1024 / 1024).toFixed(2)} GB إجمالي
- المعالج: ${cpus.length} أنوية — ${cpus[0]?.model || "N/A"}
- الحمل: ${loadAvg.map(l => l.toFixed(2)).join(" / ")} (1/5/15 دقيقة)
- Node.js: ${process.version}
- المنصة: ${os.platform()} ${os.arch()}
- اسم المضيف: ${os.hostname()}
`;
  } catch (err: any) {
    return `[خطأ في جلب حالة النظام: ${err.message}]`;
  }
}

export async function getFullLiveContext(): Promise<string> {
  const [dbStats, dbTables, health] = await Promise.all([
    getLiveDbStats(),
    getLiveDbTables(),
    Promise.resolve(getSystemHealth()),
  ]);
  return `
# ===== بيانات حية (LIVE DATA) — تم جلبها لحظياً =====
${health}
${dbStats}
${dbTables}
# ===== نهاية البيانات الحية =====
`;
}

export function detectAndExecuteCommands(message: string): Promise<string | null> {
  return (async () => {
    const lower = message.toLowerCase();

    if (lower.includes("اعرض الجداول") || lower.includes("قائمة الجداول") || lower.includes("show tables") || lower.includes("list tables")) {
      return getLiveDbTables();
    }

    const tableMatch = message.match(/(?:اعرض|استعرض|show|query|select from|بيانات)\s+(?:جدول\s+)?(\w+)/i);
    if (tableMatch) {
      return queryTable(tableMatch[1]);
    }

    const sqlMatch = message.match(/```sql\n([\s\S]+?)\n```/);
    if (sqlMatch) {
      return executeSqlQuery(sqlMatch[1]);
    }
    if (lower.startsWith("select ") || lower.startsWith("insert ") || lower.startsWith("update ")) {
      return executeSqlQuery(message);
    }

    const fileMatch = message.match(/(?:اقرأ|اعرض|افتح|read|show|open|cat)\s+(?:ملف\s+)?([^\s"']+\.\w+)/i);
    if (fileMatch) {
      return readProjectFile(fileMatch[1]);
    }

    if (lower.includes("شجرة الملفات") || lower.includes("file tree") || lower.includes("list files") || lower.includes("اعرض الملفات")) {
      const dirMatch = message.match(/(?:في|of|from|مجلد)\s+([^\s]+)/i);
      return getProjectFileTree(dirMatch?.[1]);
    }

    if (lower.includes("حالة النظام") || lower.includes("system status") || lower.includes("health") || lower.includes("صحة")) {
      return getSystemHealth();
    }

    if (lower.includes("إحصائيات") || lower.includes("statistics") || lower.includes("stats") || lower.includes("تقرير")) {
      return getLiveDbStats();
    }

    return null;
  })();
}
