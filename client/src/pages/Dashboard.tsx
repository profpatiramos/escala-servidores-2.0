/**
 * Painel por perfil.
 *
 * O coordenador vê o que exige ação dele (confirmações em aberto, conflitos,
 * substituições). O responsável vê apenas o que envolve seus dependentes.
 * A diferença não é cosmética: o responsável não deveria enxergar a operação
 * inteira da paróquia.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Repeat2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/contexts/SessionContext";
import { formatDate, formatDateLong, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDaysISO(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function Dashboard() {
  const { session, isManager } = useSession();

  // Referências estáveis: strings literais recalculadas a cada render causariam
  // refetch infinito nas queries que as recebem como input.
  const range = useMemo(() => ({ from: todayISO(), to: addDaysISO(30) }), []);

  const celebrations = trpc.schedules.celebrations.list.useQuery(range, {
    enabled: isManager,
  });
  const conflicts = trpc.confirmations.conflicts.list.useQuery(
    { onlyOpen: true },
    { enabled: isManager },
  );
  const substitutions = trpc.confirmations.substitutions.list.useQuery(
    { onlyPending: true },
    { enabled: isManager },
  );
  const pending = trpc.confirmations.pending.useQuery(undefined, {
    enabled: session?.role === "RESPONSIBLE" || session?.role === "SERVER",
  });
  const dependents = trpc.people.myDependents.useQuery(undefined, {
    enabled: session?.role === "RESPONSIBLE",
  });

  if (!session) return null;

  const upcoming = celebrations.data ?? [];
  const awaitingPublication = upcoming.filter(c => c.scheduleStatus !== "PUBLISHED").length;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {session.displayName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isManager
            ? "Aqui está o que precisa da sua atenção nos próximos 30 dias."
            : "Acompanhe as confirmações e a agenda da sua família."}
        </p>
      </header>

      {isManager && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Celebrações em 30 dias"
              value={upcoming.length}
              icon={CalendarDays}
              loading={celebrations.isLoading}
            />
            <StatCard
              label="Escalas não publicadas"
              value={awaitingPublication}
              icon={Clock}
              tone={awaitingPublication > 0 ? "warning" : "default"}
              loading={celebrations.isLoading}
            />
            <StatCard
              label="Conflitos de confirmação"
              value={conflicts.data?.length ?? 0}
              icon={AlertTriangle}
              tone={(conflicts.data?.length ?? 0) > 0 ? "danger" : "default"}
              loading={conflicts.isLoading}
            />
            <StatCard
              label="Substituições pendentes"
              value={substitutions.data?.length ?? 0}
              icon={Repeat2}
              tone={(substitutions.data?.length ?? 0) > 0 ? "warning" : "default"}
              loading={substitutions.isLoading}
            />
          </section>

          {(conflicts.data?.length ?? 0) > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <CardTitle className="text-base">Divergências aguardando decisão</CardTitle>
                    <CardDescription>
                      O responsável e o servidor deram respostas diferentes. Enquanto
                      ninguém decide, a vaga continua pendente.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm" variant="destructive">
                  <Link href="/celebracoes">
                    Resolver agora
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Próximas celebrações</h2>
                <p className="text-sm text-muted-foreground">
                  Escalas em rascunho aparecem primeiro na sua lista de trabalho.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="bg-background">
                <Link href="/celebracoes">Ver todas</Link>
              </Button>
            </div>

            {celebrations.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Nenhuma celebração nos próximos 30 dias</p>
                    <p className="text-sm text-muted-foreground">
                      Cadastre as celebrações para começar a montar as escalas.
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/celebracoes">Cadastrar celebração</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 6).map(celebration => (
                  <Link
                    key={celebration.id}
                    href={`/celebracoes/${celebration.id}`}
                    className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{celebration.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateLong(celebration.date)} às {formatTime(celebration.startTime)}
                          {celebration.location ? ` · ${celebration.location}` : ""}
                        </p>
                      </div>
                      <ScheduleStatusBadge status={celebration.scheduleStatus} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {session.role === "RESPONSIBLE" && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Dependentes vinculados"
              value={dependents.data?.length ?? 0}
              icon={Users}
              loading={dependents.isLoading}
            />
            <StatCard
              label="Confirmações pendentes"
              value={pending.data?.length ?? 0}
              icon={Clock}
              tone={(pending.data?.length ?? 0) > 0 ? "warning" : "default"}
              loading={pending.isLoading}
            />
            <StatCard
              label="Próximo compromisso"
              value={pending.data?.[0] ? formatDate(pending.data[0].celebrationDate) : "—"}
              icon={CalendarDays}
              loading={pending.isLoading}
            />
          </section>

          <PendingConfirmations
            items={pending.data ?? []}
            loading={pending.isLoading}
            showServerName
          />
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: number | string;
  icon: typeof CalendarDays;
  tone?: "default" | "warning" | "danger";
  loading?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-500"
        : "text-foreground";

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className={`h-5 w-5 ${toneClass}`} />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-12" />
          ) : (
            <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ScheduleStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">Sem escala</Badge>;

  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
    PROPOSED: { label: "Proposta", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    PUBLISHED: { label: "Publicada", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    CANCELLED: { label: "Cancelada", className: "bg-destructive/10 text-destructive" },
    ARCHIVED: { label: "Arquivada", className: "bg-muted text-muted-foreground" },
  };

  const config = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}>{config.label}</span>;
}

export function PendingConfirmations({
  items,
  loading,
  showServerName,
}: {
  items: Array<{
    assignmentId: number;
    serverName: string;
    roleName: string;
    celebrationTitle: string;
    celebrationDate: string;
    celebrationStartTime: string | null;
    location: string | null;
  }>;
  loading?: boolean;
  showServerName?: boolean;
}) {
  const utils = trpc.useUtils();
  const respond = trpc.confirmations.respond.useMutation({
    onSuccess: () => {
      void utils.confirmations.pending.invalidate();
    },
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          <p className="font-medium">Nada pendente por aqui</p>
          <p className="text-sm text-muted-foreground">
            Todas as confirmações estão em ordem.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Confirmações pendentes</h2>
      <div className="space-y-3">
        {items.map(item => (
          <Card key={item.assignmentId}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="font-medium">
                  {item.celebrationTitle}
                  {showServerName ? ` · ${item.serverName}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateLong(item.celebrationDate)} às {formatTime(item.celebrationStartTime)}
                  {" · "}
                  {item.roleName}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    respond.mutate({ assignmentId: item.assignmentId, status: "CONFIRMED" })
                  }
                  disabled={respond.isPending}
                >
                  Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  onClick={() =>
                    respond.mutate({ assignmentId: item.assignmentId, status: "DECLINED" })
                  }
                  disabled={respond.isPending}
                >
                  Não vou poder
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
