/**
 * Disponibilidade, férias e preferências.
 *
 * Tudo aqui é restrição obrigatória na geração de escala — não é sugestão. Por
 * isso a tela explicita o efeito de cada registro: quem cadastra precisa
 * entender que está removendo o servidor de um horário.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Clock, Info, Loader2, Plane, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/contexts/SessionContext";
import { errorMessage, formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

function weekdayLabel(value: number) {
  return WEEKDAYS.find(day => day.value === value)?.label ?? "—";
}

const PERIOD_LABELS: Record<string, string> = {
  MORNING: "manhã",
  AFTERNOON: "tarde",
  EVENING: "noite",
};

export default function Availability() {
  const { session, isManager } = useSession();
  const utils = trpc.useUtils();

  // Gestores escolhem o servidor; servidor e responsável já vêm com o escopo resolvido.
  const serversQuery = trpc.people.servers.list.useQuery(
    { includeInactive: false },
    { enabled: isManager },
  );
  const dependentsQuery = trpc.people.myDependents.useQuery(undefined, {
    enabled: session?.role === "RESPONSIBLE",
  });

  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedServerId !== null) return;
    if (session?.role === "SERVER" && session.serverId) {
      setSelectedServerId(session.serverId);
      return;
    }
    if (session?.role === "RESPONSIBLE") {
      const first = dependentsQuery.data?.[0];
      if (first) setSelectedServerId(first.id);
      return;
    }
    const firstServer = serversQuery.data?.[0];
    if (firstServer) setSelectedServerId(firstServer.id);
  }, [
    selectedServerId,
    session?.role,
    session?.serverId,
    dependentsQuery.data,
    serversQuery.data,
  ]);

  const serverOptions = useMemo(() => {
    if (session?.role === "RESPONSIBLE") {
      return (dependentsQuery.data ?? []).map(dep => ({
        id: dep.id,
        name: dep.name,
      }));
    }
    if (session?.role === "SERVER") {
      return session.serverId
        ? [{ id: session.serverId, name: session.displayName }]
        : [];
    }
    return (serversQuery.data ?? []).map(server => ({ id: server.id, name: server.name }));
  }, [session, dependentsQuery.data, serversQuery.data]);

  const enabled = selectedServerId !== null && selectedServerId > 0;
  const serverParam = useMemo(
    () => ({ serverId: selectedServerId ?? 0 }),
    [selectedServerId],
  );

  const recurring = trpc.availability.recurring.list.useQuery(serverParam, { enabled });
  const vacations = trpc.availability.vacations.list.useQuery(serverParam, { enabled });
  const preferences = trpc.availability.preferences.listByServer.useQuery(serverParam, {
    enabled,
  });

  const [windowForm, setWindowForm] = useState({ weekday: "0", startTime: "07:00", endTime: "12:00" });
  const [vacationForm, setVacationForm] = useState({ startDate: "", endDate: "", reason: "" });

  const createWindow = trpc.availability.recurring.create.useMutation({
    onSuccess: () => {
      void utils.availability.recurring.list.invalidate();
      toast.success("Janela de disponibilidade registrada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const removeWindow = trpc.availability.recurring.remove.useMutation({
    onSuccess: () => {
      void utils.availability.recurring.list.invalidate();
      toast.success("Janela removida.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const createVacation = trpc.availability.vacations.create.useMutation({
    onSuccess: () => {
      void utils.availability.vacations.list.invalidate();
      setVacationForm({ startDate: "", endDate: "", reason: "" });
      toast.success("Período de férias registrado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const removeVacation = trpc.availability.vacations.remove.useMutation({
    onSuccess: () => {
      void utils.availability.vacations.list.invalidate();
      toast.success("Período removido.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Disponibilidade</h1>
        <p className="text-sm text-muted-foreground">
          Janelas semanais, férias e horários preferidos.
        </p>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Estas informações são respeitadas como restrição obrigatória: o sistema
          não escala ninguém fora da sua disponibilidade, nem durante as férias.
        </AlertDescription>
      </Alert>

      {serverOptions.length > 1 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-5">
            <div className="min-w-64 space-y-1.5">
              <Label htmlFor="server" className="text-xs">
                Servidor
              </Label>
              <Select
                value={selectedServerId ? String(selectedServerId) : undefined}
                onValueChange={value => setSelectedServerId(Number(value))}
              >
                <SelectTrigger id="server">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {serverOptions.map(option => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {!enabled ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecione um servidor para ver e editar a disponibilidade.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="recurring">
          <TabsList>
            <TabsTrigger value="recurring">Semanal</TabsTrigger>
            <TabsTrigger value="vacations">Férias</TabsTrigger>
            <TabsTrigger value="preferences">Preferências</TabsTrigger>
          </TabsList>

          <TabsContent value="recurring" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Nova janela semanal</CardTitle>
                <CardDescription>
                  Informe o dia da semana e o intervalo em que o servidor pode servir.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Dia</Label>
                  <Select
                    value={windowForm.weekday}
                    onValueChange={value => setWindowForm({ ...windowForm, weekday: value })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map(day => (
                        <SelectItem key={day.value} value={String(day.value)}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Das</Label>
                  <Input
                    type="time"
                    className="w-32"
                    value={windowForm.startTime}
                    onChange={event =>
                      setWindowForm({ ...windowForm, startTime: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Até</Label>
                  <Input
                    type="time"
                    className="w-32"
                    value={windowForm.endTime}
                    onChange={event => setWindowForm({ ...windowForm, endTime: event.target.value })}
                  />
                </div>
                <Button
                  className="gap-2"
                  onClick={() =>
                    createWindow.mutate({
                      serverId: selectedServerId!,
                      weekday: Number(windowForm.weekday),
                      startTime: windowForm.startTime,
                      endTime: windowForm.endTime,
                    })
                  }
                  disabled={createWindow.isPending}
                >
                  {createWindow.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Adicionar
                </Button>
              </CardContent>
            </Card>

            {recurring.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (recurring.data ?? []).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <Clock className="h-7 w-7 text-muted-foreground" />
                  <p className="font-medium">Nenhuma janela cadastrada</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Sem disponibilidade cadastrada, este servidor não aparece como
                    elegível na montagem das escalas.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {(recurring.data ?? []).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {weekdayLabel(item.weekday)} · {item.startTime?.slice(0, 5)} às{" "}
                          {item.endTime?.slice(0, 5)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.availabilityType === "AVAILABLE" ? "Disponível" : "Indisponível"}
                          {item.scope === "FAMILY" ? " · vale para a família" : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Remover janela"
                        onClick={() => removeWindow.mutate({ id: item.id })}
                        disabled={removeWindow.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="vacations" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Registrar férias</CardTitle>
                <CardDescription>
                  Durante o período informado o servidor não será escalado.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Saída</Label>
                  <Input
                    type="date"
                    className="w-40"
                    value={vacationForm.startDate}
                    onChange={event =>
                      setVacationForm({ ...vacationForm, startDate: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Retorno</Label>
                  <Input
                    type="date"
                    className="w-40"
                    value={vacationForm.endDate}
                    onChange={event =>
                      setVacationForm({ ...vacationForm, endDate: event.target.value })
                    }
                  />
                </div>
                <div className="min-w-48 flex-1 space-y-1.5">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input
                    placeholder="Viagem em família"
                    value={vacationForm.reason}
                    onChange={event =>
                      setVacationForm({ ...vacationForm, reason: event.target.value })
                    }
                  />
                </div>
                <Button
                  className="gap-2"
                  onClick={() =>
                    createVacation.mutate({
                      serverId: selectedServerId!,
                      startDate: vacationForm.startDate,
                      endDate: vacationForm.endDate,
                      reason:
                        vacationForm.reason.trim().length > 0 ? vacationForm.reason.trim() : null,
                    })
                  }
                  disabled={
                    createVacation.isPending ||
                    vacationForm.startDate.length === 0 ||
                    vacationForm.endDate.length === 0
                  }
                >
                  <Plus className="h-4 w-4" />
                  Registrar
                </Button>
              </CardContent>
            </Card>

            {vacations.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (vacations.data ?? []).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <Plane className="h-7 w-7 text-muted-foreground" />
                  <p className="font-medium">Nenhum período de férias</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {(vacations.data ?? []).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(item.startDate)} até {formatDate(item.endDate)}
                        </p>
                        {item.reason && (
                          <p className="text-xs text-muted-foreground">{item.reason}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Remover período"
                        onClick={() => removeVacation.mutate({ id: item.id })}
                        disabled={removeVacation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 pt-4">
            {preferences.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (preferences.data ?? []).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <CalendarOff className="h-7 w-7 text-muted-foreground" />
                  <p className="font-medium">Nenhuma preferência informada</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Preferências não impedem a escala, mas orientam a ordem de
                    escolha quando há mais de um servidor apto.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {(preferences.data ?? []).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {item.weekday === null ? "Qualquer dia" : weekdayLabel(item.weekday)}
                          {item.period ? ` · ${PERIOD_LABELS[item.period]}` : ""}
                        </p>
                        {item.roleName && (
                          <p className="text-xs text-muted-foreground">
                            Função preferida: {item.roleName}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary">prioridade {item.priority}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
