/**
 * Detalhe do evento: tarefas, turnos e voluntariado.
 *
 * A ordem das ações aqui reflete a regra do backend: ninguém é alocado num
 * turno sem ter manifestado interesse antes. A coordenação escolhe entre quem
 * se ofereceu, não entre todos os servidores da paróquia.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  HandHeart,
  Loader2,
  Plus,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/contexts/SessionContext";
import { errorMessage, formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { EVENT_TYPE_LABELS, type EventType } from "@shared/domain";

export default function EventDetail() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const { session, isManager } = useSession();
  const utils = trpc.useUtils();

  const detail = trpc.events.get.useQuery({ id: eventId }, { enabled: Number.isFinite(eventId) });
  const [taskOpen, setTaskOpen] = useState(false);
  const [shiftTaskId, setShiftTaskId] = useState<number | null>(null);
  const [interestShiftId, setInterestShiftId] = useState<number | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

  const [taskForm, setTaskForm] = useState({ name: "", description: "" });
  const [shiftForm, setShiftForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
    slots: "2",
    notes: "",
  });

  const invalidate = () => void utils.events.get.invalidate({ id: eventId });

  const createTask = trpc.events.tasks.create.useMutation({
    onSuccess: () => {
      invalidate();
      setTaskOpen(false);
      setTaskForm({ name: "", description: "" });
      toast.success("Tarefa criada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const createShift = trpc.events.shifts.create.useMutation({
    onSuccess: () => {
      invalidate();
      setShiftTaskId(null);
      setShiftForm({ date: "", startTime: "", endTime: "", slots: "2", notes: "" });
      toast.success("Turno criado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const express = trpc.events.volunteering.express.useMutation({
    onSuccess: () => {
      invalidate();
      setInterestShiftId(null);
      toast.success("Interesse registrado. A coordenação fará a alocação.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const dependents = trpc.people.myDependents.useQuery(undefined, {
    enabled: session?.role === "RESPONSIBLE",
  });
  const dependentOptions = useMemo(
    () => (dependents.data ?? []).map(dep => ({ id: dep.id, name: dep.name })),
    [dependents.data],
  );

  useEffect(() => {
    if (session?.role === "SERVER") {
      setSelectedServerId(session.serverId ?? null);
      return;
    }
    if (session?.role === "RESPONSIBLE" && selectedServerId === null && dependentOptions.length > 0) {
      setSelectedServerId(dependentOptions[0].id);
    }
  }, [session, selectedServerId, dependentOptions]);

  const volunteerServerId = session?.role === "SERVER" ? session.serverId : selectedServerId;

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
        <CardContent className="py-14 text-center">
          <p className="font-medium">Evento não encontrado</p>
          <Link href="/eventos" className="mt-2 inline-block text-sm text-primary underline">
            Voltar para eventos
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { event, tasks, shifts } = detail.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/eventos"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Eventos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              {EVENT_TYPE_LABELS[event.eventType as EventType] ?? event.eventType}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          {isManager && (
            <Button className="gap-2" onClick={() => setTaskOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova tarefa
            </Button>
          )}
        </div>
      </div>

      {session?.role === "RESPONSIBLE" && dependentOptions.length > 1 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-5">
            <div className="min-w-64 space-y-1.5">
              <Label htmlFor="event-detail-server">Servidor representado</Label>
              <Select
                value={selectedServerId ? String(selectedServerId) : undefined}
                onValueChange={value => setSelectedServerId(Number(value))}
              >
                <SelectTrigger id="event-detail-server"><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
                <SelectContent>
                  {dependentOptions.map(server => (
                    <SelectItem key={server.id} value={String(server.id)}>{server.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma tarefa definida</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isManager
                ? "Crie tarefas (por exemplo, recepção ou limpeza) e depois abra turnos com vagas."
                : "A coordenação ainda não abriu frentes de voluntariado neste evento."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => {
            const taskShifts = shifts.filter(shift => shift.eventTaskId === task.id);
            return (
              <Card key={task.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{task.name}</CardTitle>
                      {task.description && <CardDescription>{task.description}</CardDescription>}
                    </div>
                    {isManager && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 bg-background"
                        onClick={() => setShiftTaskId(task.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Turno
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {taskShifts.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                      Nenhum turno aberto nesta tarefa.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {taskShifts.map(shift => (
                        <div
                          key={shift.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {formatDate(shift.date)} · {String(shift.startTime).slice(0, 5)}
                              {"–"}
                              {String(shift.endTime).slice(0, 5)}
                            </p>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Users className="h-3.5 w-3.5" />
                              {shift.filledSlots} de {shift.slots} vagas
                              {shift.remainingSlots > 0
                                ? ` · ${shift.remainingSlots} em aberto`
                                : " · completo"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {shift.remainingSlots === 0 ? (
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                completo
                              </Badge>
                            ) : (
                              <Badge variant="outline">{shift.remainingSlots} vaga(s)</Badge>
                            )}
                            {volunteerServerId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 bg-background"
                                onClick={() => setInterestShiftId(shift.id)}
                              >
                                <HandHeart className="h-3.5 w-3.5" />
                                Tenho interesse
                              </Button>
                            )}
                            {isManager && (
                              <ShiftInterests shiftId={shift.id} eventId={eventId} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>
              Uma frente de trabalho do evento — os turnos com vagas vêm depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-name">Nome</Label>
              <Input
                id="task-name"
                value={taskForm.name}
                onChange={e => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="Recepção"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Descrição</Label>
              <Textarea
                id="task-desc"
                rows={3}
                value={taskForm.description}
                onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-background" onClick={() => setTaskOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={createTask.isPending || taskForm.name.trim().length < 2}
              onClick={() =>
                createTask.mutate({
                  eventId,
                  name: taskForm.name.trim(),
                  description: taskForm.description.trim() || null,
                })
              }
            >
              {createTask.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftTaskId !== null} onOpenChange={open => !open && setShiftTaskId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo turno</DialogTitle>
            <DialogDescription>Defina horário e quantidade de vagas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shift-date">Data</Label>
              <Input
                id="shift-date"
                type="date"
                value={shiftForm.date}
                onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="shift-start">Início</Label>
                <Input
                  id="shift-start"
                  type="time"
                  value={shiftForm.startTime}
                  onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-end">Término</Label>
                <Input
                  id="shift-end"
                  type="time"
                  value={shiftForm.endTime}
                  onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-slots">Vagas</Label>
                <Input
                  id="shift-slots"
                  type="number"
                  min={1}
                  max={100}
                  value={shiftForm.slots}
                  onChange={e => setShiftForm({ ...shiftForm, slots: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shift-notes">Observações</Label>
              <Textarea
                id="shift-notes"
                rows={2}
                value={shiftForm.notes}
                onChange={e => setShiftForm({ ...shiftForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setShiftTaskId(null)}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={
                createShift.isPending ||
                !shiftForm.date ||
                !shiftForm.startTime ||
                !shiftForm.endTime
              }
              onClick={() =>
                shiftTaskId !== null &&
                createShift.mutate({
                  eventTaskId: shiftTaskId,
                  date: shiftForm.date,
                  startTime: shiftForm.startTime,
                  endTime: shiftForm.endTime,
                  slots: Number(shiftForm.slots) || 1,
                  notes: shiftForm.notes.trim() || null,
                })
              }
            >
              {createShift.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={interestShiftId !== null}
        onOpenChange={open => !open && setInterestShiftId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manifestar interesse</DialogTitle>
            <DialogDescription>
              Interesse não é alocação: a coordenação confirma quem entra no turno.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setInterestShiftId(null)}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={express.isPending || !volunteerServerId}
              onClick={() =>
                interestShiftId !== null &&
                volunteerServerId &&
                express.mutate({
                  eventShiftId: interestShiftId,
                  serverId: volunteerServerId,
                })
              }
            >
              {express.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar interesse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Lista de interessados num turno, com alocação e remoção pela coordenação. */
