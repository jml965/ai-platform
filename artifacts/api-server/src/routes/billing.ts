import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  plansTable,
  subscriptionsTable,
  invoicesTable,
  creditsLedgerTable,
  usersTable,
  notificationsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";

const router: IRouter = Router();

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

function getUserId(req: any): string {
  return req.user?.id ?? SEED_USER_ID;
}

async function ensurePlansSeeded() {
  const existing = await db.select({ cnt: count() }).from(plansTable);
  if ((existing[0]?.cnt ?? 0) > 0) return;

  await db.insert(plansTable).values([
    {
      name: "Basic",
      nameAr: "أساسي",
      slug: "basic",
      priceMonthlyUsd: "0.00",
      maxProjects: 3,
      monthlyTokenLimit: 100000,
      dailyLimitUsd: "5.0000",
      monthlyLimitUsd: "10.0000",
      supportType: "community",
      features: { livePreview: true, codeExport: false, customDomain: false },
      sortOrder: 0,
    },
    {
      name: "Pro",
      nameAr: "متقدم",
      slug: "pro",
      priceMonthlyUsd: "19.00",
      maxProjects: 20,
      monthlyTokenLimit: 1000000,
      dailyLimitUsd: "20.0000",
      monthlyLimitUsd: "50.0000",
      supportType: "priority",
      features: { livePreview: true, codeExport: true, customDomain: true },
      sortOrder: 1,
    },
    {
      name: "Team",
      nameAr: "فرق",
      slug: "team",
      priceMonthlyUsd: "49.00",
      maxProjects: 100,
      monthlyTokenLimit: 5000000,
      dailyLimitUsd: "100.0000",
      monthlyLimitUsd: "200.0000",
      supportType: "dedicated",
      features: {
        livePreview: true,
        codeExport: true,
        customDomain: true,
        teamCollaboration: true,
        priorityQueue: true,
      },
      sortOrder: 2,
    },
  ]);
}

router.get("/billing/plans", async (_req, res) => {
  try {
    await ensurePlansSeeded();

    const plans = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(plansTable.sortOrder);

    return res.json({
      data: plans.map((p) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        priceMonthlyUsd: parseFloat(p.priceMonthlyUsd),
        maxProjects: p.maxProjects,
        monthlyTokenLimit: p.monthlyTokenLimit,
        features: p.features,
        isActive: p.isActive,
      })),
    });
  } catch (error) {
    console.error("List plans error:", error);
    return res
      .status(500)
      .json({ error: { code: "INTERNAL", message: "Failed to list plans" } });
  }
});

router.get("/billing/subscription", async (req, res) => {
  try {
    const userId = getUserId(req);
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, userId),
          eq(subscriptionsTable.status, "active")
        )
      )
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);

    if (!sub) {
      await ensurePlansSeeded();
      const [freePlan] = await db
        .select()
        .from(plansTable)
        .where(eq(plansTable.slug, "basic"))
        .limit(1);

      return res.json({
        id: "00000000-0000-0000-0000-000000000000",
        userId,
        plan: freePlan
          ? {
              id: freePlan.id,
              name: freePlan.name,
              nameAr: freePlan.nameAr,
              priceMonthlyUsd: parseFloat(freePlan.priceMonthlyUsd),
              maxProjects: freePlan.maxProjects,
              monthlyTokenLimit: freePlan.monthlyTokenLimit,
              features: freePlan.features,
            }
          : {
              id: "00000000-0000-0000-0000-000000000000",
              name: "Basic",
              nameAr: "أساسي",
              priceMonthlyUsd: 0,
              maxProjects: 3,
              monthlyTokenLimit: 100000,
            },
        status: "active",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
      });
    }

    const [plan] = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.id, sub.planId))
      .limit(1);

    return res.json({
      id: sub.id,
      userId: sub.userId,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            nameAr: plan.nameAr,
            priceMonthlyUsd: parseFloat(plan.priceMonthlyUsd),
            maxProjects: plan.maxProjects,
            monthlyTokenLimit: plan.monthlyTokenLimit,
            features: plan.features,
          }
        : null,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to get subscription" },
    });
  }
});

