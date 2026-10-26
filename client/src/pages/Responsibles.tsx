/**
 * Cadastro de responsáveis.
 *
 * A conta de acesso é opcional de propósito: muitos pais participam da vida da
 * paróquia sem querer (ou sem poder) usar um sistema, e o cadastro precisa
 * funcionar para contato e vínculo mesmo sem login.
 */
import { useState } from "react";
import { Loader2, Search, UserPlus, Users, KeyRound } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_LABELS,
  type RelationshipType,
} from "@shared/domain";
import { Link } from "wouter";

export default function Responsibles() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const list = trpc.people.responsibles.list.useQuery({
    includeInactive: false,
  });
  const [open, setOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<{
    id: number;
    name: string;
    email: string;
  } | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginConfirmation, setLoginConfirmation] = useState("");
  const enableLogin = trpc.people.responsibles.enableLogin.useMutation({
    onSuccess: () => {
      void utils.people.responsibles.list.invalidate();
      setLoginTarget(null);
      setLoginEmail("");
      setLoginPassword("");
      setLoginConfirmation("");
      toast.success(
        "Login habilitado. O responsável deve trocar a senha provisória no primeiro acesso."
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [initialServer, setInitialServer] = useState("");
  const [initialRelationship, setInitialRelationship] =
    useState<RelationshipType>("GUARDIAN");
  const [initialPrimary, setInitialPrimary] = useState(false);
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    null
  );
  const [serverId, setServerId] = useState("");
  const [relationship, setRelationship] =
    useState<RelationshipType>("GUARDIAN");
  const [primary, setPrimary] = useState(false);
  const servers = trpc.people.servers.list.useQuery(
    { includeInactive: false },
    { enabled: selected !== null || open }
  );
  const createLink = trpc.people.familyLinks.create.useMutation({
    onSuccess: () => {
      void utils.people.responsibles.list.invalidate();
      void utils.people.servers.list.invalidate();
      void utils.people.servers.get.invalidate();
      setServerId("");
      toast.success("Servidor vinculado ao responsável.");
    },
    onError: error => toast.error(errorMessage(error)),
  });
  const linkedServers = (servers.data ?? []).filter(server =>
    server.responsibles.some(responsible => responsible.id === selected?.id)
  );
  const availableServers = (servers.data ?? []).filter(
    server =>
      !server.responsibles.some(responsible => responsible.id === selected?.id)
  );
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    temporaryPassword: "",
  });

  const create = trpc.people.responsibles.create.useMutation({
    onSuccess: () => {
      void utils.people.responsibles.list.invalidate();
      void utils.people.servers.list.invalidate();
      void utils.people.servers.get.invalidate();
      setOpen(false);
      setForm({
        name: "",
        phone: "",
        email: "",
        notes: "",
        temporaryPassword: "",
      });
      toast.success("Responsável cadastrado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const update = trpc.people.responsibles.update.useMutation({
    onSuccess: () => {
      void utils.people.responsibles.list.invalidate();
      void utils.people.servers.list.invalidate();
      void utils.people.servers.get.invalidate();
      setOpen(false);
      toast.success("Responsável atualizado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });
  const saving = create.isPending || update.isPending;

  const rows = (list.data ?? []).filter(row =>
    search.trim()
      ? row.name.toLowerCase().includes(search.trim().toLowerCase())
      : true
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-gradient-to-br from-primary/5 via-card to-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Responsáveis
          </h1>
          <p className="text-sm text-muted-foreground">
            Pais e responsáveis legais dos servidores da paróquia.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setEditingId(null);
            setForm({
              name: "",
              phone: "",
              email: "",
              notes: "",
              temporaryPassword: "",
            });
            setInitialServer("");
            setInitialRelationship("GUARDIAN");
            setInitialPrimary(false);
            setOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4" />
          Novo responsável
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Responsáveis", value: list.data?.length ?? 0 },
          {
            label: "Com acesso",
            value: list.data?.filter(r => r.userId).length ?? 0,
          },
          {
            label: "Sem acesso",
            value: list.data?.filter(r => !r.userId).length ?? 0,
          },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold tabular-nums">
                {list.isLoading ? "—" : stat.value}
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {stat.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError ? (
        <Card>
          <CardContent className="space-y-3 p-6" role="alert">
            <p>Não foi possível carregar os responsáveis.</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {search.trim()
                ? "Nenhum responsável encontrado"
                : "Nenhum responsável cadastrado"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cadastre os responsáveis para poder vinculá-los aos servidores
              menores de idade.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Dependentes</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block md:table-row-group">
                {rows.map(row => (
                  <TableRow
                    key={row.id}
                    className="grid grid-cols-2 items-start gap-2 p-4 md:table-row md:p-0"
                  >
                    <TableCell className="col-span-2 font-medium md:w-[22%]">
                      {row.name}
                    </TableCell>
                    <TableCell className="col-span-2 text-sm text-muted-foreground md:w-[25%]">
                      <p>{row.phone || "Sem telefone"}</p>
                      <p className="break-all">{row.email || "Sem e-mail"}</p>
                    </TableCell>
                    <TableCell>
                      <span className="mr-1 text-muted-foreground md:hidden">
                        Dependentes:
                      </span>
                      {row.dependents}
                    </TableCell>
                    <TableCell>
                      {row.userId ? (
                        <Badge variant="default">com login</Badge>
                      ) : (
                        <Badge variant="outline">sem login</Badge>
                      )}
                    </TableCell>
                    <TableCell className="col-span-2 space-x-2 space-y-2 md:space-y-0">
                      {!row.userId && (
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setLoginTarget({
                              id: row.id,
                              name: row.name,
                              email: row.email ?? "",
                            });
                            setLoginEmail(row.email ?? "");
                            setLoginPassword("");
                            setLoginConfirmation("");
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Habilitar login
                          <span className="sr-only"> de {row.name}</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            name: row.name,
                            phone: row.phone ?? "",
                            email: row.email ?? "",
                            notes: row.notes ?? "",
                            temporaryPassword: "",
                          });
                          setOpen(true);
                        }}
                      >
                        Editar<span className="sr-only"> {row.name}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected({ id: row.id, name: row.name });
                          setServerId("");
                          setRelationship("GUARDIAN");
                          setPrimary(false);
                        }}
                      >
                        Vincular servidor
                        <span className="sr-only"> a {row.name}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={loginTarget !== null}
        onOpenChange={value => {
          if (!value && !enableLogin.isPending) {
            setLoginTarget(null);
            setLoginPassword("");
            setLoginConfirmation("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Habilitar login do responsável</DialogTitle>
            <DialogDescription>
              {loginTarget?.name} continuará com o mesmo cadastro e os mesmos
              dependentes.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault();
              if (loginTarget && loginPassword === loginConfirmation)
                enableLogin.mutate({
                  id: loginTarget.id,
                  email: loginEmail.trim(),
                  temporaryPassword: loginPassword,
                });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="enable-email">E-mail de acesso</Label>
              <Input
                id="enable-email"
                type="email"
                autoComplete="off"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                required
                maxLength={320}
                disabled={enableLogin.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enable-password">Senha provisória</Label>
              <Input
                id="enable-password"
                type="password"
                autoComplete="new-password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                disabled={enableLogin.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Pelo menos 8 caracteres, com letras e números.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enable-confirm">Confirmar senha provisória</Label>
              <Input
                id="enable-confirm"
                type="password"
                autoComplete="new-password"
                value={loginConfirmation}
                onChange={e => setLoginConfirmation(e.target.value)}
                required
                disabled={enableLogin.isPending}
              />
              {loginConfirmation && loginConfirmation !== loginPassword && (
                <p role="alert" className="text-sm text-destructive">
                  As senhas precisam ser iguais.
                </p>
              )}
            </div>
            <p className="rounded-lg bg-muted p-3 text-sm">
              Entregue os dados ao responsável. Ele entra com e-mail e senha em
              /acesso e troca a senha no primeiro login. Esta ação não envia
              e-mail automaticamente.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={enableLogin.isPending}
                onClick={() => {
                  setLoginTarget(null);
                  setLoginPassword("");
                  setLoginConfirmation("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  enableLogin.isPending ||
                  !loginEmail.trim() ||
                  loginPassword.length < 8 ||
                  !/[a-zA-Z]/.test(loginPassword) ||
                  !/[0-9]/.test(loginPassword) ||
                  loginPassword !== loginConfirmation
                }
              >
                {enableLogin.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                <span>Habilitar acesso</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selected !== null}
        onOpenChange={value => {
          if (!value && !createLink.isPending) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular servidor</DialogTitle>
            <DialogDescription>
              Responsável: {selected?.name}. Selecione um servidor cadastrado
              para criar o vínculo familiar.
            </DialogDescription>
          </DialogHeader>
          {servers.isLoading ? (
            <Skeleton className="h-24" />
          ) : servers.isError ? (
            <div role="alert" className="space-y-2">
              <p>{errorMessage(servers.error)}</p>
              <Button variant="outline" onClick={() => void servers.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Servidores vinculados</p>
                {linkedServers.length ? (
                  linkedServers.map(server => (
                    <Link
                      key={server.id}
                      href={`/servidores/${server.id}`}
                      className="block text-sm text-primary underline"
                    >
                      {server.name}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum servidor vinculado.
                  </p>
                )}
              </div>
              {availableServers.length ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="link-server">Servidor</Label>
                    <select
                      id="link-server"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={serverId}
                      onChange={event => setServerId(event.target.value)}
                      disabled={createLink.isPending}
                    >
                      <option value="">Selecione o servidor</option>
                      {availableServers.map(server => (
                        <option key={server.id} value={server.id}>
                          {server.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="link-relationship">
                      Parentesco ou relação
                    </Label>
                    <select
                      id="link-relationship"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={relationship}
                      onChange={event =>
                        setRelationship(event.target.value as RelationshipType)
                      }
                      disabled={createLink.isPending}
                    >
                      {RELATIONSHIP_TYPES.map(type => (
                        <option key={type} value={type}>
                          {RELATIONSHIP_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={primary}
                      onChange={event => setPrimary(event.target.checked)}
                      disabled={createLink.isPending}
                    />
                    Usar como contato principal deste servidor
                  </label>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Não há outros servidores disponíveis. Cadastre novos
                  servidores na página{" "}
                  <Link href="/servidores" className="text-primary underline">
                    Servidores
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={createLink.isPending}
              onClick={() => setSelected(null)}
            >
              Fechar
            </Button>
            <Button
              disabled={
                !selected ||
                !serverId ||
                servers.isFetching ||
                servers.isError ||
                createLink.isPending
              }
              onClick={() => {
                if (selected)
                  createLink.mutate({
                    responsibleId: selected.id,
                    serverId: Number(serverId),
                    relationshipType: relationship,
                    isPrimary: primary,
                  });
              }}
            >
              {createLink.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={value => {
          if (!saving) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar responsável" : "Novo responsável"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Atualize os dados de contato do responsável. Os vínculos existentes serão mantidos."
                : "Cadastre o responsável e selecione o servidor para salvar o vínculo junto."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resp-name">Nome</Label>
              <Input
                id="resp-name"
                value={form.name}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="resp-phone">Telefone</Label>
                <Input
                  id="resp-phone"
                  value={form.phone}
                  onChange={event =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resp-email">E-mail</Label>
                <Input
                  id="resp-email"
                  type="email"
                  value={form.email}
                  onChange={event =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </div>
            </div>
            {!editingId && (
              <div className="space-y-1.5">
                <Label htmlFor="resp-password">
                  Senha provisória (opcional)
                </Label>
                <Input
                  id="resp-password"
                  type="text"
                  value={form.temporaryPassword}
                  onChange={event =>
                    setForm({ ...form, temporaryPassword: event.target.value })
                  }
                  placeholder="Deixe vazio para não criar login"
                />
                <p className="text-xs text-muted-foreground">
                  Informe o e-mail junto com a senha para habilitar o acesso.
                </p>
              </div>
            )}
            {!editingId && (
              <div className="space-y-3 rounded-md border p-3">
                <Label htmlFor="resp-server">
                  Servidor do altar (opcional)
                </Label>
                <select
                  id="resp-server"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={initialServer}
                  onChange={event => setInitialServer(event.target.value)}
                  disabled={saving || servers.isLoading || servers.isError}
                >
                  <option value="">
                    {servers.isLoading
                      ? "Carregando servidores…"
                      : "Selecione um servidor cadastrado"}
                  </option>
                  {(servers.data ?? []).map(server => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
                {servers.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Não foi possível carregar os servidores.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void servers.refetch()}
                    >
                      Tentar novamente
                    </button>
                  </p>
                )}
                {!servers.isLoading &&
                  !servers.isError &&
                  !servers.data?.length && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum servidor cadastrado. Cadastre-o em Servidores para
                      poder selecioná-lo aqui.
                    </p>
                  )}
                {initialServer && (
                  <>
                    <Label htmlFor="resp-relationship">
                      Parentesco ou relação
                    </Label>
                    <select
                      id="resp-relationship"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={initialRelationship}
                      onChange={event =>
                        setInitialRelationship(
                          event.target.value as RelationshipType
                        )
                      }
                    >
                      {RELATIONSHIP_TYPES.map(type => (
                        <option key={type} value={type}>
                          {RELATIONSHIP_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={initialPrimary}
                        onChange={event =>
                          setInitialPrimary(event.target.checked)
                        }
                      />
                      Usar como contato principal deste servidor
                    </label>
                  </>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="resp-notes">Observações</Label>
              <Textarea
                id="resp-notes"
                rows={2}
                value={form.notes}
                onChange={event =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-background"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={saving || form.name.trim().length < 3}
              onClick={() => {
                const data = {
                  name: form.name.trim(),
                  phone: form.phone.trim() || null,
                  email: form.email.trim() || null,
                  notes: form.notes.trim() || null,
                };
                if (editingId) update.mutate({ id: editingId, ...data });
                else
                  create.mutate({
                    ...data,
                    temporaryPassword: form.temporaryPassword || null,
                    serverId: initialServer ? Number(initialServer) : undefined,
                    relationshipType: initialRelationship,
                    isPrimary: initialPrimary,
                  });
              }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
