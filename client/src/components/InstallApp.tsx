import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallContext = createContext({ installed: false, install: async () => false });

export function InstallAppProvider({ children }: { children: ReactNode }) {
  const prompt = useRef<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const remember = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPromptEvent;
    };
    const onInstalled = () => {
      prompt.current = null;
      setInstalled(true);
    };
    update();
    standalone.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", remember);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      standalone.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", remember);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  async function install() {
    const request = prompt.current;
    if (!request) return false;
    prompt.current = null;
    try {
      await request.prompt();
      return true;
    } catch {
      return false;
    }
  }
  return <InstallContext.Provider value={{ installed, install }}>{children}</InstallContext.Provider>;
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { installed, install } = useContext(InstallContext);
  const [helpOpen, setHelpOpen] = useState(false);
  if (installed) return null;
  return (
    <>
      <Button type="button" variant="outline" size={compact ? "icon" : "sm"} aria-label="Instalar app" title="Instalar app"
        onClick={async () => { if (!(await install())) setHelpOpen(true); }}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {!compact && "Instalar app"}
      </Button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar Servidores do Altar</DialogTitle>
            <DialogDescription>Abra o sistema em um navegador como Chrome, Edge ou Safari. Não é preciso baixar pela loja.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm">
            <li><strong>iPhone ou iPad:</strong> no Safari, toque em Compartilhar → Adicionar à Tela de Início. Se aparecer, ative Abrir como App da Web.</li>
            <li><strong>Android:</strong> no Chrome, abra o menu ⋮ → Adicionar à tela inicial → Instalar.</li>
            <li><strong>Computador:</strong> no Chrome, abra o menu ⋮ → Transmitir, salvar e compartilhar → Instalar página como app.</li>
          </ul>
          <p className="text-sm text-muted-foreground">Use o mesmo login. A consulta e a atualização das escalas precisam de internet.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
