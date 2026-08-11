/** Central de notificações in-app. */
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const utils = trpc.useUtils();
  const list = trpc.notifications.list.useQuery({ onlyUnread: false, limit: 50 });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.invalidate();
    },
  });
  const markAll = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.invalidate();
    },
  });

  const items = list.data ?? [];
  const hasUnread = items.some(item => !item.readAt);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            Avisos de escalas, confirmações, substituições e eventos.
          </p>
        </div>
        {hasUnread && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-background"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todas como lidas
          </Button>
        )}
      </header>

      {list.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma notificação</p>
            <p className="text-sm text-muted-foreground">
              Você será avisado quando houver novidades nas escalas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!item.readAt) markRead.mutate({ id: item.id });
              }}
              className={cn(
                "w-full rounded-lg border p-4 text-left transition-colors",
                item.readAt ? "bg-card" : "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </span>
                  {!item.readAt && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