function ShiftInterests({ shiftId, eventId }: { shiftId: number; eventId: number }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const interests = trpc.events.volunteering.interests.useQuery(
    { eventShiftId: shiftId },
    { enabled: open },
  );

  const assign = trpc.events.volunteering.assign.useMutation({
    onSuccess: () => {
      void utils.events.get.invalidate({ id: eventId });
      void utils.events.volunteering.interests.invalidate({ eventShiftId: shiftId });
      toast.success("Voluntário alocado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const unassign = trpc.events.volunteering.unassign.useMutation({
    onSuccess: () => {
      void utils.events.get.invalidate({ id: eventId });
      void utils.events.volunteering.interests.invalidate({ eventShiftId: shiftId });
      toast.success("Alocação removida.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  return (
    <>
      <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setOpen(true)}>
        <Users className="h-3.5 w-3.5" />
        Interessados
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interessados no turno</DialogTitle>
            <DialogDescription>
              Só quem manifestou interesse pode ser alocado.
            </DialogDescription>
          </DialogHeader>
          {interests.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (interests.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguém manifestou interesse ainda.
            </p>
          ) : (
            <div className="divide-y">
              {(interests.data ?? []).map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.serverName ?? "Servidor"}
                      {item.isMinor && (
                        <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                          menor
                        </Badge>
                      )}
                    </p>
                    {item.availabilityNote && (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.availabilityNote}
                      </p>
                    )}
                  </div>
                  {item.alreadyAssigned ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-destructive"
                      disabled={unassign.isPending || item.serverId === null}
                      onClick={() =>
                        item.serverId !== null &&
                        unassign.mutate({ eventShiftId: shiftId, serverId: item.serverId })
                      }
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={assign.isPending || item.serverId === null}
                      onClick={() =>
                        item.serverId !== null &&
                        assign.mutate({ eventShiftId: shiftId, serverId: item.serverId })
                      }
                    >
                      Alocar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
