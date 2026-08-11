/**
 * Gamificação: saldo, conquistas e ranking.
 *
 * Dois padrões da especificação são visíveis aqui de propósito: o ranking pode
 * estar desligado (e vem desligado por padrão), e menores são excluídos do
 * ranking a menos que a paróquia habilite explicitamente. A tela explica isso
 * em vez de simplesmente mostrar uma lista vazia.
 */
import { useMemo, useState } from "react";
import { Award, Info, Medal, Trophy } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/contexts/SessionContext";
import { formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { POINT_EVENT_LABELS } from "@shared/domain";

export default function Gamification() {
  const { session, isManager } = useSession();
  const [selectedServerId, setSelectedServerId] = useState<number | null>(
    session?.serverId ?? null,
  );

  const dependents = trpc.people.myDependents.useQuery(undefined, {
    enabled: session?.role === "RESPONSIBLE",
  });
  const servers = trpc.people.servers.list.useQuery(
    { includeInactive: false },
    { enabled: isManager },
  );

  const options = useMemo(() => {
    if (session?.role === "SERVER") {
      return session.serverId ? [{ id: session.serverId, name: session.displayName }] : [];
    }
    if (session?.role === "RESPONSIBLE") {
      return (dependents.data ?? []).map(dep => ({ id: dep.id, name: dep.name }));
    }
    return (servers.data ?? []).map(server => ({ id: server.id, name: server.name }));
  }, [session, dependents.data, servers.data]);

  const effectiveServerId = selectedServerId ?? options[0]?.id ?? null;

  const balance = trpc.gamification.balance.useQuery(
    { serverId: effectiveServerId ?? 0 },
    { enabled: effectiveServerId !== null },
  );
  const ranking = trpc.gamification.ranking.useQuery({ limit: 20 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reconhecimento</h1>
        <p className="text-sm text-muted-foreground">
          Pontos e conquistas por participação no serviço do altar.
        </p>
      </header>

      <Tabs defaultValue="balance">
        <TabsList>
          <TabsTrigger value="balance">Meus pontos</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
        </TabsList>

        <TabsContent value="balance" className="space-y-4 pt-4">
          {options.length > 1 && (
            <Card>
              <CardContent className="p-5">
                <Select
                  value={effectiveServerId ? String(effectiveServerId) : undefined}
                  onValueChange={value => setSelectedServerId(Number(value))}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Selecione o servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(option => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {balance.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !balance.data ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Selecione um servidor para ver o saldo de pontos.
              </CardContent>
            </Card>
          ) : !balance.data.enabled ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                A gamificação está desativada nesta paróquia. A coordenação pode
                ativá-la nas configurações.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Card>
                <CardContent className="flex items-center gap-5 p-6">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Trophy className="h-8 w-8" />
                  </span>
                  <div>
                    <p className="text-3xl font-semibold tabular-nums">
                      {balance.data.balance ?? 0}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      pontos acumulados
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Histórico de pontos</CardTitle>
                  <CardDescription>
                    O saldo é sempre a soma das transações — nada é editado diretamente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {(balance.data.history ?? []).length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                      Nenhuma pontuação registrada ainda.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {(balance.data.history ?? []).map(tx => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-3 px-6 py-3.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {tx.reason ?? POINT_EVENT_LABELS[tx.eventType] ?? tx.eventType}
                              {tx.isReversal ? " (estorno)" : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(tx.createdAt)}
                            </p>
                          </div>
                          <span
                            className={
                              (tx.pointsDelta ?? 0) >= 0
                                ? "shrink-0 text-sm font-semibold tabular-nums text-emerald-600"
                                : "shrink-0 text-sm font-semibold tabular-nums text-destructive"
                            }
                          >
                            {(tx.pointsDelta ?? 0) >= 0 ? "+" : ""}
                            {tx.pointsDelta}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {(balance.data.achievements ?? []).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Conquistas</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {(balance.data.achievements ?? []).map(achievement => (
                      <Badge key={achievement.id} variant="secondary" className="gap-1.5 py-1.5">
                        <Award className="h-3.5 w-3.5" />
                        {achievement.name}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="ranking" className="space-y-4 pt-4">
          {ranking.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !ranking.data?.enabled ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                O ranking está desativado nesta paróquia. Essa é a configuração
                padrão: a comparação pública entre servidores só existe se a
                coordenação decidir habilitá-la.
              </AlertDescription>
            </Alert>
          ) : (ranking.data.entries ?? []).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Medal className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Ranking sem participantes</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Servidores menores de idade só entram no ranking se a paróquia
                  habilitar essa opção explicitamente.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {(ranking.data.entries ?? []).map((entry, index) => (
                  <div
                    key={entry.serverId}
                    className="flex items-center gap-4 px-6 py-3.5"
                  >
                    <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {entry.points}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
