import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { errorMessage } from "@/lib/format";

type Need = {
  parishRoleId: number;
  quantity: number;
  requirements?: string | null;
};
export default function CelebrationNeeds({
  celebrationId,
  needs,
  assignedRoleIds,
}: {
  celebrationId: number;
  needs: Need[];
  assignedRoleIds: number[];
}) {
  const [draft, setDraft] = useState<Need[] | null>(null);
  const roles = trpc.availability.roles.list.useQuery({
    includeInactive: false,
  });
  const utils = trpc.useUtils();
  const save = trpc.schedules.celebrations.setNeeds.useMutation({
    onSuccess: async () => {
      await utils.schedules.invalidate();
      setDraft(null);
      toast.success("Funções necessárias salvas.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const valid =
    !!draft?.length &&
    draft.every(
      n =>
        n.parishRoleId > 0 &&
        Number.isInteger(n.quantity) &&
        n.quantity >= 1 &&
        n.quantity <= 50
    ) &&
    new Set(draft.map(n => n.parishRoleId)).size === draft.length;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setDraft(needs.map(n => ({ ...n })))}
      >
        Definir funções necessárias
      </Button>
      <Dialog
        open={draft !== null}
        onOpenChange={open => {
          if (!open && !save.isPending) setDraft(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Funções necessárias</DialogTitle>
            <DialogDescription>
              Informe quantos servidores são necessários em cada função. Funções
              com servidores escalados devem ser mantidas.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {roles.isError && (
              <p role="alert">
                Não foi possível carregar as funções.{" "}
                <Button variant="link" onClick={() => void roles.refetch()}>
                  Tentar novamente
                </Button>
              </p>
            )}
            {draft?.map((need, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  aria-label={`Função ${index + 1}`}
                  className="min-w-0 flex-1 rounded border bg-background p-2"
                  value={need.parishRoleId}
                  disabled={
                    save.isPending ||
                    assignedRoleIds.includes(need.parishRoleId)
                  }
                  onChange={e =>
                    setDraft(
                      draft.map((n, i) =>
                        i === index
                          ? { ...n, parishRoleId: Number(e.target.value) }
                          : n
                      )
                    )
                  }
                >
                  <option value={0}>Selecione a função</option>
                  {need.parishRoleId > 0 &&
                    !roles.data?.some(r => r.id === need.parishRoleId) && (
                      <option value={need.parishRoleId}>
                        Função atual #{need.parishRoleId}
                      </option>
                    )}
                  {roles.data?.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Quantidade da função ${index + 1}`}
                  type="number"
                  min={1}
                  max={50}
                  className="w-20"
                  value={need.quantity}
                  disabled={save.isPending}
                  onChange={e =>
                    setDraft(
                      draft.map((n, i) =>
                        i === index
                          ? { ...n, quantity: Number(e.target.value) }
                          : n
                      )
                    )
                  }
                />
                <Button
                  variant="ghost"
                  disabled={
                    save.isPending ||
                    assignedRoleIds.includes(need.parishRoleId)
                  }
                  onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                >
                  Remover
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={save.isPending || roles.isLoading || roles.isError}
              onClick={() =>
                setDraft([...(draft ?? []), { parishRoleId: 0, quantity: 1 }])
              }
            >
              Adicionar função
            </Button>
            {draft &&
              new Set(draft.map(n => n.parishRoleId)).size !== draft.length && (
                <p role="alert" className="text-sm text-destructive">
                  Cada função deve aparecer apenas uma vez.
                </p>
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setDraft(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={!valid || save.isPending}
              onClick={() =>
                draft && save.mutate({ celebrationId, needs: draft })
              }
            >
              Salvar funções
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
