import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { errorMessage, formatDate } from "@/lib/format";
export default function ExtraParticipation() {
  const [celebration, setCelebration] = useState("");
  const [role, setRole] = useState("");
  const recent = trpc.participation.recent.useQuery();
  const roles = trpc.availability.roles.list.useQuery({
    includeInactive: false,
  });
  const utils = trpc.useUtils();
  const send = trpc.participation.requestExtra.useMutation({
    onSuccess: () => {
      toast.success(
        "Pedido enviado para conferência da coordenação. Os pontos serão concedidos após validação."
      );
      setCelebration("");
      setRole("");
      void utils.participation.extras.invalidate();
    },
    onError: e => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Servi sem estar escalado</CardTitle>
        <p className="text-sm text-muted-foreground">
          Solicite o registro de uma participação extra nos últimos sete dias. A
          coordenação confirma antes de conceder pontos e conquistas.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={e => {
            e.preventDefault();
            send.mutate({
              celebrationId: Number(celebration),
              parishRoleId: Number(role),
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="extra-celebration">Celebração</Label>
            <select
              id="extra-celebration"
              className="w-full rounded border bg-background p-2"
              value={celebration}
              onChange={e => setCelebration(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {recent.data?.map(c => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.date)} · {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="extra-role">Função em que serviu</Label>
            <select
              id="extra-role"
              className="w-full rounded border bg-background p-2"
              value={role}
              onChange={e => setRole(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {roles.data?.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {(recent.isError || roles.isError) && (
            <p role="alert">Não foi possível carregar as opções.</p>
          )}
          <Button
            type="submit"
            disabled={
              send.isPending ||
              !celebration ||
              !role ||
              recent.isError ||
              roles.isError
            }
          >
            Solicitar registro da participação
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
