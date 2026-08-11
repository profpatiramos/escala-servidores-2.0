/**
 * Montagem da escala de uma celebração.
 *
 * O ponto central desta tela: as violações vêm do backend, não do frontend.
 * Bloqueantes impedem gravar; avisos são exibidos mas não travam o coordenador,
 * porque ele conhece contextos que o sistema não modela.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
  Send,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleStatusBadge } from "@/pages/Dashboard";
import { errorMessage, formatDateLong, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";

type DraftAssignment = {
  serverId: number;
  serverName: string;
  parishRoleId: number;
  roleName: string;
};

export default function CelebrationDetail() {
  const params = useParams<{ id: string }>();
  const celebrationId = Number(params.id);
  const utils = trpc.useUtils();

  const [picker, setPicker] = useState<{ parishRoleId: number; roleName: string } | null>(null);
  const [draft, setDraft] = useState<DraftAssignment[] | null>(null);

  const detail = trpc.schedules.get.useQuery(
    { celebrationId },
    { enabled: Number.isFinite(celebrationId) && celebrationId > 0 },
  );

  const validation = trpc.schedules.validate.useQuery(
    { celebrationId },
    { enabled: Number.isFinite(celebrationId) && celebrationId > 0 },
  );

  const eligible = trpc.schedules.eligibleServers.useQuery(
    { celebrationId, parishRoleId: picker?.parishRoleId ?? 0 },
    { enabled: picker !== null },
  );

  const setAssignments = trpc.schedules.setAssignments.useMutation({
    onSuccess: result => {
      void utils.schedules.invalidate();
      // O backend só grava quando não há impedimento. Se `saved` for falso, o
      // rascunho local é preservado para o coordenador ajustar sem perder o trabalho.
      if (!result.saved) {
        toast.error("Há impedimentos que precisam ser resolvidos antes de gravar.");
        return;
      }
      setDraft(null);
      toast.success(
        result.validation.warnings.length > 0
          ? "Escala salva com avisos. Revise antes de publicar."
          : "Escala salva.",
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const setStatus = trpc.schedules.setStatus.useMutation({
    onSuccess: (_data, variables) => {
      void utils.schedules.invalidate();
      toast.success(
        variables.status === "PUBLISHED"
          ? "Escala publicada. Os servidores e responsáveis foram avisados."
          : "Situação da escala atualizada.",
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  // A lista efetiva é o rascunho local quando existe; caso contrário, o que veio do servidor.
  const current: DraftAssignment[] = useMemo(() => {
    if (draft) return draft;
    return (detail.data?.assignments ?? []).map(a => ({
      serverId: a.serverId,
      serverName: a.serverName,
      parishRoleId: a.parishRoleId,
      roleName: a.roleName,
    }));
  }, [draft, detail.data?.assignments]);

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Celebração não encontrada</p>
          <Button asChild variant="outline" className="mt-4 bg-background">
            <Link href="/celebracoes">Voltar para celebrações</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { celebration, schedule, needs } = detail.data;
  const isPublished = schedule?.status === "PUBLISHED";
  const hasDraftChanges = draft !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/celebracoes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Celebrações
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{celebration.title}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDateLong(celebration.date)} · {formatTime(celebration.startTime)} às{" "}
              {formatTime(celebration.endTime)}
              {celebration.location ? ` · ${celebration.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ScheduleStatusBadge status={schedule?.status ?? null} />
            {schedule && schedule.version > 1 && (
              <Badge variant="outline">versão {schedule.version}</Badge>
            )}
          </div>
        </div>
      </div>

      {isPublished && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Esta escala já está publicada</AlertTitle>
          <AlertDescription>
            Alterar as alocações agora gera uma nova versão e avisa novamente todos
            os envolvidos, incluindo os responsáveis dos menores.
          </AlertDescription>
        </Alert>
      )}

      {validation.data && validation.data.blocking.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Impedimentos</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {validation.data.blocking.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {validation.data && validation.data.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pontos de atenção</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {validation.data.warnings.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {needs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Info className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma função definida para esta celebração</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Defina quantos servidores cada função precisa antes de montar a
                escala. Sem isso o sistema não consegue avaliar se a equipe está
                completa.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {needs.map(need => {
            const filled = current.filter(a => a.parishRoleId === need.parishRoleId);
            const missing = Math.max(0, need.quantity - filled.length);

            return (
              <Card key={need.parishRoleId}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{need.roleName}</CardTitle>
                      <CardDescription>
                        {filled.length} de {need.quantity} preenchidos
                        {need.requirements ? ` · ${need.requirements}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {missing === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          completo
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          faltam {missing}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 bg-background"
                        onClick={() =>
                          setPicker({ parishRoleId: need.parishRoleId, roleName: need.roleName })
                        }
                      >
                        <UserPlus className="h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filled.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum servidor escalado nesta função.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {filled.map(assignment => (
                        <li
                          key={`${assignment.parishRoleId}-${assignment.serverId}`}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <span className="text-sm font-medium">{assignment.serverName}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Remover ${assignment.serverName}`}
                            onClick={() =>
                              setDraft(
                                current.filter(
                                  a =>
                                    !(
                                      a.serverId === assignment.serverId &&
                                      a.parishRoleId === assignment.parishRoleId
                                    ),
                                ),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button
          onClick={() =>
            setAssignments.mutate({
              celebrationId,
              assignments: current.map(a => ({
                serverId: a.serverId,
                parishRoleId: a.parishRoleId,
              })),
            })
          }
          disabled={setAssignments.isPending || !hasDraftChanges}
        >
          {setAssignments.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar escala
        </Button>

        {!isPublished && (
          <Button
            variant="default"
            className="gap-2"
            onClick={() => setStatus.mutate({ celebrationId, status: "PUBLISHED" })}
            disabled={
              setStatus.isPending ||
              hasDraftChanges ||
              (validation.data?.blocking.length ?? 0) > 0
            }
          >
            <Send className="h-4 w-4" />
            Publicar escala
          </Button>
        )}

        {hasDraftChanges && (
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Descartar alterações
          </Button>
        )}

        {hasDraftChanges && (
          <p className="text-sm text-muted-foreground">
            Salve antes de publicar — a publicação usa o que está gravado.
          </p>
        )}
      </div>

      <Dialog open={picker !== null} onOpenChange={open => !open && setPicker(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Escalar em {picker?.roleName}</DialogTitle>
            <DialogDescription>
              A lista mostra apenas quem está apto e disponível, ordenado por
              preferência de horário e menor carga recente.
            </DialogDescription>
          </DialogHeader>

          {eligible.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (eligible.data ?? []).length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-medium">Ninguém disponível para esta função</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Verifique as habilitações dos servidores, as férias cadastradas e a
                disponibilidade no dia da semana da celebração.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {(eligible.data ?? [])
                .filter(
                  candidate =>
                    !current.some(
                      a =>
                        a.serverId === candidate.serverId &&
                        a.parishRoleId === picker?.parishRoleId,
                    ),
                )
                .map(candidate => (
                  <li key={candidate.serverId}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                      onClick={() => {
                        if (!picker) return;
                        setDraft([
                          ...current,
                          {
                            serverId: candidate.serverId,
                            serverName: candidate.name,
                            parishRoleId: picker.parishRoleId,
                            roleName: picker.roleName,
                          },
                        ]);
                        setPicker(null);
                      }}
                    >
                      <div>
                        <p className="text-sm font-medium">{candidate.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {candidate.age} anos · {candidate.recentAssignments} escalas recentes
                        </p>
                      </div>
                      {candidate.preferenceScore > 0 && (
                        <Badge variant="secondary" className="shrink-0">
                          horário preferido
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPicker(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
