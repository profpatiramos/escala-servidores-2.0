/**
 * Detalhe do servidor: dados pastorais, responsáveis vinculados, habilitações e
 * credencial de acesso.
 *
 * O bloco de responsáveis existe porque um menor sem responsável ativo é um
 * problema de proteção, não um detalhe de cadastro. O backend recusa encerrar o
 * último vínculo de um menor; aqui a interface deixa isso visível antes de a
 * pessoa tentar.
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  GraduationCap,
  KeyRound,
  Loader2,
  Trash2,
  UserPlus,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { errorMessage, formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  FORMATION_STATUS_LABELS,
  QUALIFICATION_LABELS,
  QUALIFICATION_STATUS,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TYPES,
  type FormationStatus,
  type QualificationStatus,
  type RelationshipType,
} from "@shared/domain";

export default function ServerDetail() {
  const params = useParams<{ id: string }>();
  const serverId = Number(params.id);
  const utils = trpc.useUtils();

  const detail = trpc.people.servers.get.useQuery(
    { id: serverId },
    { enabled: Number.isFinite(serverId) },
  );
  const responsiblesList = trpc.people.responsibles.list.useQuery({ includeInactive: false });
  const rolesList = trpc.availability.roles.list.useQuery({ includeInactive: false });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({
    responsibleId: "",
    relationshipType: "GUARDIAN" as RelationshipType,
    isPrimary: "no",
  });
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [qualOpen, setQualOpen] = useState(false);
  const [qualForm, setQualForm] = useState({
    parishRoleId: "",
    qualificationStatus: "QUALIFIED" as QualificationStatus,
  });
  const [formationOpen, setFormationOpen] = useState(false);
  const [formationForm, setFormationForm] = useState({ name: "", startedAt: "" });

  const invalidate = () => void utils.people.servers.get.invalidate({ id: serverId });

  const createLink = trpc.people.familyLinks.create.useMutation({
    onSuccess: () => {
      invalidate();
      setLinkOpen(false);
      setLinkForm({ responsibleId: "", relationshipType: "GUARDIAN", isPrimary: "no" });
      toast.success("Vínculo criado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const endLink = trpc.people.familyLinks.end.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Vínculo encerrado.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const issueReset = trpc.people.access.issuePinResetCode.useMutation({
    onSuccess: data => {
      setResetCode(data.code);
      invalidate();
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const setQualification = trpc.availability.qualifications.set.useMutation({
    onSuccess: () => {
      invalidate();
      setQualOpen(false);
      setQualForm({ parishRoleId: "", qualificationStatus: "QUALIFIED" });
      toast.success("Habilitação registrada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const createFormation = trpc.availability.formations.create.useMutation({
    onSuccess: () => {
      invalidate();
      setFormationOpen(false);
      setFormationForm({ name: "", startedAt: "" });
      toast.success("Formação registrada.");
    },
    onError: error => toast.error(errorMessage(error)),
  });

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
          <p className="font-medium">Servidor não encontrado</p>
          <Link href="/servidores" className="mt-2 inline-block text-sm text-primary underline">
            Voltar para servidores
          </Link>
        </CardContent>
      </Card>
    );
  }

  const server = detail.data;
  const activeLinks = server.responsibles.filter(link => link.status === "ACTIVE");
  const minorWithoutGuardian = server.isMinor && activeLinks.length === 0;
  const availableResponsibles = (responsiblesList.data ?? []).filter(
    candidate => !activeLinks.some(link => link.responsibleId === candidate.id),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/servidores"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Servidores
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
            <p className="text-sm text-muted-foreground">
              {server.age} anos
              {server.isMinor && " · menor de idade"}
              {server.birthDate ? ` · nasc. ${formatDate(server.birthDate)}` : ""}
            </p>
          </div>
          <Badge variant={server.status === "ACTIVE" ? "default" : "secondary"}>
            {server.status === "ACTIVE" ? "ativo" : server.status.toLowerCase()}
          </Badge>
        </div>
      </div>

      {minorWithoutGuardian && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Menor sem responsável ativo</p>
              <p className="text-muted-foreground">
                Vincule um responsável antes de escalar este servidor. Confirmações e autorizações
                de menores dependem de alguém responsável no sistema.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Responsáveis</CardTitle>
                <CardDescription>Quem responde por este servidor.</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 bg-background"
                onClick={() => setLinkOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Vincular
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {server.responsibles.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Nenhum responsável vinculado.
              </p>
            ) : (
              <div className="divide-y">
                {server.responsibles.map(link => (
                  <div
                    key={link.linkId}
                    className="flex items-center justify-between gap-3 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {link.name}
                        {link.isPrimary && (
                          <Badge variant="outline" className="text-[10px]">
                            principal
                          </Badge>
                        )}
                        {link.status !== "ACTIVE" && (
                          <Badge variant="secondary" className="text-[10px]">
                            encerrado
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {RELATIONSHIP_LABELS[link.relationshipType as RelationshipType] ??
                          link.relationshipType}
                        {link.phone ? ` · ${link.phone}` : ""}
                      </p>
                    </div>
                    {link.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive"
                        disabled={endLink.isPending}
                        onClick={() => endLink.mutate({ linkId: link.linkId })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Encerrar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Acesso do servidor</CardTitle>
            <CardDescription>
              O PIN é armazenado apenas como hash e nunca é exibido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {server.access ? (
              <>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">ID de acesso</p>
                  <p className="font-mono text-sm font-medium">{server.access.accessId}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant={server.access.status === "ACTIVE" ? "default" : "secondary"}
                  >
                    {server.access.status === "ACTIVE"
                      ? "ativo"
                      : server.access.status === "PENDING_ACTIVATION"
                        ? "aguardando ativação"
                        : server.access.status.toLowerCase()}
                  </Badge>
                  {server.access.lockedUntil &&
                    new Date(server.access.lockedUntil).getTime() > Date.now() && (
                      <Badge variant="destructive">bloqueado temporariamente</Badge>
                    )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 bg-background"
                  disabled={issueReset.isPending}
                  onClick={() => issueReset.mutate({ serverId })}
                >
                  {issueReset.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )}
                  Gerar código de redefinição
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este servidor ainda não tem credencial de acesso.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Habilitações</CardTitle>
                <CardDescription>Funções que este servidor pode exercer.</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="bg-background"
                onClick={() => setQualOpen(true)}
              >
                Definir
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {server.qualifications.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Nenhuma habilitação registrada. Sem habilitação, o servidor não aparece como
                elegível na montagem de escalas.
              </p>
            ) : (
              <div className="divide-y">
                {server.qualifications.map(qual => (
                  <div
                    key={qual.id}
                    className="flex items-center justify-between gap-3 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{qual.roleName}</p>
                      {qual.minAge !== null && (
                        <p className="text-xs text-muted-foreground">
                          idade mínima da função: {qual.minAge} anos
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        qual.status === "QUALIFIED"
                          ? "default"
                          : qual.status === "IN_TRAINING"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {QUALIFICATION_LABELS[qual.status as QualificationStatus] ?? qual.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Formações</CardTitle>
                <CardDescription>Trilha de formação litúrgica.</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 bg-background"
                onClick={() => setFormationOpen(true)}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Registrar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {server.formations.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Nenhuma formação registrada.
              </p>
            ) : (
              <div className="divide-y">
                {server.formations.map(formation => (
                  <div
                    key={formation.id}
                    className="flex items-center justify-between gap-3 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{formation.name}</p>
                      {formation.startedAt && (
                        <p className="text-xs text-muted-foreground">
                          início em {formatDate(formation.startedAt)}
                        </p>
                      )}
                    </div>
                    <Badge variant={formation.status === "COMPLETED" ? "default" : "secondary"}>
                      {FORMATION_STATUS_LABELS[formation.status as FormationStatus] ??
                        formation.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={qualOpen} onOpenChange={setQualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Definir habilitação</DialogTitle>
            <DialogDescription>
              A idade mínima da função é validada contra a data de nascimento do servidor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Função</Label>
              <Select
                value={qualForm.parishRoleId}
                onValueChange={value => setQualForm({ ...qualForm, parishRoleId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(rolesList.data ?? []).length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma função cadastrada
                    </SelectItem>
                  ) : (
                    (rolesList.data ?? []).map(role => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select
                value={qualForm.qualificationStatus}
                onValueChange={value =>
                  setQualForm({ ...qualForm, qualificationStatus: value as QualificationStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALIFICATION_STATUS.map(status => (
                    <SelectItem key={status} value={status}>
                      {QUALIFICATION_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-background" onClick={() => setQualOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={setQualification.isPending || !qualForm.parishRoleId}
              onClick={() =>
                setQualification.mutate({
                  serverId,
                  parishRoleId: Number(qualForm.parishRoleId),
                  qualificationStatus: qualForm.qualificationStatus,
                })
              }
            >
              {setQualification.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formationOpen} onOpenChange={setFormationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar formação</DialogTitle>
            <DialogDescription>
              Formações ficam registradas no histórico do servidor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="formation-name">Nome da formação</Label>
              <Input
                id="formation-name"
                value={formationForm.name}
                onChange={event => setFormationForm({ ...formationForm, name: event.target.value })}
                placeholder="Curso de turíbulo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="formation-start">Data de início</Label>
              <Input
                id="formation-start"
                type="date"
                value={formationForm.startedAt}
                onChange={event =>
                  setFormationForm({ ...formationForm, startedAt: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setFormationOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={createFormation.isPending || formationForm.name.trim().length < 2}
              onClick={() =>
                createFormation.mutate({
                  serverId,
                  name: formationForm.name.trim(),
                  status: "IN_PROGRESS",
                  startedAt: formationForm.startedAt || null,
                })
              }
            >
              {createFormation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular responsável</DialogTitle>
            <DialogDescription>
              O vínculo permite que o responsável confirme presenças e autorize participações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={linkForm.responsibleId}
                onValueChange={value => setLinkForm({ ...linkForm, responsibleId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {availableResponsibles.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhum responsável disponível
                    </SelectItem>
                  ) : (
                    availableResponsibles.map(candidate => (
                      <SelectItem key={candidate.id} value={String(candidate.id)}>
                        {candidate.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {availableResponsibles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Cadastre um responsável em{" "}
                  <Link href="/responsaveis" className="text-primary underline">
                    Responsáveis
                  </Link>
                  .
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Relação</Label>
              <Select
                value={linkForm.relationshipType}
                onValueChange={value =>
                  setLinkForm({ ...linkForm, relationshipType: value as RelationshipType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      {RELATIONSHIP_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vínculo principal</Label>
              <Select
                value={linkForm.isPrimary}
                onValueChange={value => setLinkForm({ ...linkForm, isPrimary: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Não</SelectItem>
                  <SelectItem value="yes">Sim — contato preferencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-background" onClick={() => setLinkOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={createLink.isPending || !linkForm.responsibleId}
              onClick={() =>
                createLink.mutate({
                  serverId,
                  responsibleId: Number(linkForm.responsibleId),
                  relationshipType: linkForm.relationshipType,
                  isPrimary: linkForm.isPrimary === "yes",
                })
              }
            >
              {createLink.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetCode !== null} onOpenChange={open => !open && setResetCode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Código de redefinição de PIN</DialogTitle>
            <DialogDescription>
              Entregue este código apenas ao responsável ou ao próprio servidor. Ele vale uma única
              vez.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="font-mono text-2xl font-semibold tracking-widest">{resetCode}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetCode(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
