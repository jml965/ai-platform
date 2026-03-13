import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { domainsTable, projectsTable, deploymentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProjectAccess, getUserId } from "../middlewares/permissions";
import { ReplitConnectors } from "@replit/connectors-sdk";
import dns from "dns/promises";
import crypto from "crypto";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

async function githubApi(path: string, options: { method?: string; body?: any } = {}) {
  const res = await connectors.proxy("github", path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function getGitHubUsername(): Promise<string> {
  const { data } = await githubApi("/user");
  return data.login;
}

async function setGitHubPagesCNAME(owner: string, repo: string, domain: string) {
  await githubApi(`/repos/${owner}/${repo}/pages`, {
    method: "PUT",
    body: { cname: domain, source: { branch: "main", path: "/" } },
  });

  const fileCheck = await githubApi(`/repos/${owner}/${repo}/contents/CNAME`);
  const sha = fileCheck.status === 200 ? fileCheck.data.sha : undefined;

  await githubApi(`/repos/${owner}/${repo}/contents/CNAME`, {
    method: "PUT",
    body: {
      message: `Set custom domain: ${domain}`,
      content: Buffer.from(domain, "utf-8").toString("base64"),
      ...(sha ? { sha } : {}),
    },
  });
}

async function removeGitHubPagesCNAME(owner: string, repo: string) {
  const fileCheck = await githubApi(`/repos/${owner}/${repo}/contents/CNAME`);
  if (fileCheck.status === 200) {
    await githubApi(`/repos/${owner}/${repo}/contents/CNAME`, {
      method: "DELETE",
      body: {
        message: "Remove custom domain",
        sha: fileCheck.data.sha,
      },
    });
  }

  await githubApi(`/repos/${owner}/${repo}/pages`, {
    method: "PUT",
    body: { cname: "", source: { branch: "main", path: "/" } },
  });
}

router.get("/projects/:projectId/domains", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const domains = await db
      .select()
      .from(domainsTable)
      .where(eq(domainsTable.projectId, req.params.projectId));

    res.json({ data: domains.map(mapDomain) });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list domains" } });
  }
});

router.post("/projects/:projectId/domains", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain || typeof domain !== "string") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "domain is required" } });
      return;
    }

    const normalizedDomain = domain.toLowerCase().trim();
    const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
    if (!domainRegex.test(normalizedDomain)) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Invalid domain format" } });
      return;
    }

    const existing = await db
      .select()
      .from(domainsTable)
      .where(eq(domainsTable.domain, normalizedDomain))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: { code: "CONFLICT", message: "Domain already registered" } });
      return;
    }

    const [deployment] = await db
      .select()
      .from(deploymentsTable)
      .where(eq(deploymentsTable.projectId, req.params.projectId))
      .limit(1);

    if (!deployment || deployment.status !== "active") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Project must be deployed first" } });
      return;
    }

    const verificationToken = crypto.randomBytes(16).toString("hex");

    const [created] = await db
      .insert(domainsTable)
      .values({
        projectId: req.params.projectId,
        domain: normalizedDomain,
        verificationToken,
      })
      .returning();

    try {
      const owner = await getGitHubUsername();
      await setGitHubPagesCNAME(owner, deployment.subdomain, normalizedDomain);
    } catch (ghErr) {
      console.error("GitHub CNAME setup failed:", ghErr);
    }

    res.status(201).json(mapDomain(created));
  } catch (error: any) {
    if (error?.code === "23505" || error?.constraint) {
      res.status(409).json({ error: { code: "CONFLICT", message: "Domain already registered" } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to add domain" } });
  }
});

router.post("/projects/:projectId/domains/:domainId/verify", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const [domainRecord] = await db
      .select()
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.id, req.params.domainId),
          eq(domainsTable.projectId, req.params.projectId)
        )
      )
      .limit(1);

    if (!domainRecord) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Domain not found" } });
      return;
    }

    const [deployment] = await db
      .select()
      .from(deploymentsTable)
      .where(eq(deploymentsTable.projectId, req.params.projectId))
      .limit(1);

    const owner = deployment ? await getGitHubUsername() : "";
    const ghPagesHost = deployment ? `${owner}.github.io` : "";

    let dnsVerified = false;
    let dnsRecords: { type: string; value: string }[] = [];

    try {
      const cnameRecords = await dns.resolveCname(domainRecord.domain);
      dnsRecords = cnameRecords.map(r => ({ type: "CNAME", value: r }));
      if (cnameRecords.some(r => r.includes("github.io"))) {
        dnsVerified = true;
      }
    } catch {}

    try {
      const aRecords = await dns.resolve4(domainRecord.domain);
      dnsRecords = [...dnsRecords, ...aRecords.map(r => ({ type: "A", value: r }))];
      const ghIps = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
      if (aRecords.some(r => ghIps.includes(r))) {
        dnsVerified = true;
      }
    } catch {}

    let sslIssued = domainRecord.sslIssued;
    let sslExpiresAt = domainRecord.sslExpiresAt;
    let status = domainRecord.status;

    if (dnsVerified) {
      sslIssued = true;
      sslExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      status = "active";
    } else {
      status = "dns_pending";
    }

    const [updated] = await db
      .update(domainsTable)
      .set({ dnsVerified, sslIssued, sslExpiresAt, status, updatedAt: new Date() })
      .where(eq(domainsTable.id, domainRecord.id))
      .returning();

    res.json({
      ...mapDomain(updated),
      dnsRecords,
      dnsInstructions: {
        option1: {
          title: "CNAME Record (recommended)",
          type: "CNAME",
          host: "www",
          value: ghPagesHost,
        },
        option2: {
          title: "A Records (for apex domain)",
          type: "A",
          host: "@",
          values: ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"],
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to verify domain" } });
  }
});

router.delete("/projects/:projectId/domains/:domainId", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const [deleted] = await db
      .delete(domainsTable)
      .where(
        and(
          eq(domainsTable.id, req.params.domainId),
          eq(domainsTable.projectId, req.params.projectId)
        )
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Domain not found" } });
      return;
    }

    try {
      const [deployment] = await db
        .select()
        .from(deploymentsTable)
        .where(eq(deploymentsTable.projectId, req.params.projectId))
        .limit(1);

      if (deployment) {
        const owner = await getGitHubUsername();
        await removeGitHubPagesCNAME(owner, deployment.subdomain);
      }
    } catch (ghErr) {
      console.error("GitHub CNAME removal failed:", ghErr);
    }

    res.json({ success: true, message: "Domain removed" });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to remove domain" } });
  }
});

function mapDomain(d: typeof domainsTable.$inferSelect) {
  return {
    id: d.id,
    projectId: d.projectId,
    domain: d.domain,
    status: d.status,
    dnsVerified: d.dnsVerified,
    sslIssued: d.sslIssued,
    sslExpiresAt: d.sslExpiresAt?.toISOString() || null,
    verificationToken: d.verificationToken,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export default router;
