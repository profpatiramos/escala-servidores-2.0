/**
 * Cadastro pastoral de servidores.
 *
 * A lista mostra o estado da credencial junto ao nome porque o problema mais
 * comum na prática é o servidor que nunca ativou o acesso — e ninguém percebe
 * até ele não conseguir confirmar presença.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  KeyRound,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Unlock,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { calculateAge, errorMessage, formatDate, isMinor } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { ServerStatus } from "@shared/domain";
import PeopleImport from "@/components/PeopleImport";

const STATUS_OPTIONS: Array<{ value: ServerStatus; label: string }> = [
  { value: "IN_FORMATION", label: "Em formação" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
];

const STATUS_LABELS: Record<string, string> = {
  IN_FORMATION: "Em formação",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};

export default function Servers() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [codeDialog, setCodeDialog] = useState<{
    name: string;
    code: string;
    expiresAt?: Date;
  } | null>(null);

  const [form, setForm] = useState({
    name: "",
    birthDate: "",
    heightCm: "",
    fatherName: "",
    motherName: "",
    status: "IN_FORMATION" as ServerStatus,
  });

  const query = useMemo(
    () => ({
      search: search.trim().length > 0 ? search.trim() : undefined,
      includeInactive,
    }),
    [search, includeInactive]
  );

  const list = trpc.people.servers.list.useQuery(query);

  const create = trpc.people.servers.create.useMutation({
    onSuccess: () => {
      void utils.people.servers.list.invalidate();
      setCreateOpen(false);
      setForm({
        name: "",
        birthDate: "",
        heightCm: "",
        fatherName: "",
        motherName: "",
        status: "IN_FORMATION",
      });
      toast.success(
        "Servidor cadastrado. Gere o código de ativação para o primeiro acesso."
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const issueCode = trpc.people.access.issuePinResetCode.useMutation({
    onSuccess: result => {
      setCodeDialog({
        name: result.serverName,
        code: result.code,
        expiresAt: result.expiresAt,
      });
      void utils.people.servers.list.invalidate();
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const createAccess = trpc.people.access.create.useMutation({
    onSuccess: () => {
      void utils.people.servers.list.invalidate();
      toast.success(
        "Credencial criada. Gere o código de ativação para entregar ao servidor."
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const setBlocked = trpc.people.access.setBlocked.useMutation({
    onSuccess: (_data, variables) => {
      void utils.people.servers.list.invalidate();
      toast.success(
        variables.blocked ? "Acesso bloqueado." : "Acesso desbloqueado."
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servidores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro pastoral, habilitações e credenciais de acesso.
          </p>
        </div>
        <div className="flex gap-2">
          <PeopleImport />
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo servidor
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome"
              className="pl-9"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="includeInactive"
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
            <Label htmlFor="includeInactive" className="text-sm">
              Mostrar inativos
            </Label>
          </div>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserRound className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum servidor encontrado</p>
              <p className="text-sm text-muted-foreground">
                Cadastre os servidores do altar para começar a montar escalas.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(server => {
            const age = calculateAge(server.birthDate);
            const minor = isMinor(server.birthDate);

            return (
              <Card key={server.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/servidores/${server.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {server.name}
                      </Link>
                      <Badge variant="outline">
                        {STATUS_LABELS[server.status] ?? server.status}
                      </Badge>
                      {minor && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          menor
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {age !== null ? `${age} anos` : "Idade não informada"}
                      {server.joinedAt
                        ? ` · desde ${formatDate(server.joinedAt)}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {server.accessId ? (
                        <>
                          ID de acesso:{" "}
                          <span className="font-mono">{server.accessId}</span>
                          {" · "}
                          {server.accessStatus === "PENDING_ACTIVATION"
                            ? "aguardando ativação"
                            : server.accessStatus === "BLOCKED"
                              ? "bloqueado"
                              : server.lastLoginAt
                                ? "acesso ativo"
                                : "ativo, sem primeiro login"}
                        </>
                      ) : (
                        "Sem credencial de acesso"
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!server.accessId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 bg-background"
                        onClick={() =>
                          createAccess.mutate({ serverId: server.id })
                        }
                        disabled={createAccess.isPending}
                      >
                        <KeyRound className="h-4 w-4" />
                        Criar credencial
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-background"
                          onClick={() =>
                            issueCode.mutate({ serverId: server.id })
                          }
                          disabled={issueCode.isPending}
                        >
                          <KeyRound className="h-4 w-4" />
                          Gerar código
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-2"
                          onClick={() =>
                            setBlocked.mutate({
                              serverId: server.id,
                              blocked: server.accessStatus !== "BLOCKED",
                            })
                          }
                          disabled={setBlocked.isPending}
                        >
                          {server.accessStatus === "BLOCKED" ? (
                            <>
                              <Unlock className="h-4 w-4" />
                              Desbloquear
                            </>
                          ) : (
                            <>
                              <Lock className="h-4 w-4" />
                              Bloquear
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo servidor</DialogTitle>
            <DialogDescription>
              Menores não precisam de e-mail: o acesso é feito por ID e PIN.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                value={form.name}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">Data de nascimento</Label>
              <Input
                id="birthDate"
                type="date"
                value={form.birthDate}
                onChange={event =>
                  setForm({ ...form, birthDate: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heightCm">Altura em cm (opcional)</Label>
              <Input
                id="heightCm"
                type="number"
                inputMode="numeric"
                placeholder="145"
                value={form.heightCm}
                onChange={event =>
                  setForm({ ...form, heightCm: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherName">Nome da mãe (opcional)</Label>
              <Input
                id="motherName"
                value={form.motherName}
                onChange={event =>
                  setForm({ ...form, motherName: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherName">Nome do pai (opcional)</Label>
              <Input
                id="fatherName"
                value={form.fatherName}
                onChange={event =>
                  setForm({ ...form, fatherName: event.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="status">Situação</Label>
              <Select
                value={form.status}
                onValueChange={value =>
                  setForm({ ...form, status: value as ServerStatus })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                create.mutate({
                  name: form.name.trim(),
                  birthDate: form.birthDate,
                  heightCm:
                    form.heightCm.length > 0 ? Number(form.heightCm) : null,
                  fatherName:
                    form.fatherName.trim().length > 0
                      ? form.fatherName.trim()
                      : null,
                  motherName:
                    form.motherName.trim().length > 0
                      ? form.motherName.trim()
                      : null,
                  status: form.status,
                  createAccess: true,
                })
              }
              disabled={
                create.isPending ||
                form.name.trim().length < 3 ||
                form.birthDate.length === 0
              }
            >
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O código aparece uma única vez: é entregue em mão, não fica guardado em tela. */}
      <Dialog
        open={codeDialog !== null}
        onOpenChange={open => !open && setCodeDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Código de ativação</DialogTitle>
            <DialogDescription>
              Entregue este código a {codeDialog?.name}. Ele serve uma única vez
              e não poderá ser consultado depois.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/50 p-6 text-center">
            <p className="font-mono text-3xl font-semibold tracking-[0.3em]">
              {codeDialog?.code}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCodeDialog(null)}>Entendi, anotei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
