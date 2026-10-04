/**
 * Tela de acesso.
 *
 * Duas modalidades convivem em abas: coordenação/responsáveis entram com e-mail
 * e senha; servidores e crianças entram com ID de acesso e PIN. A aba de ID+PIN
 * usa campos grandes e linguagem simples porque parte do público são crianças.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Church, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/contexts/SessionContext";
import { errorMessage } from "@/lib/format";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, navigate] = useLocation();
  const { refetch } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessId, setAccessId] = useState("");
  const [pin, setPin] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const passwordLogin = trpc.access.loginWithPassword.useMutation({
    onSuccess: async result => {
      await refetch();
      toast.success(`Bem-vindo, ${result.displayName}.`);
      navigate(
        result.mustChangePassword
          ? "/trocar-senha"
          : result.role === "SUPER_ADMIN"
            ? "/admin"
            : "/painel"
      );
    },
    onError: error =>
      toast.error(errorMessage(error, "Não foi possível entrar.")),
  });

  const accessLogin = trpc.access.loginWithAccessId.useMutation({
    onSuccess: async result => {
      await refetch();
      toast.success(`Olá, ${result.displayName}!`);
      navigate(result.pinResetRequested ? "/trocar-pin" : "/minha-escala");
    },
    onError: error =>
      toast.error(errorMessage(error, "Não foi possível entrar.")),
  });

  const requestReset = trpc.access.requestPasswordReset.useMutation({
    onSuccess: () => {
      setResetOpen(false);
      setResetEmail("");
      // Mensagem deliberadamente neutra: confirmar que o e-mail existe
      // permitiria descobrir quem tem conta no sistema.
      toast.success(
        "Se este e-mail estiver cadastrado, as instruções foram enviadas."
      );
    },
    onError: error => toast.error(errorMessage(error)),
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
        {/* Painel de apresentação: some no mobile para dar espaço ao formulário. */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 22%, white 0, transparent 42%), radial-gradient(circle at 82% 78%, white 0, transparent 38%)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15">
                <Church className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm uppercase tracking-widest opacity-80">
                  Servidores do Altar
                </p>
                <h1 className="text-xl font-semibold">Escala Servidores</h1>
              </div>
            </div>
          </div>

          <div className="relative max-w-md space-y-6">
            <h2 className="text-3xl font-semibold leading-tight">
              Organize a escala do altar sem perder ninguém de vista.
            </h2>
            <p className="text-primary-foreground/80">
              Disponibilidade, confirmações, substituições e formação dos
              servidores em um só lugar — com respeito à privacidade das
              crianças e ao trabalho de quem coordena.
            </p>
            <ul className="space-y-3 text-sm text-primary-foreground/90">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Cada paróquia vê apenas os seus próprios dados.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Menores acessam sem precisar de e-mail próprio.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Nenhuma escala é publicada sem revisão do coordenador.
              </li>
            </ul>
          </div>

          <p className="relative text-xs text-primary-foreground/60">
            Uso pastoral. Dados de menores são tratados com proteção reforçada.
          </p>
        </aside>

        <main className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md space-y-6">
            <div className="lg:hidden">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Church className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Servidores do Altar
                  </p>
                  <h1 className="text-lg font-semibold">Escala Servidores</h1>
                </div>
              </div>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Entrar</CardTitle>
                <CardDescription>
                  Escolha como você acessa o sistema.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="password">
                  <TabsList className="mb-6 grid w-full grid-cols-2">
                    <TabsTrigger value="password" className="gap-2">
                      <Mail className="h-4 w-4" />
                      E-mail
                    </TabsTrigger>
                    <TabsTrigger value="access" className="gap-2">
                      <KeyRound className="h-4 w-4" />
                      ID e PIN
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="password">
                    <form
                      className="space-y-4"
                      onSubmit={event => {
                        event.preventDefault();
                        passwordLogin.mutate({ email, password });
                      }}
                    >
                      <div className="space-y-2">
                        <Label htmlFor="email">E-mail</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={event => setEmail(event.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Senha</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={event => setPassword(event.target.value)}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={passwordLogin.isPending}
                      >
                        {passwordLogin.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Entrar
                      </Button>
                      <button
                        type="button"
                        className="w-full text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        onClick={() => setResetOpen(true)}
                      >
                        Esqueci minha senha
                      </button>
                      <p className="text-xs text-muted-foreground">
                        Para coordenadores, administradores e responsáveis.
                      </p>
                    </form>
                  </TabsContent>

                  <TabsContent value="access">
                    <form
                      className="space-y-4"
                      onSubmit={event => {
                        event.preventDefault();
                        accessLogin.mutate({ accessId: accessId.trim(), pin });
                      }}
                    >
                      <div className="space-y-2">
                        <Label htmlFor="accessId">Seu ID de acesso</Label>
                        <Input
                          id="accessId"
                          // Campo maior e em maiúsculas: o ID é lido de um papel
                          // entregue pela coordenação, frequentemente por uma criança.
                          className="h-12 text-center text-lg font-semibold uppercase tracking-[0.2em]"
                          placeholder="ABC123"
                          autoComplete="off"
                          autoCapitalize="characters"
                          value={accessId}
                          onChange={event =>
                            setAccessId(event.target.value.toUpperCase())
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pin">Seu PIN</Label>
                        <Input
                          id="pin"
                          type="password"
                          inputMode="numeric"
                          className="h-12 text-center text-lg tracking-[0.4em]"
                          placeholder="••••"
                          autoComplete="off"
                          value={pin}
                          onChange={event => setPin(event.target.value)}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="h-12 w-full text-base"
                        disabled={accessLogin.isPending}
                      >
                        {accessLogin.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Entrar
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Não sabe seu ID ou esqueceu o PIN? Fale com a
                        coordenação ou com seu responsável — eles geram um
                        código novo para você.
                      </p>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground">
              Primeiro acesso de servidor?{" "}
              <a
                href="/ativar"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Ativar meu acesso
              </a>
            </p>
          </div>
        </main>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>
              Informe o e-mail cadastrado. Enviaremos as instruções de
              redefinição.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resetEmail">E-mail</Label>
            <Input
              id="resetEmail"
              type="email"
              value={resetEmail}
              onChange={event => setResetEmail(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => requestReset.mutate({ email: resetEmail })}
              disabled={requestReset.isPending || resetEmail.length === 0}
            >
              {requestReset.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Enviar instruções
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
