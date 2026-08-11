/**
 * Assistente de IA para escalas.
 *
 * A tela foi desenhada em torno de uma restrição do domínio: a IA nunca publica.
 * Ela propõe, mostra a justificativa de cada nome e expõe as vagas que não
 * conseguiu preencher. O coordenador aceita item por item — e o que é aplicado
 * entra como rascunho, não como escala publicada.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, formatDate, formatDateTime, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AI_PRIORITY_MODE_LABELS, type AiPriorityMode } from "@shared/domain";

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function AiAssistant() {
  const utils = trpc.useUtils();
  const [periodStart, setPeriodStart] = useState(() => isoDate(1));
  const [periodEnd, setPeriodEnd] = useState(() => isoDate(30));
  const [priorityMode, setPriorityMode] = useState<AiPriorityMode>("BALANCED");
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  const runs = trpc.ai.listRuns.useQuery({ limit: 20 });

  const run = trpc.ai.getRun.useQuery(
    { runId: openRunId ?? 0 },
    { enabled: openRunId !== null },
  );

  const generate = trpc.ai.generate.useMutation({
    onSuccess: result => {
      void utils.ai.listRuns.invalidate();
      setOpenRunId(result.runId);
      setRejected(new Set());
      if (result.unfilledSlots > 0) {
        toast.warning(
          `Proposta gerada com ${result.unfilledSlots} vaga(s) em aberto. Revise antes de aplicar.`,
        );
      } else {
        toast.success("Proposta gerada. Revise cada sugestão antes de aplicar.");
      }
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const applyProposal = trpc.ai.applyProposal.useMutation({
    onSuccess: () => {
      void utils.ai.invalidate();
      void utils.schedules.invalidate();
      toast.success(
        "Sugestões aplicadas como rascunho. Revise em Celebrações e publique quando estiver pronto.",
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const discard = trpc.ai.discard.useMutation({
    onSuccess: () => {
      void utils.ai.invalidate();
      setOpenRunId(null);
      toast.success("Proposta descartada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const items = run.data?.items ?? [];
  const filledItems = useMemo(() => items.filter(item => !item.isUnfilled), [items]);
  const unfilledItems = useMemo(() => items.filter(item => item.isUnfilled), [items]);
  const acceptedIds = useMemo(
    () => filledItems.filter(item => !rejected.has(item.id)).map(item => item.id),
    [filledItems, rejected],
  );

  const currentRun = run.data?.run;
  const isClosed = Boolean(currentRun?.appliedAt || currentRun?.discardedAt);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente de IA</h1>
        <p className="text-sm text-muted-foreground">
          Gera propostas de escala respeitando disponibilidade, habilitação e idade mínima.
        </p>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>A IA não publica escalas</AlertTitle>
        <AlertDescription>
          Toda proposta passa pela sua revisão. Ao aplicar, as alocações entram
          como rascunho e a publicação continua sendo uma decisão sua.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gerar nova proposta</CardTitle>
          <CardDescription>
            Escolha o período e o critério de prioridade para o preenchimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              className="w-40"
              value={periodStart}
              onChange={event => setPeriodStart(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              className="w-40"
              value={periodEnd}
              onChange={event => setPeriodEnd(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prioridade</Label>
            <Select
              value={priorityMode}
              onValueChange={value => setPriorityMode(value as AiPriorityMode)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AI_PRIORITY_MODE_LABELS) as AiPriorityMode[]).map(mode => (
                  <SelectItem key={mode} value={mode}>
                    {AI_PRIORITY_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="gap-2"
            onClick={() => generate.mutate({ periodStart, periodEnd, priorityMode })}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Gerar proposta
          </Button>
        </CardContent>
      </Card>

      {openRunId !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Proposta de {formatDate(currentRun?.periodStart)} a{" "}
                  {formatDate(currentRun?.periodEnd)}
                </CardTitle>
                <CardDescription>
                  {filledItems.length} sugestões · {unfilledItems.length} vagas em aberto
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {currentRun?.appliedAt && <Badge variant="secondary">aplicada</Badge>}
                {currentRun?.discardedAt && <Badge variant="outline">descartada</Badge>}
                <Button variant="ghost" size="sm" onClick={() => setOpenRunId(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {run.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                {currentRun?.summary && (
                  <p className="rounded-lg bg-muted/50 p-4 text-sm">{currentRun.summary}</p>
                )}

                {unfilledItems.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Vagas que a IA não conseguiu preencher</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1">
                        {unfilledItems.map(item => (
                          <li key={item.id}>
                            {formatDate(item.celebrationDate)} · {item.roleName}
                            {item.conflictReason ? ` — ${item.conflictReason}` : ""}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {filledItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Sugestões — desmarque o que não quiser aplicar
                    </p>
                    <div className="divide-y rounded-lg border">
                      {filledItems.map(item => {
                        const isRejected = rejected.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 p-3.5"
                          >
                            <Checkbox
                              id={`item-${item.id}`}
                              checked={!isRejected}
                              disabled={isClosed}
                              onCheckedChange={checked => {
                                const next = new Set(rejected);
                                if (checked) next.delete(item.id);
                                else next.add(item.id);
                                setRejected(next);
                              }}
                              className="mt-0.5"
                            />
                            <label
                              htmlFor={`item-${item.id}`}
                              className="min-w-0 flex-1 cursor-pointer"
                            >
                              <p className="text-sm font-medium">
                                {item.serverName} — {item.roleName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(item.celebrationDate)} às{" "}
                                {formatTime(item.celebrationTime)} · {item.celebrationTitle}
                              </p>
                              {item.justification && (
                                <p className="mt-1 text-xs italic text-muted-foreground">
                                  {item.justification}
                                </p>
                              )}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isClosed && (
                  <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                    <Button
                      className="gap-2"
                      onClick={() =>
                        applyProposal.mutate({
                          runId: openRunId,
                          acceptedProposalIds: acceptedIds,
                        })
                      }
                      disabled={applyProposal.isPending || acceptedIds.length === 0}
                    >
                      {applyProposal.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Aplicar {acceptedIds.length} sugestão(ões) como rascunho
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 bg-background"
                      onClick={() => discard.mutate({ runId: openRunId })}
                      disabled={discard.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Descartar proposta
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico de propostas</h2>
        {runs.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (runs.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma proposta gerada até agora.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {(runs.data ?? []).map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpenRunId(item.id);
                    setRejected(new Set());
                  }}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {formatDate(item.periodStart)} a {formatDate(item.periodEnd)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)} ·{" "}
                      {item.appliedAt
                        ? "aplicada"
                        : item.discardedAt
                          ? "descartada"
                          : "aguardando revisão"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
