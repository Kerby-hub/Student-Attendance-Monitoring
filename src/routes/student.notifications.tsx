import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock, XCircle, Megaphone, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/notifications")({
  component: StudentNotificationsPage,
});

type Notif = { id: string; title: string; body: string | null; type: string | null; read: boolean; created_at: string };

function iconFor(type: string | null) {
  switch (type) {
    case "confirmation": return CheckCircle2;
    case "late": return Clock;
    case "absence": return XCircle;
    case "announcement": return Megaphone;
    default: return Bell;
  }
}
function toneFor(type: string | null) {
  switch (type) {
    case "confirmation": return "text-green-600 bg-green-500/10";
    case "late": return "text-yellow-600 bg-yellow-500/10";
    case "absence": return "text-destructive bg-destructive/10";
    case "announcement": return "text-primary bg-primary/10";
    default: return "text-muted-foreground bg-muted";
  }
}

function StudentNotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["my-notifications", user?.id],
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

  const unreadCount = data.filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("All marked as read"); qc.invalidateQueries({ queryKey: ["my-notifications"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <Check className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0,1,2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <Bell className="h-10 w-10" />
              <p>No notifications yet.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((n) => {
                const Icon = iconFor(n.type);
                return (
                  <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.read && "bg-primary/5")}>
                    <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", toneFor(n.type))}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{n.title}</p>
                          {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                        </div>
                        {!n.read && <Badge variant="secondary" className="shrink-0">New</Badge>}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{new Date(n.created_at).toLocaleString()}</span>
                        {!n.read && (
                          <button className="text-primary hover:underline" onClick={() => markRead.mutate(n.id)}>
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
