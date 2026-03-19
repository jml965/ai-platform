import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider, useI18n } from "@/lib/i18n";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Builder from "@/pages/Builder";
import Analytics from "@/pages/Analytics";
import Billing from "@/pages/Billing";
import Teams from "@/pages/Teams";
import QualityAssurance from "@/pages/QualityAssurance";
import Monitoring from "@/pages/Monitoring";
import NotificationSettings from "@/pages/NotificationSettings";
import Templates from "@/pages/Templates";
import AdminDashboard from "@/pages/AdminDashboard";
import AgentManagement from "@/pages/AgentManagement";
import AIControlCenter from "@/pages/AIControlCenter";
import StrategicAgent from "@/pages/StrategicAgent";
import InfraPanel from "@/pages/InfraPanel";
import NotFound from "@/pages/not-found";
import InfraInlineChat from "@/components/InfraInlineChat";
import type { InfraAgentInfo } from "@/components/InfraInlineChat";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2, Crown } from "lucide-react";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetMe({ 
    query: { queryKey: ["getMe"], retry: false, refetchOnWindowFocus: false }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !user) {
    return <Login />;
  }

  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetMe({
    query: { queryKey: ["getMe"], retry: false, refetchOnWindowFocus: false }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !user) {
    return <Login />;
  }

  if ((user as any).role !== "admin") {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-center">
        <div>
          <p className="text-red-400 text-lg mb-2">Access Denied</p>
          <p className="text-[#8b949e]">Admin access required</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/admin">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>
      <Route path="/project/:id/analytics">
        <AuthGuard><Analytics /></AuthGuard>
      </Route>
      <Route path="/project/:id">
        <AuthGuard><Builder /></AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AuthGuard><Dashboard /></AuthGuard>
      </Route>
      <Route path="/billing">
        <AuthGuard><Billing /></AuthGuard>
      </Route>
      <Route path="/teams">
        <AuthGuard><Teams /></AuthGuard>
      </Route>
      <Route path="/qa/:projectId">
        <AuthGuard><QualityAssurance /></AuthGuard>
      </Route>
      <Route path="/qa">
        <AuthGuard><QualityAssurance /></AuthGuard>
      </Route>
      <Route path="/templates">
        <AuthGuard><Templates /></AuthGuard>
      </Route>
      <Route path="/monitoring">
        <AuthGuard><Monitoring /></AuthGuard>
      </Route>
      <Route path="/notifications">
        <AuthGuard><NotificationSettings /></AuthGuard>
      </Route>
      <Route path="/agents">
        <AdminGuard><AgentManagement /></AdminGuard>
      </Route>
      <Route path="/control-center">
        <AdminGuard><AIControlCenter /></AdminGuard>
      </Route>
      <Route path="/strategic">
        <AuthGuard><StrategicAgent /></AuthGuard>
      </Route>
      <Route path="/infra">
        <AdminGuard><InfraPanel /></AdminGuard>
      </Route>
      <Route path="/">
        <AuthGuard><Dashboard /></AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function GlobalFloatingChat() {
  const [location] = useLocation();
  const { lang } = useI18n();
  const isRTL = lang === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [agent, setAgent] = useState<InfraAgentInfo | null>(null);
  const [agents, setAgents] = useState<InfraAgentInfo[]>([]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/infra/agents`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAgents(data);
          try {
            const saved = sessionStorage.getItem("infra_selected_agent");
            if (saved) {
              const sa = JSON.parse(saved);
              const match = data.find((a: InfraAgentInfo) => a.agentKey === sa.agentKey);
              if (match) { setAgent(match); return; }
            }
          } catch {}
          const sysadmin = data.find((a: InfraAgentInfo) => a.agentKey === "infra_sysadmin");
          if (sysadmin) setAgent(sysadmin);
        }
      })
      .catch(() => {});
  }, []);

  if (location === "/infra") return null;
  if (agents.length === 0 || !agent) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed z-50 bottom-6 p-3.5 rounded-2xl shadow-2xl transition-all duration-300 bg-gradient-to-br from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 hover:scale-110 active:scale-95 ${isRTL ? "left-6" : "right-6"}`}
      >
        <Crown className="w-6 h-6 text-black" />
      </button>
    );
  }

  return (
    <InfraInlineChat
      agent={agent}
      lang={lang}
      floating={true}
      onClose={() => setIsOpen(false)}
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
          <GlobalFloatingChat />
        </WouterRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
