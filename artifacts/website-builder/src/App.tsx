import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";

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
import FloatingInfraChat from "@/components/FloatingInfraChat";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

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
      <Route path="/">
        <AuthGuard><Dashboard /></AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AuthGuard><Dashboard /></AuthGuard>
      </Route>
      <Route path="/project/:id">
        <AuthGuard><Builder /></AuthGuard>
      </Route>
      <Route path="/project/:id/analytics">
        <AuthGuard><Analytics /></AuthGuard>
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
          <FloatingInfraChat />
        </WouterRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
