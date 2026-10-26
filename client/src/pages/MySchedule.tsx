import SubstitutionBoard from "@/components/SubstitutionBoard";
import ExtraParticipation from "@/components/ExtraParticipation";
import ServerPreferences from "@/components/ServerPreferences";
/**
 * "Minha escala" — a tela que a criança e o servidor adulto usam.
 *
 * Linguagem direta e botões grandes: quem confirma presença aqui pode ter 10
 * anos e estar no celular do responsável.
 */
import { useMemo } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Repeat2,
  Trophy,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/contexts/SessionContext";
import { errorMessage, formatDateLong, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export default function MySchedule() {
  const { session } = useSession();
  const utils = trpc.useUtils();
  const [substitutionFor, setSubstitutionFor] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const pending = trpc.participation.mine.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const checkIn = trpc.participation.checkIn.useMutation({
    onSuccess: () => {
      void utils.participation.mine.invalidate();
      toast.success("Check-in registrado para conferência da coordenação.");
    },
    onError: e => toast.error(errorMessage(e)),
  });

  const balance = trpc.gamification.balance.useQuery(
    { serverId: session?.serverId ?? 0 },
    { enabled: typeof session?.serverId === "number" && session.serverId > 0 }
  );

  const respond = trpc.confirmations.respond.useMutation({
    onSuccess: (_data, variables) => {
      void utils.confirmations.pending.invalidate();
      void utils.participation.mine.invalidate();
      void utils.participation.board.invalidate();
      void utils.gamification.balance.invalidate();
      toast.success(
        variables.status === "CONFIRMED"
          ? "Presença confirmada. Obrigado!"
          : "Avisamos a coordenação que você não poderá ir."
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const requestSubstitution =
    trpc.confirmations.substitutions.request.useMutation({
      onSuccess: () => {
        setSubstitutionFor(null);
        setReason("");
        void utils.confirmations.pending.invalidate();
        void utils.participation.mine.invalidate();
        void utils.participation.board.invalidate();
        void utils.gamification.balance.invalidate();
        toast.success(
          "Pedido enviado. A coordenação vai buscar alguém para o seu lugar."
        );
      },
      onError: error => toast.error(errorMessage(error)),
    });

  const items = useMemo(
    () => (pending.data ?? []).filter(item => item.end >= Date.now()),
    [pending.data]
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {session?.displayName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirme sua participação, registre sua chegada e acompanhe pedidos de
          substituição.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Próximos serviços
              </p>
              {pending.isLoading ? (
                <Skeleton className="mt-1 h-7 w-10" />
              ) : (
                <p className="text-2xl font-semibold">{items.length}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Meus pontos
              </p>
              {balance.isLoading ? (
                <Skeleton className="mt-1 h-7 w-14" />
              ) : (
                <p className="text-2xl font-semibold">
                  {balance.data?.balance ?? 0}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Próxima celebração
              </p>
              {pending.isLoading ? (
                <Skeleton className="mt-1 h-7 w-20" />
              ) : (
                <p className="text-lg font-semibold">
                  {items[0]
                    ? formatDateLong(items[0].celebrationDate).split(",")[0]
                    : "—"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Onde você foi escalado</h2>

        {pending.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map(i => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              <p className="font-medium">Você está em dia!</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Não há nenhum serviço publicado para você agora. Quando a
                coordenação publicar uma nova escala, ela aparece aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <Card key={item.assignmentId}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {item.celebrationTitle}
                  </CardTitle>
                  <CardDescription>
                    {formatDateLong(item.celebrationDate)} às{" "}
                    {formatTime(item.celebrationStartTime)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    Sua função:{" "}
                    <span className="font-medium">{item.roleName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.respondedAt
                      ? item.early
                        ? "Resposta no prazo de antecedência."
                        : "Resposta após o prazo de antecedência."
                      : "Ainda sem confirmação."}{" "}
                    {item.checkedInAt
                      ? item.checkinEarly
                        ? "Check-in antes do início."
                        : "Check-in após o início."
                      : "Check-in disponível de 2h antes até o término da celebração."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="h-11 flex-1 sm:flex-none"
                      onClick={() =>
                        respond.mutate({
                          assignmentId: item.assignmentId,
                          status: "CONFIRMED",
                        })
                      }
                      disabled={
                        respond.isPending || item.status === "CONFIRMED"
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      <span>
                        {item.status === "CONFIRMED"
                          ? "Participação confirmada"
                          : "Confirmar participação"}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        checkIn.isPending ||
                        item.status !== "CONFIRMED" ||
                        !!item.checkedInAt ||
                        Date.now() < item.start - 7200000 ||
                        Date.now() > item.end
                      }
                      onClick={() =>
                        checkIn.mutate({ assignmentId: item.assignmentId })
                      }
                    >
                      <span>
                        {item.checkedInAt
                          ? "Check-in registrado"
                          : "Fazer check-in"}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setSubstitutionFor(item.assignmentId)}
                    >
                      Preciso de substituto
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <SubstitutionBoard />
      <ExtraParticipation />
      {session?.serverId && (
        <ServerPreferences key={session.serverId} serverId={session.serverId} />
      )}
      <Dialog
        open={substitutionFor !== null}
        onOpenChange={open => {
          if (!open) {
            setSubstitutionFor(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir substituição</DialogTitle>
            <DialogDescription>
              Conte para a coordenação por que você não poderá servir nesse dia.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder="Ex.: tenho prova na escola nesse horário"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubstitutionFor(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (substitutionFor === null) return;
                requestSubstitution.mutate({
                  assignmentId: substitutionFor,
                  reason,
                });
              }}
              disabled={
                requestSubstitution.isPending || reason.trim().length < 3
              }
            >
              Enviar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
