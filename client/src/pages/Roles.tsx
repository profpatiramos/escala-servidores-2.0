/**
 * Gestão das funções litúrgicas da paróquia.
 *
 * As funções são a base de tudo: definem quantas vagas uma celebração tem, quem
 * é elegível e qual a idade mínima. Inativar uma função preserva o histórico das
 * escalas passadas, por isso não existe exclusão.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, ShieldCheck, Users } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type RoleForm = {
  name: string;
  description: string;
  minAge: string;
  requiresQualification: boolean;
  displayOrder: string;
};

const emptyForm: RoleForm = {
  name: "",
  description: "",
  minAge: "",
  requiresQualification: true,
  displayOrder: "0",
};

export default function Roles() {
  const utils = trpc.useUtils();
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);

  const rolesQuery = trpc.availability.roles.list.useQuery({ includeInactive: showInactive });

  const invalidate = () => {
    utils.availability.roles.list.invalidate();
  };

  const createMutation = trpc.availability.roles.create.useMutation({
    onSuccess: () => {
      toast.success("Função criada.");
      setDialogOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const updateMutation = trpc.availability.roles.update.useMutation({
    onSuccess: () => {
      toast.success("Função atualizada.");
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(role: {
    id: number;
    name: string;
    description: string | null;
    minAge: number | null;
    requiresQualification: boolean;
    displayOrder: number;
  }) {
    setEditingId(role.id);
    setForm({
      name: role.name,
      description: role.description ?? "",
      minAge: role.minAge === null ? "" : String(role.minAge),
      requiresQualification: role.requiresQualification,
      displayOrder: String(role.displayOrder),
    });
    setDialogOpen(true);
  }

  function submit() {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      minAge: form.minAge.trim() ? Number(form.minAge) : null,
      requiresQualification: form.requiresQualification,
      displayOrder: Number(form.displayOrder) || 0,
    };

    if (!payload.name || payload.name.length < 2) {
      toast.error("Informe o nome da função.");
      return;
    }

    if (editingId === null) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: editingId, ...payload });
    }
  }

  function toggleStatus(role: { id: number; name: string; status: string }) {
    const next = role.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    updateMutation.mutate({ id: role.id, status: next });
  }

  const roles = rolesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funções litúrgicas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Defina as funções que existem na sua paróquia, a idade mínima de cada uma e se exigem
            habilitação prévia.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Mostrar inativas
          </label>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova função
          </Button>
        </div>
      </div>

      {rolesQuery.isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando funções…
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="text-muted-foreground mx-auto h-10 w-10" />
            <p className="mt-4 font-medium">Nenhuma função cadastrada</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Crie as funções da sua paróquia para poder montar escalas.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Criar a primeira função
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map(role => (
            <Card key={role.id} className={role.status === "INACTIVE" ? "opacity-70" : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{role.name}</CardTitle>
                    {role.description ? (
                      <CardDescription className="mt-1">{role.description}</CardDescription>
                    ) : null}
                  </div>
                  {role.status === "INACTIVE" ? (
                    <Badge variant="secondary">Inativa</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="bg-muted/40">
                    {role.minAge === null ? "Sem idade mínima" : `A partir de ${role.minAge} anos`}
                  </Badge>
                  {role.requiresQualification ? (
                    <Badge variant="outline" className="bg-muted/40">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Exige habilitação
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted/40">
                      Sem habilitação obrigatória
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="bg-background" onClick={() => openEdit(role)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleStatus(role)}
                    disabled={updateMutation.isPending}
                  >
                    {role.status === "ACTIVE" ? "Inativar" : "Reativar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId === null ? "Nova função" : "Editar função"}</DialogTitle>
            <DialogDescription>
              A idade mínima é verificada automaticamente na montagem da escala. Funções que exigem
              habilitação só aceitam servidores marcados como habilitados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Nome da função</Label>
              <Input
                id="role-name"
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                placeholder="Cerimoniário"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-description">Descrição (opcional)</Label>
              <Textarea
                id="role-description"
                value={form.description}
                onChange={event => setForm({ ...form, description: event.target.value })}
                placeholder="O que esta função faz durante a celebração"
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-min-age">Idade mínima</Label>
                <Input
                  id="role-min-age"
                  type="number"
                  min={0}
                  max={99}
                  value={form.minAge}
                  onChange={event => setForm({ ...form, minAge: event.target.value })}
                  placeholder="Deixe vazio para não exigir"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-order">Ordem de exibição</Label>
                <Input
                  id="role-order"
                  type="number"
                  min={0}
                  max={999}
                  value={form.displayOrder}
                  onChange={event => setForm({ ...form, displayOrder: event.target.value })}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Switch
                checked={form.requiresQualification}
                onCheckedChange={checked => setForm({ ...form, requiresQualification: checked })}
              />
              <span className="text-sm">
                <span className="font-medium">Exigir habilitação</span>
                <span className="text-muted-foreground block">
                  Somente servidores marcados como habilitados nesta função poderão ser escalados.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId === null ? "Criar função" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
