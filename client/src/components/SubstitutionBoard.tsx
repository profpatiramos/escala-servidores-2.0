import { trpc } from "@/lib/trpc";
import { useSession } from "@/contexts/SessionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { errorMessage, formatDate, formatTime } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";
export default function SubstitutionBoard() {
  const [retryApproval, setRetryApproval] = useState<{
    requestId: number;
    replacementServerId: number;
  } | null>(null);
  const { session, isManager } = useSession();
  const utils = trpc.useUtils();
  const board = trpc.participation.board.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const refresh = () => {
    void utils.participation.board.invalidate();
    void utils.confirmations.substitutions.list.invalidate();
    void utils.participation.mine.invalidate();
    void utils.gamification.balance.invalidate();
  };
  const volunteer = trpc.participation.volunteer.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Candidatura enviada. Aguarde a aprovação da coordenação.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const approve = trpc.confirmations.substitutions.approve.useMutation({
    onSuccess: (r, variables) => {
      refresh();
      if (
        r.approved &&
        r.points &&
        !r.points.granted &&
        r.points.reason === "ERROR"
      ) {
        setRetryApproval(variables);
        toast.error(
          "Substituição aprovada, mas a pontuação falhou. Reenvie a aprovação para reprocessar os pontos."
        );
      } else if (r.approved) {
        setRetryApproval(null);
        toast.success(
          "Substituição aprovada. Pontuação contabilizada conforme as regras da paróquia."
        );
      } else toast.error(r.validation.blocking.map(v => v.message).join(" "));
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const reject = trpc.confirmations.substitutions.reject.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Solicitação encerrada.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Precisamos de substitutos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Vagas da sua paróquia. A candidatura passa pela coordenação; pontos de
          substituição são concedidos após a aprovação.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isManager && retryApproval && (
          <div role="alert" className="space-y-2">
            <p>
              A substituição foi aprovada. A pontuação ainda precisa ser
              reprocessada.
            </p>
            <Button
              disabled={approve.isPending}
              onClick={() => approve.mutate(retryApproval)}
            >
              Reprocessar pontos da substituição
            </Button>
          </div>
        )}
        {board.isLoading ? (
          <p>Carregando vagas…</p>
        ) : board.isError ? (
          <p role="alert">
            Não foi possível carregar as vagas.{" "}
            <Button variant="outline" onClick={() => void board.refetch()}>
              Tentar novamente
            </Button>
          </p>
        ) : !board.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Não há pedidos de substituição em aberto.
          </p>
        ) : (
          board.data.map(row => (
            <div key={row.id} className="space-y-2 rounded-lg border p-4">
              <p className="font-medium">{row.title}</p>
              <p className="text-sm">
                {formatDate(row.date)} · {formatTime(row.time)} · {row.roleName}
              </p>
              {row.replacementServerId ? (
                <p className="text-sm text-muted-foreground">
                  {row.candidateName ?? "Um servidor"} se candidatou. Aguardando
                  análise.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ainda sem candidato.
                </p>
              )}
              {session?.role === "SERVER" &&
                !row.replacementServerId &&
                row.originalServerId !== session.serverId && (
                  <Button
                    disabled={volunteer.isPending}
                    onClick={() => volunteer.mutate({ requestId: row.id })}
                  >
                    Posso substituir
                  </Button>
                )}
              {isManager && (
                <div className="flex flex-wrap gap-2">
                  {row.replacementServerId && (
                    <Button
                      disabled={approve.isPending}
                      onClick={() =>
                        approve.mutate({
                          requestId: row.id,
                          replacementServerId: row.replacementServerId!,
                        })
                      }
                    >
                      Aprovar candidato
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={reject.isPending}
                    onClick={() =>
                      reject.mutate({
                        requestId: row.id,
                        reviewNotes: "Solicitação encerrada pela coordenação.",
                      })
                    }
                  >
                    Encerrar solicitação
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
