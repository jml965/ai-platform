import React, { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  CreditCard, Zap, CheckCircle2, ChevronRight,
  Loader2, LayoutTemplate, LogOut, ArrowLeft,
  Receipt, Plus, Wallet, Crown, Users, Sparkles
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  useListPlans,
  useGetSubscription,
  useGetCredits,
  useListInvoices,
  useCreateCheckout,
  useTopupCredits,
  useAuthLogout,
} from "@workspace/api-client-react";
import { format } from "date-fns";

export default function Billing() {
  const { t, lang } = useI18n();
  const logout = useAuthLogout();

  const { data: plansData, isLoading: loadingPlans } = useListPlans();
  const { data: subscription, isLoading: loadingSub, refetch: refetchSub } = useGetSubscription();
  const { data: credits, refetch: refetchCredits } = useGetCredits();
  const { data: invoicesData, isLoading: loadingInvoices, refetch: refetchInvoices } = useListInvoices();

  const checkoutMut = useCreateCheckout();
  const topupMut = useTopupCredits();

  const [topupAmount, setTopupAmount] = useState("25");
  const [topupError, setTopupError] = useState("");

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.href = "/";
  };

  const handleSubscribe = async (planId: string) => {
    try {
      const result = await checkoutMut.mutateAsync({ data: { planId } });
      if (result.checkoutUrl?.startsWith("https://")) {
        window.location.href = result.checkoutUrl;
        return;
      }
      await refetchSub();
      await refetchInvoices();
    } catch (error) {
      console.error("Subscription error:", error);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopupError("");
    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount <= 0) {
      setTopupError("Invalid amount");
      return;
    }
    try {
      const result = await topupMut.mutateAsync({ data: { amountUsd: amount } });
      if (result.checkoutUrl?.startsWith("https://")) {
        window.location.href = result.checkoutUrl;
        return;
      }
      await refetchCredits();
      await refetchInvoices();
      setTopupAmount("25");
    } catch (error) {
      console.error("Topup error:", error);
    }
  };

  const currentPlanId = subscription?.plan?.id;

  const planIcons = [Zap, Sparkles, Crown, Users];
  const planColors = [
    "border-white/10 bg-card",
    "border-primary/50 bg-primary/5",
    "border-amber-500/50 bg-amber-500/5",
  ];
  const planBadgeColors = [
    "bg-secondary text-secondary-foreground",
    "bg-primary/20 text-primary",
    "bg-amber-500/20 text-amber-400",
  ];

  const invoiceStatusColors: Record<string, string> = {
    paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    failed: "bg-destructive/20 text-destructive border-destructive/30",
  };

  const invoiceStatusKey: Record<string, keyof typeof t> = {
    paid: "billing_invoice_paid",
    pending: "billing_invoice_pending",
    failed: "billing_invoice_failed",
  };

  const subStatusKey: Record<string, keyof typeof t> = {
    active: "billing_status_active",
    cancelled: "billing_status_cancelled",
    past_due: "billing_status_past_due",
    trialing: "billing_status_trialing",
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-card/50 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <LayoutTemplate className="w-4 h-4 text-primary" />
          </div>
          <h1 className="font-bold text-lg">{t.billing}</h1>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {lang === "ar" ? (
              <>
                <ChevronRight className="w-4 h-4" />
                {t.dashboard}
              </>
            ) : (
              <>
                <ArrowLeft className="w-4 h-4" />
                {t.dashboard}
              </>
            )}
          </Link>
          <LanguageToggle />
          <button
            onClick={handleLogout}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
            title={t.logout}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 lg:p-8 space-y-10">

        {/* Current Subscription Card */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            {t.billing_subscription}
          </h2>

          {loadingSub ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : subscription ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-lg">
                    {lang === "ar" ? subscription.plan?.nameAr : subscription.plan?.name}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {t.billing_period_ends}:{" "}
                    {subscription.currentPeriodEnd
                      ? format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")
                      : "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    subscription.status === "active"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-secondary text-secondary-foreground border-transparent"
                  }`}
                >
                  {t[subStatusKey[subscription.status] ?? "billing_status_active"]}
                </span>
                <span className="text-2xl font-bold">
                  {subscription.plan?.priceMonthlyUsd === 0
                    ? t.billing_free
                    : `$${subscription.plan?.priceMonthlyUsd}${t.billing_per_month}`}
                </span>
              </div>
            </motion.div>
          ) : null}
        </section>

        {/* Credits + Top-up */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-500" />
            {t.billing_credits}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Balance Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-white/10 rounded-2xl p-6 flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t.billing_credits_balance}</p>
                <p className="text-3xl font-bold mt-0.5">
                  ${(credits?.balanceUsd ?? 0).toFixed(2)}
                </p>
              </div>
            </motion.div>

            {/* Topup Form */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-card border border-white/10 rounded-2xl p-6"
            >
              <p className="font-semibold mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                {t.billing_topup}
              </p>
              <form onSubmit={handleTopup} className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">{t.billing_topup_amount}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      className="w-full pl-7 pr-4 py-2.5 bg-background border border-white/10 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                  {topupError && <p className="text-destructive text-xs mt-1">{topupError}</p>}
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={topupMut.isPending}
                    className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    {topupMut.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />{t.billing_topup_processing}</>
                    ) : (
                      t.billing_topup_btn
                    )}
                  </button>
                </div>
              </form>
              <div className="flex gap-2 mt-3">
                {[10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(String(amt))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      topupAmount === String(amt)
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Plans */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {t.billing_upgrade}
          </h2>

          {loadingPlans ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plansData?.data?.map((plan, index) => {
                const isCurrent = plan.id === currentPlanId;
                const PlanIcon = planIcons[index] ?? Zap;
                const colorClass = planColors[index] ?? planColors[0];
                const badgeClass = planBadgeColors[index] ?? planBadgeColors[0];
                const features = (plan.features ?? {}) as Record<string, boolean>;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative border rounded-2xl p-6 flex flex-col ${colorClass} ${isCurrent ? "ring-2 ring-primary/40" : ""}`}
                  >
                    {isCurrent && (
                      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold ${badgeClass}`}>
                        {t.billing_current}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${badgeClass}`}>
                        <PlanIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold">{lang === "ar" ? plan.nameAr : plan.name}</h3>
                        <p className="text-2xl font-bold mt-0.5">
                          {plan.priceMonthlyUsd === 0
                            ? t.billing_free
                            : `$${plan.priceMonthlyUsd}${t.billing_per_month}`}
                        </p>
                      </div>
                    </div>

                    <ul className="space-y-2 flex-1 mb-6">
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{plan.maxProjects} {t.billing_projects}</span>
                      </li>
                      <li className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{(plan.monthlyTokenLimit / 1000).toFixed(0)}K {t.billing_tokens}</span>
                      </li>
                      {features.livePreview && (
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{t.billing_feature_preview}</span>
                        </li>
                      )}
                      {features.codeExport && (
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{t.billing_feature_export}</span>
                        </li>
                      )}
                      {features.customDomain && (
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{t.billing_feature_domain}</span>
                        </li>
                      )}
                      {features.teamCollaboration && (
                        <li className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{t.billing_feature_team}</span>
                        </li>
                      )}
                    </ul>

                    <button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isCurrent || checkoutMut.isPending}
                      className={`w-full py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                        isCurrent
                          ? "bg-secondary text-secondary-foreground cursor-default"
                          : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
                      } disabled:opacity-60`}
                    >
                      {checkoutMut.isPending && !isCurrent ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />{t.billing_subscribing}</>
                      ) : isCurrent ? (
                        t.billing_current
                      ) : (
                        t.billing_select
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Invoice History */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-muted-foreground" />
            {t.billing_invoices}
          </h2>

          {loadingInvoices ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !invoicesData?.data?.length ? (
            <div className="text-center py-12 bg-card/30 rounded-2xl border border-white/5 border-dashed">
              <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{t.billing_no_invoices}</p>
            </div>
          ) : (
            <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
              <div className="divide-y divide-white/5">
                {invoicesData.data.map((invoice, index) => (
                  <motion.div
                    key={invoice.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center justify-between px-6 py-4 hover:bg-white/3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Receipt className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{invoice.description ?? `Invoice #${invoice.id.slice(0, 8)}`}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {invoice.paidAt
                            ? format(new Date(invoice.paidAt), "MMM d, yyyy")
                            : format(new Date(invoice.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                          invoiceStatusColors[invoice.status] ?? ""
                        }`}
                      >
                        {t[invoiceStatusKey[invoice.status] ?? "billing_invoice_pending"]}
                      </span>
                      <span className="font-semibold">${invoice.amountUsd.toFixed(2)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
