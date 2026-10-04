/** Agenda de celebrações e ponto de entrada para montar cada escala. */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ScheduleStatusBadge } from "@/pages/Dashboard";
import { errorMessage, formatDateLong, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";

import type { CelebrationType } from "@shared/domain";

const CELEBRATION_TYPE_OPTIONS: Array<{
  value: CelebrationType;
  label: string;
}> = [
  { value: "SUNDAY_MASS", label: "Missa dominical" },
  { value: "WEEKDAY_MASS", label: "Missa de semana" },
  { value: "SOLEMNITY", label: "Solenidade" },
  { value: "PROCESSION", label: "Procissão" },
  { value: "WEDDING", label: "Casamento" },
  { value: "FUNERAL", label: "Exéquias" },
  { value: "ADORATION", label: "Adoração" },
  { value: "OTHER", label: "Outra" },
];

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function Celebrations() {
  const utils = trpc.useUtils();
  const [from, setFrom] = useState(() => isoDate(0));
  const [to, setTo] = useState(() => isoDate(60));
  const [createOpen, setCreateOpen] = useState(false);
  const [copy, setCopy] = useState<{
    id: number;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const duplicate = trpc.schedules.celebrations.duplicate.useMutation({
    onSuccess: () => {
      void utils.schedules.celebrations.list.invalidate();
      setCopy(null);
      toast.success("Celebração duplicada com escala em rascunho.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const [form, setForm] = useState({
    title: "",
    celebrationType: "SUNDAY_MASS" as CelebrationType,
    date: isoDate(7),
    startTime: "19:00",
    // O backend exige término para poder detectar sobreposição de horários.
    endTime: "20:15",
    location: "",
  });

  const range = useMemo(() => ({ from, to }), [from, to]);
  const list = trpc.schedules.celebrations.list.useQuery(range);

  const create = trpc.schedules.celebrations.create.useMutation({
    onSuccess: () => {
      void utils.schedules.celebrations.list.invalidate();
      setCreateOpen(false);
      toast.success("Celebração cadastrada. A escala começa como rascunho.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Celebrações</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre as celebrações e monte a escala de cada uma.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova celebração
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="from" className="text-xs">
              De
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={event => setFrom(event.target.value)}
              className="w-auto"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs">
              Até
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={event => setTo(event.target.value)}
              className="w-auto"
            />
          </div>
          <p className="ml-auto text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "celebração" : "celebrações"}{" "}
            no período
          </p>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma celebração no período</p>
              <p className="text-sm text-muted-foreground">
                Ajuste as datas do filtro ou cadastre uma nova celebração.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(celebration => (
            <div key={celebration.id} className="flex items-center gap-2">
              <Link
                href={`/celebracoes/${celebration.id}`}
                className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{celebration.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateLong(celebration.date)} às{" "}
                      {formatTime(celebration.startTime)}
                      {celebration.location ? ` · ${celebration.location}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {celebration.status === "CANCELLED" && (
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                        Celebração cancelada
                      </span>
                    )}
                    <ScheduleStatusBadge status={celebration.scheduleStatus} />
                  </div>
                </div>
              </Link>
              <Button
                variant="outline"
                onClick={() =>
                  setCopy({
                    id: celebration.id,
                    title: celebration.title,
                    date: celebration.date,
                    startTime: celebration.startTime.slice(0, 5),
                    endTime: celebration.endTime.slice(0, 5),
                  })
                }
              >
                Duplicar
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova celebração</DialogTitle>
            <DialogDescription>
              Depois de criar, defina as funções necessárias e monte a escala.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                placeholder="Missa dominical das 19h"
                value={form.title}
                onChange={event =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select
                value={form.celebrationType}
                onValueChange={value =>
                  setForm({
                    ...form,
                    celebrationType: value as CelebrationType,
                  })
                }
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CELEBRATION_TYPE_OPTIONS.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={event =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Início</Label>
              <Input
                id="startTime"
                type="time"
                value={form.startTime}
                onChange={event =>
                  setForm({ ...form, startTime: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Término</Label>
              <Input
                id="endTime"
                type="time"
                value={form.endTime}
                onChange={event =>
                  setForm({ ...form, endTime: event.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location">Local (opcional)</Label>
              <Input
                id="location"
                placeholder="Igreja Matriz"
                value={form.location}
                onChange={event =>
                  setForm({ ...form, location: event.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                create.mutate({
                  title: form.title.trim(),
                  celebrationType: form.celebrationType,
                  date: form.date,
                  startTime: form.startTime,
                  endTime: form.endTime,
                  location:
                    form.location.trim().length > 0
                      ? form.location.trim()
                      : null,
                })
              }
              disabled={
                create.isPending ||
                form.title.trim().length < 3 ||
                form.endTime.length === 0
              }
            >
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar celebração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={copy !== null}
        onOpenChange={value => {
          if (!value && !duplicate.isPending) setCopy(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar celebração</DialogTitle>
            <DialogDescription>
              {copy?.title} — serão copiadas as funções e quantidades
              necessárias. A nova escala começa vazia, em rascunho, sem
              confirmações nem presenças.
            </DialogDescription>
          </DialogHeader>
          {copy && (
            <>
              <Label htmlFor="copyDate">Nova data</Label>
              <Input
                id="copyDate"
                type="date"
                value={copy.date}
                onChange={event =>
                  setCopy({ ...copy, date: event.target.value })
                }
              />
              <Label htmlFor="copyStart">Início</Label>
              <Input
                id="copyStart"
                type="time"
                value={copy.startTime}
                onChange={event =>
                  setCopy({ ...copy, startTime: event.target.value })
                }
              />
              <Label htmlFor="copyEnd">Término</Label>
              <Input
                id="copyEnd"
                type="time"
                value={copy.endTime}
                onChange={event =>
                  setCopy({ ...copy, endTime: event.target.value })
                }
              />
              <Button
                disabled={
                  duplicate.isPending ||
                  !copy.date ||
                  !copy.startTime ||
                  !copy.endTime
                }
                onClick={() =>
                  duplicate.mutate({
                    id: copy.id,
                    date: copy.date,
                    startTime: copy.startTime,
                    endTime: copy.endTime,
                  })
                }
              >
                {duplicate.isPending ? "Duplicando…" : "Criar cópia"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
