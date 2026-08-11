/**
 * Cadastro de responsáveis.
 *
 * A conta de acesso é opcional de propósito: muitos pais participam da vida da
 * paróquia sem querer (ou sem poder) usar um sistema, e o cadastro precisa
 * funcionar para contato e vínculo mesmo sem login.
 */
import { useState } from "react";
import { Loader2, Search, UserPlus, Users } from "lucide-react";
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

export default function Responsibles() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const list = trpc.people.responsibles.list.useQuery({ includeInactive: false });
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setForm({ name: "", phone: "", email: "", notes: "", temporaryPassword: "" });
      toast.success("Responsável cadastrado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const rows = (list.data ?? []).filter(row =>
    search.trim() ? row.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Responsáveis</h1>
          <p className="text-sm text-muted-foreground">
            Pais e responsáveis legais dos servidores da paróquia.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Novo responsável
        </Button>
      </header>

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
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhum responsável cadastrado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cadastre os responsáveis para poder vinculá-los aos servidores menores de idade.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Dependentes</TableHead>
                  <TableHead>Acesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.phone ?? row.email ?? "—"}
                    </TableCell>
                    <TableCell>{row.dependents}</TableCell>
                    <TableCell>
                      {row.userId ? (
                        <Badge variant="default">com login</Badge>
                      ) : (
                        <Badge variant="outline">sem login</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo responsável</DialogTitle>
            <DialogDescription>
              A senha só é necessária se o responsável for acessar o sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resp-name">Nome</Label>
              <Input
                id="resp-name"
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="resp-phone">Telefone</Label>
                <Input
                  id="resp-phone"
                  value={form.phone}
                  onChange={event => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resp-email">E-mail</Label>
                <Input
                  id="resp-email"
                  type="email"
                  value={form.email}
                  onChange={event => setForm({ ...form, email: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resp-password">Senha provisória (opcional)</Label>
              <Input
                id="resp-password"
                type="text"
                value={form.temporaryPassword}
                onChange={event => setForm({ ...form, temporaryPassword: event.target.value })}
                placeholder="Deixe vazio para não criar login"
              />
              <p className="text-xs text-muted-foreground">
                Informe o e-mail junto com a senha para habilitar o acesso.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resp-notes">Observações</Label>
              <Textarea
                id="resp-notes"
                rows={2}
                value={form.notes}
                onChange={event => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-background" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={create.isPending || form.name.trim().length < 3}
              onClick={() =>
                create.mutate({
                  name: form.name.trim(),
                  phone: form.phone.trim() || null,
                  email: form.email.trim() || null,
                  notes: form.notes.trim() || null,
                  temporaryPassword: form.temporaryPassword.trim() || null,
                })
              }
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

