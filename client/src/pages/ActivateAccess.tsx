/**
 * Primeiro acesso do servidor.
 *
 * Exige o código de uso único entregue pela coordenação ou pelo responsável.
 * Intencionalmente não usa data de nascimento como prova de identidade: esse
 * dado circula entre colegas e permitiria a uma criança acessar a conta de outra.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";
import { trpc } from "@/lib/trpc";

export default function ActivateAccess() {
  const [, navigate] = useLocation();
  const [accessId, setAccessId] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const activate = trpc.access.activateServerAccess.useMutation({
    onSuccess: () => {
      toast.success("Acesso ativado. Agora entre com seu ID e o novo PIN.");
      navigate("/");
    },
    onError: error => toast.error(errorMessage(error, "Não foi possível ativar o acesso.")),
  });

  const pinsMatch = pin.length > 0 && pin === confirmPin;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para o acesso
        </Link>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <CardTitle>Ativar meu acesso</CardTitle>
            <CardDescription>
              Use o código que a coordenação ou seu responsável entregou para você.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                if (!pinsMatch) {
                  toast.error("Os dois PINs precisam ser iguais.");
                  return;
                }
                activate.mutate({
                  accessId: accessId.trim().toUpperCase(),
                  activationCode: code.trim().toUpperCase(),
                  newPin: pin,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="activateAccessId">ID de acesso</Label>
                <Input
                  id="activateAccessId"
                  className="h-11 text-center font-semibold uppercase tracking-[0.2em]"
                  value={accessId}
                  onChange={event => setAccessId(event.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="activationCode">Código de ativação</Label>
                <Input
                  id="activationCode"
                  className="h-11 text-center font-semibold uppercase tracking-[0.2em]"
                  value={code}
                  onChange={event => setCode(event.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPin">Escolha seu PIN</Label>
                <Input
                  id="newPin"
                  type="password"
                  inputMode="numeric"
                  className="h-11 text-center tracking-[0.4em]"
                  value={pin}
                  onChange={event => setPin(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPin">Repita o PIN</Label>
                <Input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  className="h-11 text-center tracking-[0.4em]"
                  value={confirmPin}
                  onChange={event => setConfirmPin(event.target.value)}
                  required
                />
                {confirmPin.length > 0 && !pinsMatch && (
                  <p className="text-xs text-destructive">Os PINs não são iguais.</p>
                )}
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  Não use uma data de nascimento nem números em sequência como
                  1234. Seu PIN é só seu — não conte para os colegas.
                </AlertDescription>
              </Alert>

              <Button type="submit" className="w-full" disabled={activate.isPending}>
                {activate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ativar acesso
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

