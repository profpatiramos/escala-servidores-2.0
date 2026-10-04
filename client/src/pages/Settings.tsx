/**
 * Configurações da paróquia.
 *
 * As chaves sensíveis da gamificação (penalidade por ausência e ranking de
 * menores) aparecem com aviso explícito. Elas nascem desligadas por decisão de
 * especificação e ligá-las é um ato consciente do administrador — a interface
 * precisa deixar claro o que muda na vida das crianças, não só oferecer um
 * interruptor.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { errorMessage } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/contexts/SessionContext";
import { POINT_EVENT_LABELS, type PointEventType } from "@shared/domain";

const ROLE_LABELS: Record<string, string> = {
  PARISH_ADMIN: "Administrador da paróquia",
  COORDINATOR: "Coordenador",
  RESPONSIBLE: "Responsável",
};

export default function Settings() {
  const utils = trpc.useUtils();
  const { session } = useSession();
  const isPlatformAdmin = session?.role === "SUPER_ADMIN";
  const selectedParish =
    new URLSearchParams(window.location.search).get("paroquia") ?? (() => { try { return sessionStorage.getItem("managed-parish") ?? ""; } catch { return ""; } })();
  const hasParish =
    !!session && (!isPlatformAdmin || /^[1-9]\d*$/.test(selectedParish));
  const parishes = trpc.parishes.list.useQuery(undefined, {
    enabled: isPlatformAdmin,
  });
  const parish = trpc.parishes.current.useQuery(undefined, {
    enabled: hasParish,
  });
  const members = trpc.parishes.members.useQuery(undefined, {
    enabled: hasParish,
  });
  const gamification = trpc.gamification.settings.get.useQuery(undefined, {
    enabled: hasParish,
  });
  const rules = trpc.gamification.rules.list.useQuery(undefined, {
    enabled: hasParish,
  });

  const [deadlines, setDeadlines] = useState({
    confirmationDeadlineHours: "48",
    earlyConfirmationHours: "72",
    requireMinPreferences: false,
  });

  // Sincroniza o formulário quando os dados chegam, sem sobrescrever edições.
  const [deadlinesLoaded, setDeadlinesLoaded] = useState(false);
  useEffect(() => {
    if (deadlinesLoaded || !parish.data) return;
    const settings = (parish.data.settings ?? {}) as Record<string, unknown>;
    setDeadlines({
      confirmationDeadlineHours: String(
        settings.confirmationDeadlineHours ?? 48
      ),
      earlyConfirmationHours: String(settings.earlyConfirmationHours ?? 72),
      requireMinPreferences: Boolean(settings.requireMinPreferences ?? false),
    });
    setDeadlinesLoaded(true);
  }, [parish.data, deadlinesLoaded]);

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "COORDINATOR" as "PARISH_ADMIN" | "COORDINATOR" | "RESPONSIBLE",
    temporaryPassword: "",
  });

  const updateSettings = trpc.parishes.updateSettings.useMutation({
    onSuccess: () => {
      void utils.parishes.current.invalidate();
      toast.success("Prazos atualizados.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const updateGamification = trpc.gamification.settings.update.useMutation({
    onSuccess: () => {
      void utils.gamification.settings.get.invalidate();
      toast.success("Configuração de reconhecimento atualizada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const addMember = trpc.parishes.addMember.useMutation({
    onSuccess: () => {
      void utils.parishes.members.invalidate();
      setMemberOpen(false);
      setMemberForm({
        name: "",
        email: "",
        phone: "",
        role: "COORDINATOR",
        temporaryPassword: "",
      });
      toast.success("Membro adicionado à paróquia.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const removeMember = trpc.parishes.removeMember.useMutation({
    onSuccess: () => {
      void utils.parishes.members.invalidate();
      toast.success("Membro removido.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const g = gamification.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          {parish.data?.name ?? "Paróquia"} — prazos, equipe e reconhecimento.
        </p>
      </header>

      {isPlatformAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Selecionar paróquia</CardTitle>
            <CardDescription>
              Escolha a paróquia para gerenciar sua equipe, prazos e
              reconhecimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="managedParish">Paróquia</Label>
            <Select
              value={selectedParish}
              onValueChange={value => {
                window.location.href = `/configuracoes?paroquia=${encodeURIComponent(value)}`;
              }}
            >
              <SelectTrigger id="managedParish">
                <SelectValue placeholder="Selecione uma paróquia" />
              </SelectTrigger>
              <SelectContent>
                {(parishes.data ?? []).map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                    {item.city ? ` — ${item.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {parishes.error && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(parishes.error)}
              </p>
            )}
            {parish.error && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(parish.error)}
              </p>
            )}
            <Button variant="link" asChild>
              <a href="/admin">Voltar ao painel do SUPER_ADMIN</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {hasParish && !parish.error && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prazos de confirmação</CardTitle>
              <CardDescription>
                Definem até quando o servidor pode confirmar e a partir de
                quando a confirmação conta como antecipada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {parish.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="deadline">
                        Prazo de confirmação (horas antes)
                      </Label>
                      <Input
                        id="deadline"
                        type="number"
                        min={0}
                        max={336}
                        value={deadlines.confirmationDeadlineHours}
                        onChange={event =>
                          setDeadlines({
                            ...deadlines,
                            confirmationDeadlineHours: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="early">
                        Confirmação antecipada (horas antes)
                      </Label>
                      <Input
                        id="early"
                        type="number"
                        min={0}
                        max={336}
                        value={deadlines.earlyConfirmationHours}
                        onChange={event =>
                          setDeadlines({
                            ...deadlines,
                            earlyConfirmationHours: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="minPrefs">
                        Exigir preferências de horário
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Quando ativo, o servidor precisa indicar ao menos duas
                        preferências de horário.
                      </p>
                    </div>
                    <Switch
                      id="minPrefs"
                      checked={deadlines.requireMinPreferences}
                      onCheckedChange={checked =>
                        setDeadlines({
                          ...deadlines,
                          requireMinPreferences: checked,
                        })
                      }
                    />
                  </div>
                  <Button
                    className="gap-2"
                    disabled={updateSettings.isPending}
                    onClick={() =>
                      updateSettings.mutate({
                        confirmationDeadlineHours:
                          Number(deadlines.confirmationDeadlineHours) || 0,
                        earlyConfirmationHours:
                          Number(deadlines.earlyConfirmationHours) || 0,
                        requireMinPreferences: deadlines.requireMinPreferences,
                      })
                    }
                  >
                    {updateSettings.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvar prazos
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Reconhecimento e pontuação
              </CardTitle>
              <CardDescription>
                O reconhecimento é pastoral, não competitivo. Penalidade e
                ranking de menores vêm desligados por padrão.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gamification.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !g ? (
                <p className="text-sm text-muted-foreground">
                  Configuração de reconhecimento não encontrada para esta
                  paróquia.
                </p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label>Reconhecimento ativo</Label>
                      <p className="text-xs text-muted-foreground">
                        Registra pontos por participação e confirmação.
                      </p>
                    </div>
                    <Switch
                      checked={g.enabled}
                      onCheckedChange={checked =>
                        updateGamification.mutate({ enabled: checked })
                      }
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label>Ranking visível</Label>
                      <p className="text-xs text-muted-foreground">
                        Exibe a classificação entre servidores adultos.
                      </p>
                    </div>
                    <Switch
                      checked={g.rankingEnabled}
                      onCheckedChange={checked =>
                        updateGamification.mutate({ rankingEnabled: checked })
                      }
                    />
                  </div>

                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label>Penalidade por ausência</Label>
                            <p className="text-xs text-muted-foreground">
                              Desconta pontos de quem falta. Pode desestimular a
                              participação de crianças cuja ausência não depende
                              delas.
                            </p>
                          </div>
                          <Switch
                            checked={g.penaltiesEnabled}
                            onCheckedChange={checked =>
                              updateGamification.mutate({
                                penaltiesEnabled: checked,
                              })
                            }
                          />
                        </div>
                        <Separator />
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label>Incluir menores no ranking</Label>
                            <p className="text-xs text-muted-foreground">
                              Expõe a classificação de crianças e adolescentes.
                              Requer o ranking ativo.
                            </p>
                          </div>
                          <Switch
                            checked={g.minorsRankingEnabled}
                            disabled={!g.rankingEnabled}
                            onCheckedChange={checked =>
                              updateGamification.mutate({
                                minorsRankingEnabled: checked,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {(rules.data ?? []).length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        Regras de pontuação
                      </p>
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Evento</TableHead>
                              <TableHead className="text-right">
                                Pontos
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(rules.data ?? []).map(rule => (
                              <TableRow key={rule.id}>
                                <TableCell className="text-sm">
                                  {rule.description ??
                                    POINT_EVENT_LABELS[
                                      rule.eventType as PointEventType
                                    ] ??
                                    rule.eventType}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {rule.points > 0
                                    ? `+${rule.points}`
                                    : rule.points}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Equipe da paróquia
                  </CardTitle>
                  <CardDescription>
                    Administradores, coordenadores e responsáveis.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 bg-background"
                  onClick={() => setMemberOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {members.isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (members.data ?? []).length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nenhum membro cadastrado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(members.data ?? []).map(member => (
                      <TableRow key={member.membershipId}>
                        <TableCell className="font-medium">
                          {member.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {member.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={removeMember.isPending}
                            onClick={() =>
                              removeMember.mutate({
                                membershipId: member.membershipId,
                              })
                            }
                          >
                            Remover
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar membro</DialogTitle>
                <DialogDescription>
                  A pessoa acessa com e-mail e a senha provisória, e deve
                  trocá-la no primeiro acesso.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="member-name">Nome</Label>
                  <Input
                    id="member-name"
                    value={memberForm.name}
                    onChange={event =>
                      setMemberForm({ ...memberForm, name: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="member-email">E-mail</Label>
                  <Input
                    id="member-email"
                    type="email"
                    value={memberForm.email}
                    onChange={event =>
                      setMemberForm({
                        ...memberForm,
                        email: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Papel</Label>
                  <Select
                    value={memberForm.role}
                    onValueChange={value =>
                      setMemberForm({
                        ...memberForm,
                        role: value as
                          "PARISH_ADMIN" | "COORDINATOR" | "RESPONSIBLE",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COORDINATOR">Coordenador</SelectItem>
                      <SelectItem value="PARISH_ADMIN">
                        Administrador da paróquia
                      </SelectItem>
                      <SelectItem value="RESPONSIBLE">Responsável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="member-password">Senha provisória</Label>
                  <Input
                    id="member-password"
                    value={memberForm.temporaryPassword}
                    onChange={event =>
                      setMemberForm({
                        ...memberForm,
                        temporaryPassword: event.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 8 caracteres, com letras e números.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="bg-background"
                  onClick={() => setMemberOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="gap-2"
                  disabled={
                    addMember.isPending ||
                    memberForm.name.trim().length < 3 ||
                    !memberForm.email.includes("@") ||
                    memberForm.temporaryPassword.length < 8
                  }
                  onClick={() =>
                    addMember.mutate({
                      name: memberForm.name.trim(),
                      email: memberForm.email.trim(),
                      phone: memberForm.phone.trim() || null,
                      role: memberForm.role,
                      temporaryPassword: memberForm.temporaryPassword,
                    })
                  }
                >
                  {addMember.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
