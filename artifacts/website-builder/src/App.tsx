import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Builder from "@/pages/Builder";
import Billing from "@/pages/Billing";
import NotFound from "@/pages/not-found";
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

  // If user is not authenticated or there's an error, force them to Login
  if (isError || !user) {
    return <Login />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AuthGuard><Dashboard /></AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AuthGuard><Dashboard /></AuthGuard>
      </Route>
      <Route path="/project/:id">
        <AuthGuard><Builder /></AuthGuard>
      </Route>
      <Route path="/billing">
        <AuthGuard><Billing /></AuthGuard>
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
        </WouterRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
