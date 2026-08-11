/**
 * Relatórios operacionais e trilha de auditoria.
 */
import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const ASSIGNMENT_LABELS: Record<string, string> = {
  ASSIGNED: "escalado",
  CONFIRMED: "confirmado",
  DECLINED: "recusado",
  SUBSTITUTION_REQUESTED: "pediu substituição",
  SUBSTITUTED: "substituído",
  CANCELLED: "cancelado",
  CONFLICT: "resposta divergente",
};

const ABSENCE_LABELS: Record<string, string> = {
  COMMUNICATED_ABSENCE: "avisou antes",
  JUSTIFIED_ABSENCE: "justificada",
  UNJUSTIFIED_ABSENCE: "sem justificativa",
  PENDING_REVIEW: "aguardando análise",
};

export default function Reports() {
  const [from, setFrom] = useState(() => isoDate(-30));
  const [to, setTo] = useState(() => isoDate(30));
  const period = useMemo(() => ({ periodStart: from, periodEnd: to }), [from, to]);

  const participation = trpc.reports.participation.useQuery(period);
  const confirmations = trpc.reports.confirmations.useQuery(period);
  const absences = trpc.reports.absences.useQuery(period);
  const serversByRole = trpc.reports.serversByRole.useQuery();
  const audit = trpc.reports.auditTrail.useQuery({ limit: 50 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Participação, confirmações, ausências e trilha de auditoria.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              className="w-40"
              value={from}
              onChange={event => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              className="w-40"
              value={to}
              onChange={event => setTo(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="participation">
        <TabsList className="flex-wrap">
          <TabsTrigger value="participation">Participação</TabsTrigger>
          <TabsTrigger value="confirmations">Confirmações</TabsTrigger>
          <TabsTrigger value="absences">Ausências</TabsTrigger>
          <TabsTrigger value="roles">Por função</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="participation" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Participação por servidor</CardTitle>
              <CardDescription>
                Escalações, presenças e ausências no período selecionado.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {participation.isLoading ? (
                <Skeleton className="mx-6 mb-6 h-32" />
              ) : (participation.data ?? []).length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nenhum dado no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servidor</TableHead>
                      <TableHead className="text-right">Escalado</TableHead>
                      <TableHead className="text-right">Presente</TableHead>
                      <TableHead className="text-right">Ausente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(participation.data ?? []).map(row => (
                      <TableRow key={row.serverId}>
                        <TableCell className="font-medium">{row.serverName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.assignments ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.present ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.absences ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="confirmations" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Confirmações</CardTitle>
              <CardDescription>
                Quem ainda não respondeu aparece como aguardando — ausência de
                resposta não é o mesmo que recusa.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {confirmations.isLoading ? (
                <Skeleton className="mx-6 mb-6 h-24" />
              ) : (confirmations.data ?? []).length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nenhuma escalação no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servidor</TableHead>
                      <TableHead>Celebração</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(confirmations.data ?? []).map(row => (
                      <TableRow key={row.assignmentId}>
                        <TableCell className="font-medium">{row.serverName}</TableCell>
                        <TableCell>{row.celebrationTitle}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(row.date)} · {String(row.startTime).slice(0, 5)}
                        </TableCell>
                        <TableCell>{row.roleName}</TableCell>
                        <TableCell>
                          {row.awaitingResponse ? (
                            <Badge variant="outline">aguardando resposta</Badge>
                          ) : (
                            <Badge
                              variant={
                                row.assignmentStatus === "CONFIRMED"
                                  ? "default"
                                  : row.assignmentStatus === "DECLINED"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {ASSIGNMENT_LABELS[row.assignmentStatus] ?? row.assignmentStatus}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absences" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ausências registradas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {absences.isLoading ? (
                <Skeleton className="mx-6 mb-6 h-24" />
              ) : (absences.data ?? []).length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nenhuma ausência no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servidor</TableHead>
                      <TableHead>Celebração</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Classificação</TableHead>
                      <TableHead>Justificativa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(absences.data ?? []).map(row => (
                      <TableRow key={row.attendanceId}>
                        <TableCell className="font-medium">{row.serverName}</TableCell>
                        <TableCell>{row.celebrationTitle}</TableCell>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === "UNJUSTIFIED_ABSENCE" ? "destructive" : "secondary"
                            }
                          >
                            {ABSENCE_LABELS[row.status] ?? row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          {row.justification ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Servidores habilitados por função</CardTitle>
              <CardDescription>
                Funções com poucos habilitados são o gargalo real das escalas.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {serversByRole.isLoading ? (
                <Skeleton className="mx-6 mb-6 h-24" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Função</TableHead>
                      <TableHead className="text-right">Habilitados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(serversByRole.data ?? []).map(row => (
                      <TableRow key={row.parishRoleId}>
                        <TableCell className="font-medium">{row.roleName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.qualified ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="h-4 w-4" />
                Trilha de auditoria
              </CardTitle>
              <CardDescription>
                Registro imutável das ações críticas — nada aqui pode ser editado
                ou apagado.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {audit.isLoading ? (
                <Skeleton className="mx-6 mb-6 h-32" />
              ) : (audit.data ?? []).length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nenhum registro de auditoria ainda.
                </p>
              ) : (
                <div className="divide-y">
                  {(audit.data ?? []).map(entry => (
                    <div key={entry.id} className="px-6 py-3">
                      <p className="text-sm font-medium">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)} · {entry.entityType}
                        {entry.entityId ? ` #${entry.entityId}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
