import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Megaphone, Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/notifications")({
  component: TeacherNotificationsPage,
});

type Notif = { id: string; title: string; body: string | null; type: string | null; read: boolean; created_at: string };

function TeacherNotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["teacher-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,type,read,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const unread = data.filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("All marked as read"); qc.invalidateQueries({ queryKey: ["teacher-notifications"] }); },
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You're all caught up"}
        action={unread > 0 ? (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <Check className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        ) : null}
      />
      {isLoading ? (
        <div className="space-y-2"><div className="h-16 animate-pulse rounded-lg bg-muted" /><div className="h-16 animate-pulse rounded-lg bg-muted" /></div>
      ) : error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      ) : data.length === 0 ? (
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="py-10 text-center text-muted-foreground">
          <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" />No notifications yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map((n) => {
            const isBroadcast = n.type === "announcement";
            const Icon = isBroadcast ? Megaphone : Bell;
            return (
              <Card key={n.id} className={cn("shadow-[var(--shadow-card)]", !n.read && "border-primary/40 bg-primary/5")}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full",
                    isBroadcast ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{n.title}</p>
                        {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!n.read && <Badge variant="secondary">New</Badge>}
                        <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    {!n.read && (
                      <button className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() => markRead.mutate(n.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark as read
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
