import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { errorMessage } from "@/lib/format";
type Preference = {
  weekday: number | null;
  period: "MORNING" | "AFTERNOON" | "EVENING" | null;
  parishRoleId: number | null;
  priority: number;
};
const weekdays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export default function ServerPreferences({ serverId }: { serverId: number }) {
  const utils = trpc.useUtils();
  const current = trpc.availability.preferences.listByServer.useQuery({
    serverId,
  });
  const roles = trpc.availability.roles.list.useQuery({
    includeInactive: false,
  });
  const [draft, setDraft] = useState<Preference[] | null>(null);
  const rows = draft ?? current.data ?? [];
  const save = trpc.availability.preferences.replace.useMutation({
    onSuccess: async () => {
      await utils.availability.preferences.listByServer.invalidate({
        serverId,
      });
      setDraft(null);
      toast.success("Preferências salvas.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  function change(index: number, patch: Partial<Preference>) {
    setDraft(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  const valid =
    (rows.length === 0 || rows.length >= 2) &&
    rows.every(
      r => r.weekday !== null || r.period !== null || r.parishRoleId !== null
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preferências para servir</CardTitle>
        <p className="text-sm text-muted-foreground">
          Escolha dias, períodos ou funções. As preferências orientam a
          montagem; não bloqueiam outros horários. Quando informadas, cadastre
          pelo menos duas.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {current.isLoading ? (
          <p>Carregando…</p>
        ) : current.isError || roles.isError ? (
          <p role="alert">
            Não foi possível carregar as preferências.{" "}
            <Button
              variant="outline"
              onClick={() => {
                void current.refetch();
                void roles.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma preferência cadastrada.
              </p>
            )}
            {rows.map((row, index) => (
              <div
                key={index}
                className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]"
              >
                <span className="text-sm font-medium">{index + 1}ª</span>
                <select
                  aria-label={`Dia da preferência ${index + 1}`}
                  className="rounded border bg-background p-2 text-sm"
                  disabled={save.isPending}
                  value={row.weekday ?? ""}
                  onChange={e =>
                    change(index, {
                      weekday:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Qualquer dia</option>
                  {weekdays.map((day, i) => (
                    <option key={i} value={i}>
                      {day}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Período da preferência ${index + 1}`}
                  className="rounded border bg-background p-2 text-sm"
                  disabled={save.isPending}
                  value={row.period ?? ""}
                  onChange={e =>
                    change(index, {
                      period: e.target.value
                        ? (e.target.value as Preference["period"])
                        : null,
                    })
                  }
                >
                  <option value="">Qualquer período</option>
                  <option value="MORNING">Manhã</option>
                  <option value="AFTERNOON">Tarde</option>
                  <option value="EVENING">Noite</option>
                </select>
                <select
                  aria-label={`Função da preferência ${index + 1}`}
                  className="rounded border bg-background p-2 text-sm"
                  disabled={save.isPending || roles.isLoading}
                  value={row.parishRoleId ?? ""}
                  onChange={e =>
                    change(index, {
                      parishRoleId: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Qualquer função</option>
                  {roles.data?.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => setDraft(rows.filter((_, i) => i !== index))}
                >
                  Remover
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={save.isPending || rows.length >= 20}
                onClick={() =>
                  setDraft([
                    ...rows,
                    {
                      weekday: null,
                      period: null,
                      parishRoleId: null,
                      priority: rows.length + 1,
                    },
                  ])
                }
              >
                Adicionar preferência
              </Button>
              <Button
                disabled={draft === null || save.isPending || !valid}
                onClick={() =>
                  save.mutate({
                    serverId,
                    preferences: rows.map((r, i) => ({
                      weekday: r.weekday,
                      period: r.period,
                      parishRoleId: r.parishRoleId,
                      priority: Math.min(i + 1, 10),
                    })),
                  })
                }
              >
                Salvar preferências
              </Button>
              {draft !== null && (
                <Button
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => setDraft(null)}
                >
                  Cancelar alterações
                </Button>
              )}
            </div>
            {!valid && (
              <p role="status" className="text-sm text-muted-foreground">
                Informe pelo menos duas opções e selecione um dia, período ou
                função em cada uma.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
