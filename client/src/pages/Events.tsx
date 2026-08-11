/**
 * Eventos e voluntariado.
 *
 * Acompanhantes aqui são só quantidade — a especificação é explícita em não
 * cadastrar dados de terceiros, e isso importa porque muitos acompanhantes são
 * familiares menores de idade.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarPlus, ClipboardList, Loader2, PartyPopper, Send, Users } from "lucide-react";
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
import { errorMessage, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type EventType,
  type ParticipationResponse,
} from "@shared/domain";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  PUBLISHED: "default",
  CLOSED: "secondary",
  CANCELLED: "destructive",
  ARCHIVED: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "rascunho",
  PUBLISHED: "publicado",
  CLOSED: "inscrições encerradas",
  CANCELLED: "cancelado",
  ARCHIVED: "arquivado",
};

export default function Events() {
  const { session, isManager } = useSession();
  const utils = trpc.useUtils();
  const list = trpc.events.list.useQuery({});
  const [createOpen, setCreateOpen] = useState(false);
  const [respondEvent, setRespondEvent] = useState<{ id: number; name: string } | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    type: "FELLOWSHIP" as EventType,
    location: "",
    startAt: "",
    endAt: "",
    description: "",
    allowsCompanions: false,
    maxCompanionsPerServer: "0",
  });

  const [response, setResponse] = useState<{
    response: ParticipationResponse;
    companionsCount: string;
    note: string;
  }>({ response: "REGISTERED", companionsCount: "0", note: "" });

  const create = trpc.events.create.useMutation({
    onSuccess: () => {
      void utils.events.list.invalidate();
      setCreateOpen(false);
      setForm({
        title: "",
        type: "FELLOWSHIP",
        location: "",
        startAt: "",
        endAt: "",
        description: "",
        allowsCompanions: false,
        maxCompanionsPerServer: "0",
      });
      toast.success("Evento criado como rascunho. Publique para abrir inscrições.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const publish = trpc.events.publish.useMutation({
    onSuccess: () => {
      void utils.events.list.invalidate();
      toast.success("Evento publicado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const respond = trpc.events.participation.respond.useMutation({
    onSuccess: () => {
      void utils.events.invalidate();
      setRespondEvent(null);
      setResponse({ response: "REGISTERED", companionsCount: "0", note: "" });
      toast.success("Resposta registrada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  // O servidor responde por si; o responsável responde pelo dependente.
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

  const respondingServerId = session?.role === "SERVER" ? session.serverId : selectedServerId;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            Festas, procissões, formações e mutirões da paróquia.
          </p>
        </div>
        {isManager && (
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            Novo evento
          </Button>
        )}
      </header>

      {session?.role === "RESPONSIBLE" && dependentOptions.length > 1 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-5">
            <div className="min-w-64 space-y-1.5">
              <Label htmlFor="event-server">Participando como</Label>
              <Select
                value={selectedServerId ? String(selectedServerId) : undefined}
                onValueChange={value => setSelectedServerId(Number(value))}
              >
                <SelectTrigger id="event-server"><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
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

      {list.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <PartyPopper className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhum evento cadastrado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isManager
                ? "Crie o primeiro evento para abrir inscrições de voluntariado."
                : "Quando a coordenação publicar um evento, ele aparecerá aqui."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(list.data ?? []).map(event => (
            <Card key={event.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{event.name}</CardTitle>
                  <Badge variant={STATUS_VARIANTS[event.status] ?? "outline"}>
                    {STATUS_LABELS[event.status] ?? event.status}
                  </Badge>
                </div>
                <CardDescription>
                  {EVENT_TYPE_LABELS[event.eventType as EventType] ?? event.eventType}
                  {event.location ? ` · ${event.location}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div className="space-y-1.5 text-sm">
                  <p>{formatDateTime(event.startAt)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {event.totalAttendees ?? 0} confirmados
                    {event.participantLimit ? ` de ${event.participantLimit}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                    <Link href={`/eventos/${event.id}`}>
                      <ClipboardList className="h-3.5 w-3.5" />
                      Turnos
                    </Link>
                  </Button>
                  {isManager && event.status === "DRAFT" && (
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => publish.mutate({ id: event.id })}
                      disabled={publish.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Publicar
                    </Button>
                  )}
                  {respondingServerId && event.status === "PUBLISHED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-background"
                      onClick={() => setRespondEvent({ id: event.id, name: event.name })}
                    >
                      Responder presença
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
            <DialogDescription>
              O evento nasce como rascunho — as inscrições só abrem após publicar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Nome</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={event => setForm({ ...form, title: event.target.value })}
                placeholder="Festa de Corpus Christi"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={value => setForm({ ...form, type: value as EventType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {EVENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-location">Local</Label>
                <Input
                  id="event-location"
                  value={form.location}
                  onChange={event => setForm({ ...form, location: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="event-start">Início</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  value={form.startAt}
                  onChange={event => setForm({ ...form, startAt: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-end">Término (opcional)</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  value={form.endAt}
                  onChange={event => setForm({ ...form, endAt: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-desc">Descrição</Label>
              <Textarea
                id="event-desc"
                rows={3}
                value={form.description}
                onChange={event => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Acompanhantes</Label>
                <Select
                  value={form.allowsCompanions ? "yes" : "no"}
                  onValueChange={value =>
                    setForm({
                      ...form,
                      allowsCompanions: value === "yes",
                      maxCompanionsPerServer: value === "yes" ? "2" : "0",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Não permitir</SelectItem>
                    <SelectItem value="yes">Permitir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.allowsCompanions && (
                <div className="space-y-1.5">
                  <Label htmlFor="event-companions">Máximo por servidor</Label>
                  <Input
                    id="event-companions"
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxCompanionsPerServer}
                    onChange={event =>
                      setForm({ ...form, maxCompanionsPerServer: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Registramos apenas a quantidade, sem dados pessoais dos acompanhantes.
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-background" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={create.isPending || form.title.trim().length < 3 || !form.startAt}
              onClick={() =>
                create.mutate({
                  title: form.title.trim(),
                  type: form.type,
                  location: form.location.trim() || null,
                  description: form.description.trim() || null,
                  startAt: new Date(form.startAt),
                  endAt: form.endAt ? new Date(form.endAt) : null,
                  allowsCompanions: form.allowsCompanions,
                  maxCompanionsPerServer: Number(form.maxCompanionsPerServer) || 0,
                })
              }
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={respondEvent !== null} onOpenChange={open => !open && setRespondEvent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{respondEvent?.name}</DialogTitle>
            <DialogDescription>Informe se poderá participar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Resposta</Label>
              <Select
                value={response.response}
                onValueChange={value =>
                  setResponse({ ...response, response: value as ParticipationResponse })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERESTED">Tenho interesse</SelectItem>
                  <SelectItem value="REGISTERED">Quero me inscrever</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmo participação</SelectItem>
                  <SelectItem value="DECLINED">Não vou participar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companions">Acompanhantes</Label>
              <Input
                id="companions"
                type="number"
                min={0}
                max={20}
                value={response.companionsCount}
                onChange={event =>
                  setResponse({ ...response, companionsCount: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Observação (opcional)</Label>
              <Textarea
                id="note"
                rows={2}
                value={response.note}
                onChange={event => setResponse({ ...response, note: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setRespondEvent(null)}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={respond.isPending || !respondingServerId}
              onClick={() =>
                respondEvent &&
                respondingServerId &&
                respond.mutate({
                  eventId: respondEvent.id,
                  serverId: respondingServerId,
                  response: response.response,
                  companionsCount: Number(response.companionsCount) || 0,
                  note: response.note.trim() || null,
                })
              }
            >
              {respond.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
