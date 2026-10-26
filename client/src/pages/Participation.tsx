import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  errorMessage,
  formatDate,
  formatDateTime,
  formatTime,
} from "@/lib/format";
import SubstitutionBoard from "@/components/SubstitutionBoard";
const dateOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export default function Participation() {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const celebrations = trpc.schedules.celebrations.list.useQuery({
    from: dateOffset(-30),
    to: dateOffset(90),
  });
  const report = trpc.participation.report.useQuery(
    { celebrationId: Number(selected) || 1 },
    { enabled: !!selected, refetchInterval: 30000 }
  );
  const extras = trpc.participation.extras.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const validate = trpc.participation.validatePresence.useMutation({
    onSuccess: result => {
      void utils.participation.report.invalidate();
      void utils.gamification.balance.invalidate();
      if (
        result.points &&
        !result.points.granted &&
        result.points.reason === "ERROR"
      )
        toast.error(
          "Presença salva, mas a pontuação falhou. Use Reprocessar pontuação para tentar novamente."
        );
      else toast.success("Presença validada e pontuação processada.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const review = trpc.participation.reviewExtra.useMutation({
    onSuccess: result => {
      void utils.participation.extras.invalidate();
      void utils.participation.report.invalidate();
      void utils.gamification.balance.invalidate();
      setReason("");
      if (
        result.points &&
        !result.points.granted &&
        result.points.reason === "ERROR"
      )
        toast.error(
          "Serviço validado, mas a pontuação falhou. Selecione a celebração e use Reprocessar pontuação."
        );
      else toast.success("Solicitação analisada.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Participações e check-in</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe confirmação, chegada, substituições e serviços fora da
          escala. Horários registrados pelo servidor do sistema.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirmações e chegadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="participation-celebration">Celebração</Label>
          <select
            id="participation-celebration"
            className="w-full rounded border bg-background p-2"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">Selecione uma celebração publicada</option>
            {celebrations.data
              ?.filter(c => c.scheduleStatus === "PUBLISHED")
              .map(c => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.date)} · {formatTime(c.startTime)} · {c.title}
                </option>
              ))}
          </select>
          {(celebrations.isError || report.isError) && (
            <p role="alert">Não foi possível carregar os registros.</p>
          )}
          {report.isLoading && selected && <p>Carregando…</p>}
          {report.data?.map(row => (
            <div
              key={row.assignmentId}
              className="space-y-2 rounded-lg border p-4"
            >
              <p className="font-medium">
                {row.serverName} · {row.roleName}
              </p>
              <p className="text-sm">
                Confirmação:{" "}
                {row.status === "CONFIRMED"
                  ? "confirmada"
                  : row.status === "DECLINED"
                    ? "não poderá participar"
                    : "aguardando resposta"}
                {row.respondedAt
                  ? ` · ${formatDateTime(row.respondedAt)} · ${row.early ? "com antecedência" : "após o prazo"}`
                  : ""}
              </p>
              <p className="text-sm">
                Check-in:{" "}
                {row.checkedInAt
                  ? `${formatDateTime(row.checkedInAt)} · ${row.checkinEarly ? "antes do início" : "após o início"}`
                  : "ainda não realizado"}
              </p>
              <p className="text-sm">
                Presença:{" "}
                {row.attendanceStatus === "PRESENT"
                  ? "validada pela coordenação"
                  : "a conferir"}
              </p>
              <Button
                size="sm"
                disabled={
                  validate.isPending ||
                  Date.now() < row.start ||
                  row.status === "DECLINED"
                }
                onClick={() =>
                  validate.mutate({ assignmentId: row.assignmentId })
                }
              >
                {row.attendanceStatus === "PRESENT"
                  ? "Reprocessar pontuação"
                  : "Validar presença e contabilizar pontos"}
              </Button>
            </div>
          ))}
          {selected && report.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum servidor ativo nesta escala.
            </p>
          )}
        </CardContent>
      </Card>
      <SubstitutionBoard />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Participações extras aguardando validação
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Confirme que o servidor realmente serviu. O sistema não concede
            pontos apenas pelo pedido.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="extra-review-reason">Observação da análise</Label>
          <Input
            id="extra-review-reason"
            maxLength={500}
            placeholder="Ex.: serviço conferido durante a celebração"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          {extras.isLoading ? (
            <p>Carregando solicitações…</p>
          ) : extras.isError ? (
            <p role="alert">Não foi possível carregar as solicitações.</p>
          ) : !extras.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum pedido pendente.
            </p>
          ) : (
            extras.data.map(row => (
              <div key={row.id} className="space-y-2 rounded border p-4">
                <p className="font-medium">{row.serverName}</p>
                <p className="text-sm">
                  {formatDate(row.date)} · {row.title}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={review.isPending || reason.trim().length < 3}
                    onClick={() =>
                      review.mutate({
                        requestId: row.id,
                        approve: true,
                        reason,
                      })
                    }
                  >
                    Confirmar serviço e conceder pontos
                  </Button>
                  <Button
                    variant="outline"
                    disabled={review.isPending || reason.trim().length < 3}
                    onClick={() =>
                      review.mutate({
                        requestId: row.id,
                        approve: false,
                        reason,
                      })
                    }
                  >
                    Recusar registro
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
