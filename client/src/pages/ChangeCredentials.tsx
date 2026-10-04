import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useSession } from "@/contexts/SessionContext";
import { trpc } from "@/lib/trpc";
import { errorMessage } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ChangeCredentials() {
  const { session, refetch } = useSession();
  const [, navigate] = useLocation();
  const isPin = session?.actorType === "SERVER";
  const label = isPin ? "PIN" : "senha";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const changePassword = trpc.access.changePassword.useMutation();
  const changePin = trpc.access.changePin.useMutation();
  const busy = changePassword.isPending || changePin.isPending;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirmation) {
      toast.error("A confirmação não confere.");
      return;
    }
    try {
      if (isPin)
        await changePin.mutateAsync({ currentPin: current, newPin: next });
      else
        await changePassword.mutateAsync({
          currentPassword: current,
          newPassword: next,
        });
      setCurrent("");
      setNext("");
      setConfirmation("");
      await refetch();
      toast.success(isPin ? "PIN atualizado." : "Senha atualizada.");
      navigate(
        isPin
          ? "/minha-escala"
          : session?.role === "SUPER_ADMIN"
            ? "/admin"
            : "/painel"
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{isPin ? "Trocar PIN" : "Trocar senha"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="current-secret">
              {isPin ? "PIN atual" : "Senha atual"}
            </Label>
            <Input
              id="current-secret"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="new-secret">
              {isPin ? "Novo PIN" : "Nova senha"}
            </Label>
            <Input
              id="new-secret"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm-secret">Confirmar {label}</Label>
            <Input
              id="confirm-secret"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
