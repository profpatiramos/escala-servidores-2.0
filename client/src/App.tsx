import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SessionProvider, useSession } from "./contexts/SessionContext";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import ChangeCredentials from "./pages/ChangeCredentials";
import ActivateAccess from "./pages/ActivateAccess";
import Dashboard from "./pages/Dashboard";
import PlatformAdmin from "./pages/PlatformAdmin";
import MySchedule from "./pages/MySchedule";
import Celebrations from "./pages/Celebrations";
import CelebrationDetail from "./pages/CelebrationDetail";
import Servers from "./pages/Servers";
import Availability from "./pages/Availability";
import Roles from "./pages/Roles";
import AiAssistant from "./pages/AiAssistant";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Responsibles from "./pages/Responsibles";
import ServerDetail from "./pages/ServerDetail";
import Settings from "./pages/Settings";
import Gamification from "./pages/Gamification";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import { Loader2 } from "lucide-react";

/**
 * Casca autenticada. Enquanto a sessão está sendo resolvida mostramos um estado
 * de carregamento em vez de redirecionar: sem isso, um recarregamento de página
 * jogaria o usuário para o login antes de a sessão chegar.
 */
function Protected({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) return <Redirect to="/acesso" />;

  return <AppLayout>{children}</AppLayout>;
}

/** Cada perfil tem um destino inicial diferente. */
function HomeRedirect() {
  const { isLoading, isAuthenticated, session } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) return <Redirect to="/acesso" />;
  if (session?.role === "SUPER_ADMIN") return <Redirect to="/admin" />;
  if (session?.role === "SERVER") return <Redirect to="/minha-escala" />;
  return <Redirect to="/painel" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/acesso" component={Login} />
      <Route path="/ativar" component={ActivateAccess} />
      <Route path="/trocar-senha">
        <Protected>
          <ChangeCredentials />
        </Protected>
      </Route>
      <Route path="/trocar-pin">
        <Protected>
          <ChangeCredentials />
        </Protected>
      </Route>

      <Route path="/admin">
        <Protected>
          <PlatformAdmin />
        </Protected>
      </Route>

      <Route path="/painel">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/minha-escala">
        <Protected>
          <MySchedule />
        </Protected>
      </Route>
      <Route path="/celebracoes">
        <Protected>
          <Celebrations />
        </Protected>
      </Route>
      <Route path="/celebracoes/:id">
        <Protected>
          <CelebrationDetail />
        </Protected>
      </Route>
      <Route path="/servidores">
        <Protected>
          <Servers />
        </Protected>
      </Route>
      <Route path="/funcoes">
        <Protected>
          <Roles />
        </Protected>
      </Route>
      <Route path="/disponibilidade">
        <Protected>
          <Availability />
        </Protected>
      </Route>
      <Route path="/assistente">
        <Protected>
          <AiAssistant />
        </Protected>
      </Route>
      <Route path="/eventos">
        <Protected>
          <Events />
        </Protected>
      </Route>
      <Route path="/eventos/:id">
        <Protected>
          <EventDetail />
        </Protected>
      </Route>
      <Route path="/responsaveis">
        <Protected>
          <Responsibles />
        </Protected>
      </Route>
      <Route path="/configuracoes">
        <Protected>
          <Settings />
        </Protected>
      </Route>
      <Route path="/servidores/:id">
        <Protected>
          <ServerDetail />
        </Protected>
      </Route>
      <Route path="/reconhecimento">
        <Protected>
          <Gamification />
        </Protected>
      </Route>
      <Route path="/relatorios">
        <Protected>
          <Reports />
        </Protected>
      </Route>
      <Route path="/notificacoes">
        <Protected>
          <Notifications />
        </Protected>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SessionProvider>
            <Toaster />
            <Router />
          </SessionProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
