import { useState, type FormEvent } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  PauseCircle,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/contexts/SessionContext";
import { trpc } from "@/lib/trpc";
import { errorMessage } from "@/lib/format";

export default function PlatformAdmin() {
  const { session } = useSession();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const parishes = trpc.parishes.list.useQuery(undefined, {
    enabled: session?.role === "SUPER_ADMIN",
  });

  const create = trpc.parishes.create.useMutation({
    onSuccess: () => {
      toast.success("Paróquia cadastrada. Ela está aguardando sua liberação.");
      setOpen(false);
      void utils.parishes.list.invalidate();
      setForm(initialForm);
    },
    onError: error =>
      toast.error(
        errorMessage(error, "Não foi possível cadastrar a paróquia.")
      ),
  });

  const setStatus = trpc.parishes.setStatus.useMutation({
    onSuccess: () => {
      toast.success("Status da paróquia atualizado.");
      void utils.parishes.list.invalidate();
    },
    onError: error =>
      toast.error(errorMessage(error, "Não foi possível alterar o status.")),
  });

  const [form, setForm] = useState(initialForm);

  if (session?.role !== "SUPER_ADMIN") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta área é exclusiva da administração da plataforma.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function update(field: keyof typeof initialForm, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      name: form.name,
      legalName: form.legalName || null,
      city: form.city || null,
      state: form.state || null,
      phone: form.phone || null,
      email: form.parishEmail || null,
      adminName: form.adminName,
      adminEmail: form.adminEmail,
      adminPassword: form.adminPassword,
      timezone: "America/Sao_Paulo",
    });
  }

  const rows = parishes.data ?? [];
  const active = rows.filter(p => p.status === "ACTIVE").length;
  const waiting = rows.filter(p => p.status === "INACTIVE").length;
  const suspended = rows.filter(p => p.status === "SUSPENDED").length;

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium">
              Administração da plataforma
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Paróquias</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre as paróquias participantes e libere o acesso somente depois
            de validar a adesão.
          </p>
        </div>
        <Button onClick={() => setOpen(value => !value)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova paróquia
        </Button>
      </header>

      {open && (
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar paróquia</CardTitle>
            <CardDescription>
              A paróquia será criada como <strong>aguardando liberação</strong>.
              Depois da adesão, você poderá ativá-la nesta mesma tela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <Field
                label="Nome da paróquia"
                value={form.name}
                onChange={v => update("name", v)}
                required
              />
              <Field
                label="CNPJ / razão social (opcional)"
                value={form.legalName}
                onChange={v => update("legalName", v)}
              />
              <Field
                label="Cidade"
                value={form.city}
                onChange={v => update("city", v)}
              />
              <Field
                label="Estado"
                value={form.state}
                onChange={v => update("state", v)}
              />
              <Field
                label="Telefone"
                value={form.phone}
                onChange={v => update("phone", v)}
              />
              <Field
                label="E-mail da paróquia"
                type="email"
                value={form.parishEmail}
                onChange={v => update("parishEmail", v)}
              />

              <div className="md:col-span-2 border-t pt-4">
                <p className="mb-3 font-medium">
                  Administrador inicial da paróquia
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Nome"
                    value={form.adminName}
                    onChange={v => update("adminName", v)}
                    required
                  />
                  <Field
                    label="E-mail de acesso"
                    type="email"
                    value={form.adminEmail}
                    onChange={v => update("adminEmail", v)}
                    required
                  />
                  <Field
                    label="Senha inicial"
                    type="password"
                    value={form.adminPassword}
                    onChange={v => update("adminPassword", v)}
                    required
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  No primeiro acesso, o administrador será obrigado a trocar
                  essa senha.
                </p>
              </div>

              <div className="flex justify-end gap-2 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cadastrar paróquia
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat icon={CheckCircle2} label="Liberadas" value={active} />
        <Stat icon={Clock3} label="Aguardando liberação" value={waiting} />
        <Stat icon={PauseCircle} label="Suspensas" value={suspended} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Paróquias cadastradas</CardTitle>
          <CardDescription>
            A suspensão bloqueia novas sessões e invalida o acesso já existente
            na próxima validação da sessão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {parishes.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando
              paróquias...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma paróquia cadastrada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map(parish => (
                <div
                  key={parish.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{parish.name}</p>
                      <StatusBadge status={parish.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[parish.city, parish.state]
                        .filter(Boolean)
                        .join(" / ") || "Localização não informada"}
                      {" · "}
                      {parish.activeServers} servidor(es) ativo(s)
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" asChild>
                      <a href={`/configuracoes?paroquia=${parish.id}`}>
                        Gerenciar equipe
                      </a>
                    </Button>
                    {parish.status !== "ACTIVE" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          setStatus.mutate({
                            parishId: parish.id,
                            status: "ACTIVE",
                          })
                        }
                        disabled={setStatus.isPending}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Liberar acesso
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setStatus.mutate({
                            parishId: parish.id,
                            status: "SUSPENDED",
                          })
                        }
                        disabled={setStatus.isPending}
                      >
                        <PauseCircle className="mr-2 h-4 w-4" />
                        Suspender
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Use Gerenciar equipe para cadastrar administradores e coordenadores na
          paróquia escolhida. O administrador da paróquia cuida da estrutura local,
          dos servidores e das escalas.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge>LIBERADA</Badge>;
  if (status === "SUSPENDED")
    return <Badge variant="destructive">SUSPENSA</Badge>;
  return <Badge variant="secondary">AGUARDANDO LIBERAÇÃO</Badge>;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const initialForm = {
  name: "",
  legalName: "",
  city: "",
  state: "",
  phone: "",
  parishEmail: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};
