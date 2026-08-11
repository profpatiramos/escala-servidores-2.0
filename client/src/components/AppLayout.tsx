/**
 * Layout autenticado da aplicação.
 *
 * A navegação é montada a partir do papel da sessão: o servidor criança vê três
 * itens; o coordenador vê o conjunto operacional completo. Isso não substitui a
 * autorização do backend — é apenas para não oferecer caminhos que resultariam
 * em erro de permissão.
 */
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  Church,
  ClipboardList,
  Gauge,
  HeartHandshake,
  LogOut,
  Menu,
  PartyPopper,
  ScrollText,
  Shapes,
  Settings,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSession, type RoleName } from "@/contexts/SessionContext";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Gauge;
  roles: RoleName[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Painel",
    href: "/painel",
    icon: Gauge,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR", "RESPONSIBLE"],
  },
  { label: "Minha escala", href: "/minha-escala", icon: CalendarCheck, roles: ["SERVER"] },
  {
    label: "Celebrações",
    href: "/celebracoes",
    icon: CalendarDays,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"],
  },
  {
    label: "Servidores",
    href: "/servidores",
    icon: Users,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"],
  },
  {
    label: "Responsáveis",
    href: "/responsaveis",
    icon: HeartHandshake,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"],
  },
  {
    label: "Funções",
    href: "/funcoes",
    icon: Shapes,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"],
  },
  {
    label: "Disponibilidade",
    href: "/disponibilidade",
    icon: ClipboardList,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR", "RESPONSIBLE", "SERVER"],
  },
  {
    label: "Assistente de IA",
    href: "/assistente",
    icon: Sparkles,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"],
  },
  {
    label: "Eventos",
    href: "/eventos",
    icon: PartyPopper,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR", "RESPONSIBLE", "SERVER"],
  },
  {
    label: "Reconhecimento",
    href: "/reconhecimento",
    icon: Trophy,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR", "RESPONSIBLE", "SERVER"],
  },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: ScrollText,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"],
  },
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: Settings,
    roles: ["SUPER_ADMIN", "PARISH_ADMIN"],
  },
];

const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Administrador da plataforma",
  PARISH_ADMIN: "Administrador da paróquia",
  COORDINATOR: "Coordenador",
  RESPONSIBLE: "Responsável",
  SERVER: "Servidor",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const utils = trpc.useUtils();

  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: session !== null,
    refetchInterval: 60_000,
  });

  const logout = trpc.access.logout.useMutation({
    onSuccess: () => {
      void utils.invalidate();
      window.location.href = "/";
    },
    onError: () => toast.error("Não foi possível sair. Tente novamente."),
  });

  if (!session) return null;

  const items = NAV_ITEMS.filter(item => item.roles.includes(session.role));
  const initials = session.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");

  const navContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Church className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Escala Servidores</p>
          <p className="truncate text-xs text-muted-foreground">
            {session.parishName ?? "Plataforma"}
          </p>
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {items.map(item => {
            const active = location === item.href || location.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {initials || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[session.role]}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 bg-background"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar fixa no desktop. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card lg:block">
        {navContent}
      </aside>

      {/* Drawer no mobile. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            {navContent}
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {session.parishName ?? "Administração da plataforma"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[session.role]}</p>
          </div>

          <Link
            href="/notificacoes"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
            {(unread.data ?? 0) > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]"
              >
                {unread.data! > 9 ? "9+" : unread.data}
              </Badge>
            )}
          </Link>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
