import { useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
export default function ResponsibleDependents({
  id,
  name,
  count,
}: {
  id: number;
  name: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const restoringFocus = useRef(false);
  const dependents = trpc.people.responsibles.dependents.useQuery(
    { id },
    { enabled: open }
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onMouseEnter={() => setOpen(true)}
          onFocus={() => {
            if (!restoringFocus.current) setOpen(true);
          }}
          onClick={e => {
            e.preventDefault();
            setOpen(true);
          }}
          aria-label={`Ver ${count} dependentes de ${name}`}
          className="h-8 min-w-8 text-primary underline decoration-dotted underline-offset-4"
        >
          {count}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        onOpenAutoFocus={e => e.preventDefault()}
        onCloseAutoFocus={() => {
          // Radix restores focus synchronously after this event. Preserve that
          // keyboard behavior without letting onFocus reopen the popover.
          restoringFocus.current = true;
          queueMicrotask(() => {
            restoringFocus.current = false;
          });
        }}
      >
        <p className="mb-3 text-sm font-semibold">Dependentes de {name}</p>
        {dependents.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : dependents.isError ? (
          <div role="alert">
            <p className="text-sm">Não foi possível carregar os vínculos.</p>
            <Button variant="link" onClick={() => void dependents.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : !dependents.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhum dependente vinculado.
          </p>
        ) : (
          <ul className="space-y-2">
            {dependents.data.map(server => (
              <li key={server.id}>
                <Link
                  href={`/servidores/${server.id}`}
                  className="block rounded-md p-2 text-sm text-primary hover:bg-accent focus-visible:outline-ring"
                  onClick={() => setOpen(false)}
                >
                  {server.name}
                  {server.status === "INACTIVE" && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (inativo)
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setOpen(false)}
        >
          Fechar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
