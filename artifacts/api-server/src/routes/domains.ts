import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { domainsTable, projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProjectAccess, getUserId } from "../middlewares/permissions";
import dns from "dns/promises";
import crypto from "crypto";

const router: IRouter = Router();

const PLATFORM_IP = process.env.PLATFORM_IP || "76.76.21.21";

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

    const verificationToken = crypto.randomBytes(16).toString("hex");

    const [created] = await db
      .insert(domainsTable)
      .values({
        projectId: req.params.projectId,
        domain: normalizedDomain,
        verificationToken,
      })
      .returning();

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

    let dnsVerified = false;
    let dnsRecords: { type: string; value: string }[] = [];

    try {
      const aRecords = await dns.resolve4(domainRecord.domain);
      dnsRecords = aRecords.map(r => ({ type: "A", value: r }));
      if (aRecords.includes(PLATFORM_IP)) {
        dnsVerified = true;
      }
    } catch {}

    try {
      const cnameRecords = await dns.resolveCname(domainRecord.domain);
      dnsRecords = [...dnsRecords, ...cnameRecords.map(r => ({ type: "CNAME", value: r }))];
      if (!dnsVerified && cnameRecords.some(r => r.endsWith("platform.dev"))) {
        dnsVerified = true;
      }
    } catch {}

    let sslIssued = domainRecord.sslIssued;
    let sslExpiresAt = domainRecord.sslExpiresAt;
    let status = domainRecord.status;

    if (dnsVerified && !sslIssued) {
      sslIssued = true;
      sslExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      status = "active";
    } else if (dnsVerified) {
      status = "active";
    } else {
      status = "dns_pending";
    }

    const [updated] = await db
      .update(domainsTable)
      .set({
        dnsVerified,
        sslIssued,
        sslExpiresAt,
        status,
        updatedAt: new Date(),
      })
      .where(eq(domainsTable.id, domainRecord.id))
      .returning();

    res.json({
      ...mapDomain(updated),
      dnsRecords,
      dnsInstructions: {
        aRecord: { type: "A", host: "@", value: PLATFORM_IP },
        cnameRecord: { type: "CNAME", host: "www", value: `proxy.platform.dev` },
        txtRecord: { type: "TXT", host: "_verify", value: domainRecord.verificationToken },
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
