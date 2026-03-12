import Stripe from "stripe";
import { db } from "@workspace/db";
import {
  subscriptionsTable,
  invoicesTable,
  usersTable,
  creditsLedgerTable,
  plansTable,
  notificationsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient } from "./stripeClient";

export async function processStripeWebhook(
  rawBody: Buffer,
  signature: string
): Promise<void> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET."
    );
  }

  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret
  );

  console.log(`Processing Stripe webhook event: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription
      );
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription
      );
      break;
    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = session.metadata ?? {};
  const userId = metadata.userId;
  const planId = metadata.planId;
  const type = metadata.type;

  if (!userId) {
    console.warn("Checkout session missing userId in metadata:", session.id);
    return;
  }

  if (type === "topup") {
    const amountUsd = (session.amount_total ?? 0) / 100;
    if (amountUsd <= 0) return;

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
      description: `Credit top-up via Stripe: $${amountUsd.toFixed(2)}`,
      referenceId: session.id,
      referenceType: "stripe_checkout",
    });

    await db.insert(invoicesTable).values({
      userId,
      amountUsd: amountUsd.toFixed(2),
      status: "paid",
      type: "topup",
      description: `Credit top-up: $${amountUsd.toFixed(2)}`,
      descriptionAr: `تعبئة رصيد: $${amountUsd.toFixed(2)}`,
      stripePaymentIntentId: session.payment_intent as string | null,
      paidAt: new Date(),
    });

    await db.insert(notificationsTable).values({
      userId,
      type: "credits_added",
      title: `Credits Added: $${amountUsd.toFixed(2)}`,
      titleAr: `تمت إضافة الرصيد: $${amountUsd.toFixed(2)}`,
      message: `Your account has been credited $${amountUsd.toFixed(2)}. New balance: $${newBalance.toFixed(2)}.`,
      messageAr: `تمت إضافة $${amountUsd.toFixed(2)} إلى حسابك. الرصيد الجديد: $${newBalance.toFixed(2)}.`,
    });
  } else if (type === "subscription" && planId) {
    await activateSubscription(userId, planId, session);
  }
}

async function activateSubscription(
  userId: string,
  planId: string,
  session: Stripe.Checkout.Session
): Promise<void> {
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.id, planId))
    .limit(1);

  if (!plan) {
    console.warn(`Plan not found for activation: ${planId}`);
    return;
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

  await db.insert(subscriptionsTable).values({
    userId,
    planId: plan.id,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    stripeSubscriptionId: session.subscription as string | null,
    stripeCustomerId: session.customer as string | null,
  });

  await db
    .update(usersTable)
    .set({
      activePlanId: plan.id,
      dailyLimitUsd: plan.dailyLimitUsd,
      monthlyLimitUsd: plan.monthlyLimitUsd,
    })
    .where(eq(usersTable.id, userId));

  const priceUsd = parseFloat(plan.priceMonthlyUsd);
  if (priceUsd > 0) {
    await db.insert(invoicesTable).values({
      userId,
      amountUsd: plan.priceMonthlyUsd,
      status: "paid",
      type: "subscription",
      description: `Subscription: ${plan.name} plan`,
      descriptionAr: `اشتراك: خطة ${plan.nameAr}`,
      stripePaymentIntentId: session.payment_intent as string | null,
      paidAt: now,
    });
  }
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  console.log(`Invoice payment succeeded: ${invoice.id}`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const [existingSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (!existingSub) return;

  const status =
    subscription.status === "active"
      ? "active"
      : subscription.status === "canceled"
        ? "cancelled"
        : subscription.status;

  await db
    .update(subscriptionsTable)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, existingSub.id));
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const [existingSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (!existingSub) return;

  await db
    .update(subscriptionsTable)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, existingSub.id));
}