router.post("/billing/checkout", async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "planId is required" },
      });
    }

    const userId = getUserId(req);

    const [plan] = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.id, planId))
      .limit(1);

    if (!plan) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Plan not found" } });
    }

    const priceUsd = parseFloat(plan.priceMonthlyUsd);

    if (isStripeConfigured() && priceUsd > 0) {
      const stripe = getStripeClient()!;
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      const baseUrl = domain ? `https://${domain}` : "http://localhost:3000";

      const [user] = await db
        .select({ stripeCustomerId: usersTable.stripeCustomerId, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      let customerId = user?.stripeCustomerId ?? undefined;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user?.email ?? undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await db
          .update(usersTable)
          .set({ stripeCustomerId: customerId })
          .where(eq(usersTable.id, userId));
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(priceUsd * 100),
              recurring: { interval: "month" },
              product_data: { name: `${plan.name} Plan` },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${baseUrl}/billing?status=success`,
        cancel_url: `${baseUrl}/billing?status=cancelled`,
        metadata: {
          userId,
          planId: plan.id,
          type: "subscription",
        },
      });

      return res.json({ checkoutUrl: session.url });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db
      .update(subscriptionsTable)
      .set({ status: "cancelled", cancelledAt: now })
      .where(
        and(
          eq(subscriptionsTable.userId, userId),
          eq(subscriptionsTable.status, "active")
        )
      );

    const [newSub] = await db
      .insert(subscriptionsTable)
      .values({
        userId,
        planId: plan.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    await db
      .update(usersTable)
      .set({
        activePlanId: plan.id,
        dailyLimitUsd: plan.dailyLimitUsd,
        monthlyLimitUsd: plan.monthlyLimitUsd,
      })
      .where(eq(usersTable.id, userId));

    if (priceUsd > 0) {
      await db.insert(invoicesTable).values({
        userId,
        amountUsd: plan.priceMonthlyUsd,
        status: "paid",
        type: "subscription",
        description: `Subscription: ${plan.name} plan`,
        descriptionAr: `اشتراك: خطة ${plan.nameAr}`,
        paidAt: now,
      });
    }

    return res.json({
      checkoutUrl: `/__internal/checkout-success?subscriptionId=${newSub.id}`,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to create checkout" },
    });
  }
});

router.get("/billing/invoices", async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 20)
    );
    const offset = (page - 1) * limit;

    const [totalRow] = await db
      .select({ cnt: count() })
      .from(invoicesTable)
      .where(eq(invoicesTable.userId, userId));

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.userId, userId))
      .orderBy(desc(invoicesTable.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      data: invoices.map((inv) => ({
        id: inv.id,
        amountUsd: parseFloat(inv.amountUsd),
        status: inv.status,
        description: inv.description,
        paidAt: inv.paidAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total: totalRow?.cnt ?? 0,
      },
    });
  } catch (error) {
    console.error("List invoices error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to list invoices" },
    });
  }
});

router.get("/billing/credits", async (req, res) => {
  try {
    const userId = getUserId(req);
    const [user] = await db
      .select({
        creditBalanceUsd: usersTable.creditBalanceUsd,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const balance = parseFloat(user?.creditBalanceUsd ?? "0");

    return res.json({
      balanceUsd: balance,
      isLow: balance > 0 && balance < 1,
      isDepleted: balance <= 0,
    });
  } catch (error) {
    console.error("Get credits error:", error);
    return res
      .status(500)
      .json({ error: { code: "INTERNAL", message: "Failed to get credits" } });
  }
});

router.post("/billing/topup", async (req, res) => {
  try {
    const { amountUsd } = req.body;
    if (!amountUsd || typeof amountUsd !== "number" || amountUsd <= 0) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION", message: "Invalid amount" } });
    }

    const userId = getUserId(req);

    if (isStripeConfigured()) {
      const stripe = getStripeClient()!;
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      const baseUrl = domain ? `https://${domain}` : "http://localhost:3000";

      const [user] = await db
        .select({ stripeCustomerId: usersTable.stripeCustomerId, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      let customerId = user?.stripeCustomerId ?? undefined;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user?.email ?? undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await db
          .update(usersTable)
          .set({ stripeCustomerId: customerId })
          .where(eq(usersTable.id, userId));
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amountUsd * 100),
              product_data: {
                name: `Credit Top-up: $${amountUsd.toFixed(2)}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${baseUrl}/billing?status=topup_success`,
        cancel_url: `${baseUrl}/billing?status=cancelled`,
        metadata: {
          userId,
          type: "topup",
        },
      });

      return res.json({ checkoutUrl: session.url });
    }

    const [user] = await db
      .select({ creditBalanceUsd: usersTable.creditBalanceUsd })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const currentBalance = parseFloat(user?.creditBalanceUsd ?? "0");
    const newBalance = currentBalance + amountUsd;

    await db
      .update(usersTable)
      .set({ creditBalanceUsd: newBalance.toFixed(6) })
      .where(eq(usersTable.id, userId));

    await db.insert(creditsLedgerTable).values({
      userId,
      type: "topup",
      amountUsd: amountUsd.toFixed(6),
      balanceAfter: newBalance.toFixed(6),
      description: `Credit top-up: $${amountUsd.toFixed(2)}`,
      referenceType: "topup",
    });

    await db.insert(invoicesTable).values({
      userId,
      amountUsd: amountUsd.toFixed(2),
      status: "paid",
      type: "topup",
      description: `Credit top-up: $${amountUsd.toFixed(2)}`,
      descriptionAr: `تعبئة رصيد: $${amountUsd.toFixed(2)}`,
      paidAt: new Date(),
    });

    return res.json({
      checkoutUrl: `/__internal/topup-success?amount=${amountUsd}`,
    });
  } catch (error) {
    console.error("Topup error:", error);
    return res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to process topup" },
    });
  }
});

export default router;
